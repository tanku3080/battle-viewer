//! A private, exclusively locked cache. Each entry is one atomically published file.
//! The caller supplies an app-owned directory, never a path received from a peer.
use crate::content::{ContentError, MAX_COMPRESSED_SIZE, Manifest, decode};
use fs2::FileExt;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tempfile::Builder;
use thiserror::Error;

pub const DEFAULT_QUOTA_BYTES: u64 = 256 * 1024 * 1024;
const MAGIC: &[u8; 8] = b"BVP2PC01";
const MAX_MANIFEST_BYTES: u64 = 1024;
const MAX_ENTRY_BYTES: u64 = 12 + MAX_MANIFEST_BYTES + MAX_COMPRESSED_SIZE;
const MAX_CACHE_FILES: usize = 4096;

#[derive(Debug, Error)]
pub enum CacheError {
    #[error(transparent)]
    Content(#[from] ContentError),
    #[error("cache I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("cache is already in use")]
    InUse,
    #[error("cache contains an unsafe path or unsupported file")]
    UnsafePath,
    #[error("invalid content hash")]
    InvalidHash,
    #[error("cache entry is corrupt")]
    Corrupt,
    #[error("cache quota exceeded (used {used}, required {required}, limit {limit})")]
    Quota {
        used: u64,
        required: u64,
        limit: u64,
    },
    #[error("too many cache entries")]
    TooManyEntries,
    #[error("a different compressed representation already exists for this content")]
    Conflict,
}

#[derive(Debug, Clone)]
pub struct CacheEntry {
    pub manifest: Manifest,
    pub stored_bytes: u64,
}

#[derive(Debug)]
pub struct Inventory {
    pub entries: Vec<CacheEntry>,
    /// Corrupt entries are never returned as usable content. They still consume quota.
    pub corrupt_hashes: Vec<String>,
    pub used_bytes: u64,
}

pub struct Cache {
    root: PathBuf,
    quota: u64,
    // Keep the OS lock for the lifetime of this cache, including across process boundaries.
    _lock: File,
}

fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

fn regular_file(path: &Path) -> Result<fs::Metadata, CacheError> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_file() {
        return Err(CacheError::UnsafePath);
    }
    Ok(metadata)
}

impl Cache {
    pub fn open(root: impl AsRef<Path>, quota: u64) -> Result<Self, CacheError> {
        let root = root.as_ref();
        fs::create_dir_all(root)?;
        if !fs::symlink_metadata(root)?.file_type().is_dir() {
            return Err(CacheError::UnsafePath);
        }
        let root = fs::canonicalize(root)?;
        let lock_path = root.join(".lock");
        if fs::symlink_metadata(&lock_path).is_ok() {
            regular_file(&lock_path)?;
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(lock_path)?;
        FileExt::try_lock_exclusive(&lock).map_err(|error| {
            if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() {
                CacheError::InUse
            } else {
                CacheError::Io(error)
            }
        })?;
        let cache = Self {
            root,
            quota,
            _lock: lock,
        };
        // No other cooperating writer can be active. Remove only our interrupted temp files.
        for entry in fs::read_dir(&cache.root)?.take(MAX_CACHE_FILES + 2) {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with(".pending-") {
                regular_file(&entry.path())?;
                fs::remove_file(entry.path())?;
            }
        }
        cache.files()?;
        Ok(cache)
    }

    fn path(&self, hash: &str) -> Result<PathBuf, CacheError> {
        if !valid_hash(hash) {
            return Err(CacheError::InvalidHash);
        }
        Ok(self.root.join(format!("{hash}.bvp")))
    }

    fn files(&self) -> Result<Vec<(String, PathBuf, u64)>, CacheError> {
        let mut files = Vec::new();
        for (index, entry) in fs::read_dir(&self.root)?.enumerate() {
            if index > MAX_CACHE_FILES {
                return Err(CacheError::TooManyEntries);
            }
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_str().ok_or(CacheError::UnsafePath)?;
            let metadata = regular_file(&entry.path())?;
            if name == ".lock" {
                continue;
            }
            let hash = name
                .strip_suffix(".bvp")
                .filter(|hash| valid_hash(hash))
                .ok_or(CacheError::UnsafePath)?;
            files.push((hash.to_owned(), entry.path(), metadata.len()));
        }
        files.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(files)
    }

    /// Counts full entry bytes, including the bounded manifest/container overhead.
    pub fn used_bytes(&self) -> Result<u64, CacheError> {
        self.files()?.iter().try_fold(0u64, |used, (_, _, size)| {
            used.checked_add(*size).ok_or(CacheError::Corrupt)
        })
    }

    /// Lowering the quota never silently removes author files or user downloads.
    pub fn set_quota(&mut self, quota: u64) -> Result<(), CacheError> {
        let used = self.used_bytes()?;
        if used > quota {
            return Err(CacheError::Quota {
                used,
                required: 0,
                limit: quota,
            });
        }
        self.quota = quota;
        Ok(())
    }

    pub fn inventory(&self) -> Result<Inventory, CacheError> {
        let mut result = Inventory {
            entries: Vec::new(),
            corrupt_hashes: Vec::new(),
            used_bytes: 0,
        };
        for (hash, _, size) in self.files()? {
            result.used_bytes = result
                .used_bytes
                .checked_add(size)
                .ok_or(CacheError::Corrupt)?;
            match self.read(&hash) {
                Ok((manifest, _)) => result.entries.push(CacheEntry {
                    manifest,
                    stored_bytes: size,
                }),
                Err(CacheError::Corrupt | CacheError::Content(_)) => {
                    result.corrupt_hashes.push(hash)
                }
                Err(error) => return Err(error),
            }
        }
        Ok(result)
    }

    /// Explicit local storage operation. This does not grant permission to redistribute.
    /// Replicas must copy this exact gzip; never re-encode a downloaded document.
    pub fn store(&mut self, manifest: &Manifest, gzip: &[u8]) -> Result<CacheEntry, CacheError> {
        decode(manifest, gzip)?;
        let destination = self.path(&manifest.content_hash)?;
        if fs::symlink_metadata(&destination).is_ok() {
            let (existing, existing_gzip) = self.read(&manifest.content_hash)?;
            if existing.compressed_hash != manifest.compressed_hash || existing_gzip != gzip {
                return Err(CacheError::Conflict);
            }
            return Ok(CacheEntry {
                manifest: existing,
                stored_bytes: regular_file(&destination)?.len(),
            });
        }
        let json = serde_json::to_vec(manifest).map_err(|_| CacheError::Corrupt)?;
        if json.len() as u64 > MAX_MANIFEST_BYTES {
            return Err(CacheError::Corrupt);
        }
        let required = 12 + json.len() as u64 + gzip.len() as u64;
        let files = self.files()?;
        if files.len() >= MAX_CACHE_FILES {
            return Err(CacheError::TooManyEntries);
        }
        let used = self.used_bytes()?;
        if required > self.quota.saturating_sub(used) {
            return Err(CacheError::Quota {
                used,
                required,
                limit: self.quota,
            });
        }
        // A single file prevents mismatched payload/manifest pairs after a crash.
        // Temporary bytes become the final file, so there is no second on-disk copy.
        let mut pending = Builder::new().prefix(".pending-").tempfile_in(&self.root)?;
        pending.write_all(MAGIC)?;
        pending.write_all(&(json.len() as u32).to_le_bytes())?;
        pending.write_all(&json)?;
        pending.write_all(gzip)?;
        pending.as_file().sync_all()?;
        pending
            .persist_noclobber(&destination)
            .map_err(|error| CacheError::Io(error.error))?;
        self.sync_directory()?;
        Ok(CacheEntry {
            manifest: manifest.clone(),
            stored_bytes: required,
        })
    }

    /// Validates both hashes, sizes and the Battle document every time before returning bytes.
    pub fn read(&self, hash: &str) -> Result<(Manifest, Vec<u8>), CacheError> {
        let (manifest, gzip, _) = self.read_verified(hash)?;
        Ok((manifest, gzip))
    }

    fn read_verified(&self, hash: &str) -> Result<(Manifest, Vec<u8>, Vec<u8>), CacheError> {
        let path = self.path(hash)?;
        let size = regular_file(&path)?.len();
        if !(13..=MAX_ENTRY_BYTES).contains(&size) {
            return Err(CacheError::Corrupt);
        }
        let mut file = File::open(path)?;
        let mut header = [0u8; 12];
        file.read_exact(&mut header)
            .map_err(|_| CacheError::Corrupt)?;
        if &header[..8] != MAGIC {
            return Err(CacheError::Corrupt);
        }
        let length = u32::from_le_bytes(header[8..].try_into().unwrap()) as u64;
        if length == 0 || length > MAX_MANIFEST_BYTES || 12 + length >= size {
            return Err(CacheError::Corrupt);
        }
        let mut json = vec![0; length as usize];
        file.read_exact(&mut json)
            .map_err(|_| CacheError::Corrupt)?;
        let manifest: Manifest = serde_json::from_slice(&json).map_err(|_| CacheError::Corrupt)?;
        manifest.validate()?;
        if manifest.content_hash != hash || size != 12 + length + manifest.compressed_size {
            return Err(CacheError::Corrupt);
        }
        let mut gzip = Vec::new();
        file.take(manifest.compressed_size + 1)
            .read_to_end(&mut gzip)?;
        let raw = decode(&manifest, &gzip)?;
        Ok((manifest, gzip, raw))
    }

    pub fn read_raw(&self, hash: &str) -> Result<Vec<u8>, CacheError> {
        let (_, _, raw) = self.read_verified(hash)?;
        Ok(raw)
    }

    /// Removes only the requested hash, including a corrupt entry. No automatic eviction.
    pub fn remove(&mut self, hash: &str) -> Result<(), CacheError> {
        let path = self.path(hash)?;
        regular_file(&path)?;
        fs::remove_file(path)?;
        self.sync_directory()
    }

    fn sync_directory(&self) -> Result<(), CacheError> {
        #[cfg(unix)]
        File::open(&self.root)?.sync_all()?;
        // std does not expose opening a Windows directory for FlushFileBuffers.
        // Payload is synced before rename; a sudden power loss may lose the new entry.
        Ok(())
    }
}
