//! Bounded, byte-preserving encoding for the version 1 Battle content protocol.

use flate2::{Compression, bufread::GzDecoder, write::GzEncoder};
use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Number, Value};
use sha2::{Digest, Sha256};
use std::fmt;
use std::io::{Read, Write};
use thiserror::Error;

pub const MAX_COMPRESSED_SIZE: u64 = 8 * 1024 * 1024;
pub const MAX_UNCOMPRESSED_SIZE: u64 = 32 * 1024 * 1024;
/// Bounds allocations from compact arrays/objects before Battle validation.
pub const MAX_JSON_VALUES: usize = 1_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub protocol_version: u32,
    pub encoding: String,
    pub content_hash: String,
    pub compressed_hash: String,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
}

#[derive(Debug, Error)]
pub enum ContentError {
    #[error("Invalid content manifest: {0}")]
    InvalidManifest(String),
    #[error("{0} content size exceeds the allowed range")]
    SizeLimit(&'static str),
    #[error("{0} content size does not match the manifest")]
    SizeMismatch(&'static str),
    #[error("{0} SHA-256 does not match the manifest")]
    HashMismatch(&'static str),
    #[error("Invalid gzip content: {0}")]
    InvalidGzip(String),
    #[error("Invalid UTF-8 JSON: {0}")]
    InvalidJson(String),
    #[error("Invalid Battle JSON: {0}")]
    InvalidBattle(String),
    #[error("Content encoding failed: {0}")]
    Io(#[from] std::io::Error),
}

impl Manifest {
    pub fn validate(&self) -> Result<(), ContentError> {
        if self.protocol_version != 1 || self.encoding != "gzip" {
            return Err(ContentError::InvalidManifest(
                "unsupported protocol version or encoding".into(),
            ));
        }
        for (name, hash) in [
            ("contentHash", &self.content_hash),
            ("compressedHash", &self.compressed_hash),
        ] {
            if hash.len() != 64
                || !hash
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            {
                return Err(ContentError::InvalidManifest(format!(
                    "{name} must be a lowercase SHA-256 digest"
                )));
            }
        }
        check_size(self.compressed_size, MAX_COMPRESSED_SIZE, "compressed")?;
        check_size(
            self.uncompressed_size,
            MAX_UNCOMPRESSED_SIZE,
            "uncompressed",
        )
    }
}

/// Validate the original document and compress its exact UTF-8 bytes. In
/// particular, creatorState and unknown extension fields are never projected or
/// reserialized by the content protocol.
pub fn encode(raw: &[u8]) -> Result<(Manifest, Vec<u8>), ContentError> {
    check_size(raw.len() as u64, MAX_UNCOMPRESSED_SIZE, "uncompressed")?;
    validate_json(raw)?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::new(6));
    encoder.write_all(raw)?;
    let gzip = encoder.finish()?;
    check_size(gzip.len() as u64, MAX_COMPRESSED_SIZE, "compressed")?;
    let manifest = Manifest {
        protocol_version: 1,
        encoding: "gzip".into(),
        content_hash: sha256(raw),
        compressed_hash: sha256(&gzip),
        compressed_size: gzip.len() as u64,
        uncompressed_size: raw.len() as u64,
    };
    Ok((manifest, gzip))
}

/// Check both wire and document integrity before accepting any content. The
/// decoder is limited by the validated declared size plus one sentinel byte;
/// gzip headers (including ISIZE) are never trusted as allocation sizes.
pub fn decode(manifest: &Manifest, gzip: &[u8]) -> Result<Vec<u8>, ContentError> {
    manifest.validate()?;
    if gzip.len() as u64 != manifest.compressed_size {
        return Err(ContentError::SizeMismatch("compressed"));
    }
    if sha256(gzip) != manifest.compressed_hash {
        return Err(ContentError::HashMismatch("compressed"));
    }

    // The bufread decoder stops at the end of one member, retaining all bytes
    // after its trailer so that concatenated members and trailing data fail.
    let mut decoder = GzDecoder::new(gzip);
    let mut raw = Vec::new();
    decoder
        .by_ref()
        .take(manifest.uncompressed_size + 1)
        .read_to_end(&mut raw)
        .map_err(|error| ContentError::InvalidGzip(error.to_string()))?;
    if raw.len() as u64 != manifest.uncompressed_size {
        return Err(ContentError::SizeMismatch("uncompressed"));
    }
    if !decoder.into_inner().is_empty() {
        return Err(ContentError::InvalidGzip(
            "trailing bytes or multiple gzip members are not allowed".into(),
        ));
    }
    if sha256(&raw) != manifest.content_hash {
        return Err(ContentError::HashMismatch("uncompressed"));
    }
    validate_json(&raw)?;
    Ok(raw)
}

fn check_size(size: u64, maximum: u64, kind: &'static str) -> Result<(), ContentError> {
    if size == 0 || size > maximum {
        return Err(ContentError::SizeLimit(kind));
    }
    Ok(())
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn validate_json(raw: &[u8]) -> Result<(), ContentError> {
    // serde_json's regular Value parser silently overwrites duplicate object
    // keys. The strict visitor rejects them, including equivalent escaped keys.
    let text =
        std::str::from_utf8(raw).map_err(|error| ContentError::InvalidJson(error.to_string()))?;
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let mut remaining = MAX_JSON_VALUES;
    let document = StrictValueSeed {
        remaining: &mut remaining,
    }
    .deserialize(&mut deserializer)
    .map_err(|error| ContentError::InvalidJson(error.to_string()))?;
    deserializer
        .end()
        .map_err(|error| ContentError::InvalidJson(error.to_string()))?;
    crate::validation::validate_battle(&document.0).map_err(ContentError::InvalidBattle)
}

struct StrictValue(Value);

struct StrictValueSeed<'a> {
    remaining: &'a mut usize,
}

impl<'de> DeserializeSeed<'de> for StrictValueSeed<'_> {
    type Value = StrictValue;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        if *self.remaining == 0 {
            return Err(de::Error::custom("JSON value count limit exceeded"));
        }
        *self.remaining -= 1;
        struct StrictVisitor<'a> {
            remaining: &'a mut usize,
        }

        impl<'de> Visitor<'de> for StrictVisitor<'_> {
            type Value = StrictValue;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a JSON value without duplicate object keys")
            }

            fn visit_bool<E: de::Error>(self, value: bool) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::Bool(value)))
            }

            fn visit_i64<E: de::Error>(self, value: i64) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::Number(value.into())))
            }

            fn visit_u64<E: de::Error>(self, value: u64) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::Number(value.into())))
            }

            fn visit_f64<E: de::Error>(self, value: f64) -> Result<Self::Value, E> {
                Number::from_f64(value)
                    .map(|number| StrictValue(Value::Number(number)))
                    .ok_or_else(|| E::custom("non-finite JSON number"))
            }

            fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::String(value.into())))
            }

            fn visit_string<E: de::Error>(self, value: String) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::String(value)))
            }

            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(StrictValue(Value::Null))
            }

            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut values = Vec::new();
                while let Some(value) = seq.next_element_seed(StrictValueSeed {
                    remaining: &mut *self.remaining,
                })? {
                    values.push(value.0);
                }
                Ok(StrictValue(Value::Array(values)))
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut values = Map::new();
                while let Some(key) = map.next_key::<String>()? {
                    if values.contains_key(&key) {
                        return Err(de::Error::custom("duplicate JSON object key"));
                    }
                    let value = map.next_value_seed(StrictValueSeed {
                        remaining: &mut *self.remaining,
                    })?;
                    values.insert(key, value.0);
                }
                Ok(StrictValue(Value::Object(values)))
            }
        }

        deserializer.deserialize_any(StrictVisitor {
            remaining: self.remaining,
        })
    }
}
