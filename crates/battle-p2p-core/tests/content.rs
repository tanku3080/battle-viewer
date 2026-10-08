use battle_p2p_core::content::{
    ContentError, MAX_COMPRESSED_SIZE, MAX_JSON_VALUES, MAX_UNCOMPRESSED_SIZE, Manifest, decode,
    encode,
};
use flate2::{Compression, write::GzEncoder};
use sha2::{Digest, Sha256};
use std::io::Write;

const SAMPLES: [&[u8]; 5] = [
    include_bytes!("../../../public/sample-battle.json"),
    include_bytes!("../../../public/sample2-battle.json"),
    include_bytes!("../../../public/sample3-encirclement.json"),
    include_bytes!("../../../public/sample4-breakthrough.json"),
    include_bytes!("../../../public/sample5-chase.json"),
];

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// Construct untrusted wire data without passing through the production encoder.
fn unchecked_wire(raw: &[u8]) -> (Manifest, Vec<u8>) {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::new(6));
    encoder.write_all(raw).unwrap();
    let gzip = encoder.finish().unwrap();
    (
        Manifest {
            protocol_version: 1,
            encoding: "gzip".into(),
            content_hash: hash(raw),
            compressed_hash: hash(&gzip),
            compressed_size: gzip.len() as u64,
            uncompressed_size: raw.len() as u64,
        },
        gzip,
    )
}

fn update_wire_manifest(manifest: &mut Manifest, gzip: &[u8]) {
    manifest.compressed_hash = hash(gzip);
    manifest.compressed_size = gzip.len() as u64;
}

#[test]
fn all_repository_samples_round_trip_exact_original_bytes() {
    for raw in SAMPLES {
        let (manifest, gzip) = encode(raw).unwrap();
        assert_eq!(manifest.protocol_version, 1);
        assert_eq!(manifest.encoding, "gzip");
        assert_eq!(manifest.content_hash, hash(raw));
        assert_eq!(manifest.compressed_hash, hash(&gzip));
        assert_eq!(manifest.uncompressed_size, raw.len() as u64);
        assert_eq!(manifest.compressed_size, gzip.len() as u64);
        assert_eq!(decode(&manifest, &gzip).unwrap(), raw);
    }
}

#[test]
fn creator_state_extensions_and_original_formatting_survive() {
    let mut document: serde_json::Value = serde_json::from_slice(SAMPLES[0]).unwrap();
    document["creatorState"] = serde_json::json!({
        "version": 2,
        "coordinateOrigin": "center",
        "items": [],
        "futureSchemaVersion": 731,
        "nestedEditorExtension": { "groupMoves": [1, 2, 3], "label": "編集情報" }
    });
    document["futureExtension"] = serde_json::json!({ "opaque": [null, true, 1.5] });
    let raw = format!(
        " \r\n{}\r\n \t",
        serde_json::to_string_pretty(&document).unwrap()
    );
    let (manifest, gzip) = encode(raw.as_bytes()).unwrap();
    assert_eq!(decode(&manifest, &gzip).unwrap(), raw.as_bytes());
}

#[test]
fn manifest_serialization_uses_the_protocol_wire_names() {
    let (manifest, _) = encode(SAMPLES[0]).unwrap();
    let json = serde_json::to_value(&manifest).unwrap();
    let object = json.as_object().unwrap();
    assert_eq!(object.len(), 6);
    for key in [
        "protocolVersion",
        "encoding",
        "contentHash",
        "compressedHash",
        "compressedSize",
        "uncompressedSize",
    ] {
        assert!(object.contains_key(key));
    }
    assert_eq!(serde_json::from_value::<Manifest>(json).unwrap(), manifest);
}

#[test]
fn malformed_manifest_fields_are_rejected() {
    let (manifest, _) = encode(SAMPLES[0]).unwrap();
    let mut invalid = manifest.clone();
    invalid.protocol_version = 2;
    assert!(invalid.validate().is_err());
    invalid = manifest.clone();
    invalid.encoding = "GZIP".into();
    assert!(invalid.validate().is_err());

    for value in ["", "abc", &"A".repeat(64), &"g".repeat(64), &"é".repeat(32)] {
        invalid = manifest.clone();
        invalid.content_hash = value.into();
        assert!(invalid.validate().is_err());
        invalid = manifest.clone();
        invalid.compressed_hash = value.into();
        assert!(invalid.validate().is_err());
    }
    for value in [0, MAX_COMPRESSED_SIZE + 1, u64::MAX] {
        invalid = manifest.clone();
        invalid.compressed_size = value;
        assert!(invalid.validate().is_err());
    }
    for value in [0, MAX_UNCOMPRESSED_SIZE + 1, u64::MAX] {
        invalid = manifest.clone();
        invalid.uncompressed_size = value;
        assert!(invalid.validate().is_err());
    }
    invalid = manifest;
    invalid.compressed_size = MAX_COMPRESSED_SIZE;
    invalid.uncompressed_size = MAX_UNCOMPRESSED_SIZE;
    assert!(invalid.validate().is_ok());
}

#[test]
fn manifest_deserialization_rejects_unknown_missing_and_wrongly_typed_fields() {
    let (manifest, _) = encode(SAMPLES[0]).unwrap();
    let original = serde_json::to_value(&manifest).unwrap();
    let mut json = original.clone();
    json["allowUnsafeContent"] = true.into();
    assert!(serde_json::from_value::<Manifest>(json).is_err());
    let mut json = original.clone();
    json.as_object_mut().unwrap().remove("contentHash");
    assert!(serde_json::from_value::<Manifest>(json).is_err());
    for value in [
        serde_json::json!(-1),
        serde_json::json!(1.5),
        serde_json::json!("1"),
    ] {
        let mut json = original.clone();
        json["uncompressedSize"] = value;
        assert!(serde_json::from_value::<Manifest>(json).is_err());
    }
    let json = serde_json::to_string(&manifest).unwrap();
    let duplicated = json.replacen('{', "{\"encoding\":\"gzip\",", 1);
    assert!(serde_json::from_str::<Manifest>(&duplicated).is_err());
}

#[test]
fn forged_compressed_and_raw_sizes_are_rejected() {
    let (manifest, gzip) = encode(SAMPLES[0]).unwrap();
    for delta in [-1_i64, 1] {
        let mut invalid = manifest.clone();
        invalid.compressed_size = (invalid.compressed_size as i64 + delta) as u64;
        assert!(matches!(
            decode(&invalid, &gzip),
            Err(ContentError::SizeMismatch("compressed"))
        ));
        invalid = manifest.clone();
        invalid.uncompressed_size = (invalid.uncompressed_size as i64 + delta) as u64;
        assert!(matches!(
            decode(&invalid, &gzip),
            Err(ContentError::SizeMismatch("uncompressed"))
        ));
    }
}

#[test]
fn both_wire_and_document_hashes_are_verified() {
    let (manifest, gzip) = encode(SAMPLES[0]).unwrap();
    let mut invalid = manifest.clone();
    invalid.compressed_hash = "0".repeat(64);
    assert!(matches!(
        decode(&invalid, &gzip),
        Err(ContentError::HashMismatch("compressed"))
    ));
    invalid = manifest;
    invalid.content_hash = "0".repeat(64);
    assert!(matches!(
        decode(&invalid, &gzip),
        Err(ContentError::HashMismatch("uncompressed"))
    ));
}

#[test]
fn gzip_crc_corruption_truncation_and_invalid_headers_are_rejected() {
    let (manifest, gzip) = encode(SAMPLES[0]).unwrap();
    let mut corrupt = gzip.clone();
    let crc_position = corrupt.len() - 8;
    corrupt[crc_position] ^= 0xff;
    let mut bad_header = gzip.clone();
    bad_header[0] = 0;
    for bytes in [corrupt, gzip[..gzip.len() - 1].to_vec(), bad_header] {
        let mut untrusted = manifest.clone();
        update_wire_manifest(&mut untrusted, &bytes);
        assert!(matches!(
            decode(&untrusted, &bytes),
            Err(ContentError::InvalidGzip(_))
        ));
    }
}

#[test]
fn gzip_trailing_bytes_and_concatenated_members_are_rejected() {
    let (manifest, gzip) = encode(SAMPLES[0]).unwrap();
    for suffix in [b"junk".as_slice(), b"\0".as_slice(), gzip.as_slice()] {
        let mut untrusted = manifest.clone();
        let mut bytes = gzip.clone();
        bytes.extend_from_slice(suffix);
        update_wire_manifest(&mut untrusted, &bytes);
        assert!(matches!(
            decode(&untrusted, &bytes),
            Err(ContentError::InvalidGzip(_))
        ));
    }
}

#[test]
fn inflation_stops_at_declared_size_plus_one() {
    let mut expanded = SAMPLES[0].to_vec();
    expanded.resize(MAX_UNCOMPRESSED_SIZE as usize + 1, b' ');
    let (mut manifest, gzip) = unchecked_wire(&expanded);
    // The wire hash is correct, but the payload is much larger than its claim.
    manifest.uncompressed_size = 1;
    assert!(matches!(
        decode(&manifest, &gzip),
        Err(ContentError::SizeMismatch("uncompressed"))
    ));
    manifest.uncompressed_size = MAX_UNCOMPRESSED_SIZE + 1;
    assert!(matches!(
        decode(&manifest, &gzip),
        Err(ContentError::SizeLimit("uncompressed"))
    ));
}

#[test]
fn invalid_utf8_syntax_trailing_json_and_duplicate_keys_fail_in_both_directions() {
    let malformed: &[&[u8]] = &[
        b"{\"bad\":\"\xff\"}",
        b"{\"a\":}",
        b"{\"a\":1,}",
        b"{} {}",
        b"{\"a\":1,\"a\":2}",
        b"{\"nested\":[{\"a\":1,\"\\u0061\":2}]}",
        b"{\"bad\":NaN}",
        b"{\"bad\":1e400}",
        b"{\"bad\":\"\\ud800\"}",
        b"\xef\xbb\xbf{}",
    ];
    for raw in malformed {
        assert!(matches!(encode(raw), Err(ContentError::InvalidJson(_))));
        let (manifest, gzip) = unchecked_wire(raw);
        assert!(matches!(
            decode(&manifest, &gzip),
            Err(ContentError::InvalidJson(_))
        ));
    }
}

#[test]
fn json_nesting_is_bounded() {
    let raw = format!("{}0{}", "[".repeat(512), "]".repeat(512));
    assert!(matches!(
        encode(raw.as_bytes()),
        Err(ContentError::InvalidJson(_))
    ));
    let (manifest, gzip) = unchecked_wire(raw.as_bytes());
    assert!(matches!(
        decode(&manifest, &gzip),
        Err(ContentError::InvalidJson(_))
    ));
}

#[test]
fn syntactically_valid_non_battle_documents_are_rejected() {
    for raw in [b"[]".as_slice(), b"null", b"{}", b"{\"map\":{}}"] {
        assert!(matches!(encode(raw), Err(ContentError::InvalidBattle(_))));
        let (manifest, gzip) = unchecked_wire(raw);
        assert!(matches!(
            decode(&manifest, &gzip),
            Err(ContentError::InvalidBattle(_))
        ));
    }
}

#[test]
fn compact_json_arrays_cannot_allocate_unbounded_value_nodes() {
    let raw = format!("[{}null]", "null,".repeat(MAX_JSON_VALUES));
    assert!(raw.len() < MAX_UNCOMPRESSED_SIZE as usize);
    match encode(raw.as_bytes()) {
        Err(ContentError::InvalidJson(message)) => assert!(message.contains("value count limit")),
        result => panic!("unexpected encoder result: {result:?}"),
    }
    let (manifest, gzip) = unchecked_wire(raw.as_bytes());
    match decode(&manifest, &gzip) {
        Err(ContentError::InvalidJson(message)) => assert!(message.contains("value count limit")),
        result => panic!("unexpected decoder result: {result:?}"),
    }
}

#[test]
fn raw_size_boundaries_are_enforced_and_maximum_is_accepted() {
    assert!(matches!(
        encode(&[]),
        Err(ContentError::SizeLimit("uncompressed"))
    ));
    let mut raw = SAMPLES[0].to_vec();
    raw.resize(MAX_UNCOMPRESSED_SIZE as usize, b' ');
    let (manifest, gzip) = encode(&raw).unwrap();
    assert_eq!(manifest.uncompressed_size, MAX_UNCOMPRESSED_SIZE);
    assert_eq!(decode(&manifest, &gzip).unwrap(), raw);
    raw.push(b' ');
    assert!(matches!(
        encode(&raw),
        Err(ContentError::SizeLimit("uncompressed"))
    ));
}

#[test]
fn compressed_uploads_above_the_limit_are_rejected() {
    let alphabet: Vec<u8> = (b'!'..=b'~')
        .filter(|b| *b != b'"' && *b != b'\\')
        .collect();
    let sample = std::str::from_utf8(SAMPLES[0]).unwrap().trim_end();
    let mut raw = sample.as_bytes()[..sample.len() - 1].to_vec();
    raw.extend_from_slice(b",\"p2pTestNoise\":\"");
    let mut random: u32 = 0x1234_5678;
    for _ in 0..12 * 1024 * 1024 {
        random ^= random << 13;
        random ^= random >> 17;
        random ^= random << 5;
        raw.push(alphabet[random as usize % alphabet.len()]);
    }
    raw.extend_from_slice(b"\"}");
    assert!(raw.len() < MAX_UNCOMPRESSED_SIZE as usize);
    assert!(matches!(
        encode(&raw),
        Err(ContentError::SizeLimit("compressed"))
    ));
}
