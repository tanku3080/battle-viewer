use battle_p2p_core::{
    cache::{Cache, CacheError, DEFAULT_QUOTA_BYTES},
    content::encode,
};
use std::fs;
use tempfile::tempdir;

const RAW: &[u8] =
    br#"{ "title": "Original bytes", "map": { "width": 100, "height": 100 }, "units": [] }"#;

#[test]
fn exact_bytes_and_gzip_survive_close_reopen_and_removal() {
    let directory = tempdir().unwrap();
    let (manifest, gzip) = encode(RAW).unwrap();
    let stored;
    {
        let mut cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
        let entry = cache.store(&manifest, &gzip).unwrap();
        stored = entry.stored_bytes;
        assert!(stored > gzip.len() as u64);
        assert_eq!(cache.used_bytes().unwrap(), stored);
        assert_eq!(cache.read_raw(&manifest.content_hash).unwrap(), RAW);
        assert_eq!(cache.read(&manifest.content_hash).unwrap().1, gzip);
        assert_eq!(cache.store(&manifest, &gzip).unwrap().stored_bytes, stored);
        assert_eq!(cache.used_bytes().unwrap(), stored);
    }
    let mut cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    let inventory = cache.inventory().unwrap();
    assert_eq!(inventory.entries.len(), 1);
    assert!(inventory.corrupt_hashes.is_empty());
    assert_eq!(inventory.used_bytes, stored);
    assert_eq!(cache.read_raw(&manifest.content_hash).unwrap(), RAW);
    cache.remove(&manifest.content_hash).unwrap();
    assert_eq!(cache.used_bytes().unwrap(), 0);
}

#[test]
fn quota_includes_metadata_and_never_evicts_existing_files() {
    let directory = tempdir().unwrap();
    let (manifest, gzip) = encode(RAW).unwrap();
    let mut cache = Cache::open(directory.path(), gzip.len() as u64).unwrap();
    assert!(matches!(
        cache.store(&manifest, &gzip),
        Err(CacheError::Quota { .. })
    ));
    assert_eq!(cache.used_bytes().unwrap(), 0);
    cache.set_quota(DEFAULT_QUOTA_BYTES).unwrap();
    let exact_size = cache.store(&manifest, &gzip).unwrap().stored_bytes;
    cache.set_quota(exact_size).unwrap();
    assert!(matches!(
        cache.set_quota(exact_size - 1),
        Err(CacheError::Quota { .. })
    ));
    let (other, other_gzip) = encode(br#"{"map":{"width":101,"height":100}}"#).unwrap();
    assert!(matches!(
        cache.store(&other, &other_gzip),
        Err(CacheError::Quota { .. })
    ));
    assert_eq!(cache.read_raw(&manifest.content_hash).unwrap(), RAW);
    assert_eq!(cache.inventory().unwrap().entries.len(), 1);
    cache.remove(&manifest.content_hash).unwrap();
    cache.set_quota(0).unwrap();
    assert!(matches!(
        cache.store(&other, &other_gzip),
        Err(CacheError::Quota { .. })
    ));
}

#[test]
fn quota_is_recalculated_from_disk_after_restart() {
    let directory = tempdir().unwrap();
    let (manifest, gzip) = encode(RAW).unwrap();
    let mut cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    let used = cache.store(&manifest, &gzip).unwrap().stored_bytes;
    drop(cache);
    let mut cache = Cache::open(directory.path(), used - 1).unwrap();
    assert_eq!(cache.used_bytes().unwrap(), used);
    let (other, other_gzip) = encode(br#"{"map":{"width":101,"height":100}}"#).unwrap();
    assert!(matches!(
        cache.store(&other, &other_gzip),
        Err(CacheError::Quota { .. })
    ));
    assert_eq!(cache.read_raw(&manifest.content_hash).unwrap(), RAW);
}

#[test]
fn truncated_and_corrupt_entries_are_not_exposed_and_remain_removable() {
    let directory = tempdir().unwrap();
    let (manifest, gzip) = encode(RAW).unwrap();
    let mut cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    cache.store(&manifest, &gzip).unwrap();
    let path = directory
        .path()
        .join(format!("{}.bvp", manifest.content_hash));
    let original = fs::read(&path).unwrap();
    let mut corrupt = original.clone();
    *corrupt.last_mut().unwrap() ^= 1;
    fs::write(&path, &corrupt).unwrap();
    assert!(cache.read(&manifest.content_hash).is_err());
    let inventory = cache.inventory().unwrap();
    assert!(inventory.entries.is_empty());
    assert_eq!(
        inventory.corrupt_hashes,
        std::slice::from_ref(&manifest.content_hash)
    );
    assert_eq!(inventory.used_bytes, original.len() as u64);
    assert!(cache.store(&manifest, &gzip).is_err());
    fs::write(&path, &original[..10]).unwrap();
    assert!(matches!(
        cache.read(&manifest.content_hash),
        Err(CacheError::Corrupt)
    ));
    cache.remove(&manifest.content_hash).unwrap();
    cache.store(&manifest, &gzip).unwrap();
    assert_eq!(cache.read_raw(&manifest.content_hash).unwrap(), RAW);
}

#[test]
fn failed_validation_does_not_write_and_traversal_is_rejected() {
    let directory = tempdir().unwrap();
    let (mut manifest, gzip) = encode(RAW).unwrap();
    let mut cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    manifest.content_hash = "../escape".into();
    assert!(cache.store(&manifest, &gzip).is_err());
    for hash in [
        "../escape",
        "C:\\escape",
        "/tmp/escape",
        &"A".repeat(64),
        &"f".repeat(63),
    ] {
        assert!(matches!(cache.read(hash), Err(CacheError::InvalidHash)));
        assert!(matches!(cache.remove(hash), Err(CacheError::InvalidHash)));
    }
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1); // lock only
}

#[test]
fn exclusive_lock_and_interrupted_write_recovery() {
    let directory = tempdir().unwrap();
    let cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    assert!(matches!(
        Cache::open(directory.path(), DEFAULT_QUOTA_BYTES),
        Err(CacheError::InUse)
    ));
    fs::write(directory.path().join(".pending-interrupted"), b"partial").unwrap();
    drop(cache);
    let cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    assert!(!directory.path().join(".pending-interrupted").exists());
    assert_eq!(cache.used_bytes().unwrap(), 0);
}

#[test]
fn unrelated_files_and_directories_are_never_deleted() {
    let directory = tempdir().unwrap();
    let unrelated = directory.path().join("user-file.json");
    fs::write(&unrelated, RAW).unwrap();
    assert!(matches!(
        Cache::open(directory.path(), DEFAULT_QUOTA_BYTES),
        Err(CacheError::UnsafePath)
    ));
    assert_eq!(fs::read(unrelated).unwrap(), RAW);
    let directory = tempdir().unwrap();
    fs::create_dir(directory.path().join(".pending-directory")).unwrap();
    assert!(matches!(
        Cache::open(directory.path(), DEFAULT_QUOTA_BYTES),
        Err(CacheError::UnsafePath)
    ));
    assert!(directory.path().join(".pending-directory").is_dir());
}

#[test]
fn header_lengths_and_wrong_filename_are_rejected() {
    let directory = tempdir().unwrap();
    let (manifest, gzip) = encode(RAW).unwrap();
    let mut cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    cache.store(&manifest, &gzip).unwrap();
    let path = directory
        .path()
        .join(format!("{}.bvp", manifest.content_hash));
    let original = fs::read(&path).unwrap();
    fs::write(
        directory.path().join(format!("{}.bvp", "0".repeat(64))),
        &original,
    )
    .unwrap();
    assert!(matches!(
        cache.read(&"0".repeat(64)),
        Err(CacheError::Corrupt)
    ));
    let mut corrupt = original;
    corrupt[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
    fs::write(path, corrupt).unwrap();
    assert!(matches!(
        cache.read(&manifest.content_hash),
        Err(CacheError::Corrupt)
    ));
}

#[test]
fn a_second_gzip_representation_cannot_silently_replace_the_first() {
    use sha2::{Digest, Sha256};
    use std::io::Write;
    let directory = tempdir().unwrap();
    let (manifest, gzip) = encode(RAW).unwrap();
    let mut cache = Cache::open(directory.path(), DEFAULT_QUOTA_BYTES).unwrap();
    cache.store(&manifest, &gzip).unwrap();
    let mut encoder = flate2::GzBuilder::new()
        .mtime(123)
        .write(Vec::new(), flate2::Compression::fast());
    encoder.write_all(RAW).unwrap();
    let alternate = encoder.finish().unwrap();
    let mut other = manifest.clone();
    other.compressed_size = alternate.len() as u64;
    other.compressed_hash = format!("{:x}", Sha256::digest(&alternate));
    assert!(matches!(
        cache.store(&other, &alternate),
        Err(CacheError::Conflict)
    ));
    assert_eq!(cache.read(&manifest.content_hash).unwrap().1, gzip);
}

#[cfg(unix)]
#[test]
fn symlinks_are_rejected_without_touching_their_targets() {
    use std::os::unix::fs::symlink;
    let directory = tempdir().unwrap();
    let outside = tempdir().unwrap();
    fs::write(outside.path().join("secret"), b"untouched").unwrap();
    symlink(
        outside.path().join("secret"),
        directory.path().join(".pending-link"),
    )
    .unwrap();
    assert!(matches!(
        Cache::open(directory.path(), DEFAULT_QUOTA_BYTES),
        Err(CacheError::UnsafePath)
    ));
    assert_eq!(
        fs::read(outside.path().join("secret")).unwrap(),
        b"untouched"
    );
    let root_link = outside.path().join("root-link");
    symlink(directory.path(), &root_link).unwrap();
    assert!(matches!(
        Cache::open(root_link, DEFAULT_QUOTA_BYTES),
        Err(CacheError::UnsafePath)
    ));
}
