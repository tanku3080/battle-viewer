use battle_p2p_core::cache::DEFAULT_QUOTA_BYTES;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

pub const SETTINGS_VERSION: u32 = 1;
pub const DEFAULT_UPLOAD_LIMIT_BYTES_PER_SECOND: u64 = 256 * 1024;
pub const MAX_CACHE_QUOTA_BYTES: u64 = 64 * 1024 * 1024 * 1024;
pub const MIN_UPLOAD_LIMIT_BYTES_PER_SECOND: u64 = 16 * 1024;
pub const MAX_UPLOAD_LIMIT_BYTES_PER_SECOND: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct P2pSettings {
  pub version: u32,
  pub downloads_enabled: bool,
  pub redistribution_enabled: bool,
  pub cache_quota_bytes: u64,
  pub upload_limit_bytes_per_second: u64,
}

impl Default for P2pSettings {
  fn default() -> Self {
    Self {
      version: SETTINGS_VERSION,
      participation_enabled: false,
      downloads_enabled: false,
      redistribution_enabled: false,
      cache_quota_bytes: DEFAULT_QUOTA_BYTES,
      upload_limit_bytes_per_second: DEFAULT_UPLOAD_LIMIT_BYTES_PER_SECOND,
    }
  }
}

impl P2pSettings {
  pub fn validate(&self) -> Result<(), String> {
    if self.version != SETTINGS_VERSION {
      return Err("unsupported P2P settings version".into());
    }
    if self.cache_quota_bytes > MAX_CACHE_QUOTA_BYTES {
      return Err("P2P cache quota is too large".into());
    }
    if !(MIN_UPLOAD_LIMIT_BYTES_PER_SECOND..=MAX_UPLOAD_LIMIT_BYTES_PER_SECOND)
      .contains(&self.upload_limit_bytes_per_second)
    {
      return Err("P2P upload limit is outside the allowed range".into());
    }
    Ok(())
  }
}

pub(crate) fn ensure_private_dir(path: &Path) -> Result<(), String> {
  fs::create_dir_all(path).map_err(|error| format!("failed to create P2P data directory: {error}"))?;
  if !fs::symlink_metadata(path)
    .map_err(|error| format!("failed to inspect P2P data directory: {error}"))?
    .file_type()
    .is_dir()
  {
    return Err("P2P data path is not a directory".into());
  }

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
      .map_err(|error| format!("failed to protect P2P data directory: {error}"))?;
  }

  Ok(())
}

fn settings_path(root: &Path) -> PathBuf {
  root.join("settings.json")
}

pub fn load(root: &Path) -> Result<P2pSettings, String> {
  ensure_private_dir(root)?;
  let path = settings_path(root);
  if !path.exists() {
    return Ok(P2pSettings::default());
  }

  if !fs::symlink_metadata(&path)
    .map_err(|error| format!("failed to inspect P2P settings: {error}"))?
    .file_type()
    .is_file()
  {
    return Err("P2P settings path is not a regular file".into());
  }

  let bytes = fs::read(&path).map_err(|error| format!("failed to read P2P settings: {error}"))?;
  let settings: P2pSettings =
    serde_json::from_slice(&bytes).map_err(|error| format!("invalid P2P settings: {error}"))?;
  settings.validate()?;
  Ok(settings)
}

pub fn save(root: &Path, settings: &P2pSettings) -> Result<(), String> {
  settings.validate()?;
  ensure_private_dir(root)?;

  let mut pending =
    NamedTempFile::new_in(root).map_err(|error| format!("failed to stage P2P settings: {error}"))?;
  let bytes = serde_json::to_vec_pretty(settings)
    .map_err(|error| format!("failed to encode P2P settings: {error}"))?;
  pending
    .write_all(&bytes)
    .map_err(|error| format!("failed to write P2P settings: {error}"))?;
  pending
    .as_file()
    .sync_all()
    .map_err(|error| format!("failed to flush P2P settings: {error}"))?;

  let path = settings_path(root);
  let file = pending
    .persist(&path)
    .map_err(|error| format!("failed to publish P2P settings: {}", error.error))?;
  file
    .sync_all()
    .map_err(|error| format!("failed to flush published P2P settings: {error}"))?;

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
      .map_err(|error| format!("failed to protect P2P settings: {error}"))?;
    File::open(root)
      .and_then(|dir| dir.sync_all())
      .map_err(|error| format!("failed to flush P2P settings directory: {error}"))?;
  }

  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn defaults_are_opt_in_off() {
    let settings = P2pSettings::default();
    assert!(!settings.participation_enabled);
    assert!(!settings.downloads_enabled);
    assert!(!settings.redistribution_enabled);
    assert_eq!(settings.cache_quota_bytes, DEFAULT_QUOTA_BYTES);
    assert_eq!(
      settings.upload_limit_bytes_per_second,
      DEFAULT_UPLOAD_LIMIT_BYTES_PER_SECOND
    );
    settings.validate().unwrap();
  }

  #[test]
  fn persists_and_reloads_settings() {
    let dir = tempfile::tempdir().unwrap();
    let settings = P2pSettings {
      participation_enabled: true,
      downloads_enabled: true,
      redistribution_enabled: false,
      cache_quota_bytes: 512 * 1024 * 1024,
      upload_limit_bytes_per_second: 512 * 1024,
      ..P2pSettings::default()
    };

    save(dir.path(), &settings).unwrap();
    assert_eq!(load(dir.path()).unwrap(), settings);
  }

  #[test]
  fn rejects_invalid_limits_without_overwriting_existing_settings() {
    let dir = tempfile::tempdir().unwrap();
    let original = P2pSettings::default();
    save(dir.path(), &original).unwrap();

    let invalid = P2pSettings {
      upload_limit_bytes_per_second: 1,
      ..original.clone()
    };
    assert!(save(dir.path(), &invalid).is_err());
    assert_eq!(load(dir.path()).unwrap(), original);
  }
}
