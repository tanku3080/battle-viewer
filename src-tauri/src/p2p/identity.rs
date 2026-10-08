use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(unix)]
use std::fs::File;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

use super::settings::ensure_private_dir;

const IDENTITY_VERSION: u32 = 1;
const IDENTITY_FILE: &str = "identity.json";

#[derive(Clone)]
pub struct InstallationIdentity {
  installation_id: String,
  identity_seed: [u8; 32],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityView {
  pub installation_id: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdentityFile {
  version: u32,
  installation_id: String,
  identity_seed: String,
}

impl InstallationIdentity {
  pub fn view(&self) -> IdentityView {
    IdentityView {
      installation_id: self.installation_id.clone(),
    }
  }

  #[allow(dead_code)]
  pub(crate) fn identity_seed(&self) -> &[u8; 32] {
    &self.identity_seed
  }
}

fn encode_hex(bytes: &[u8]) -> String {
  let mut output = String::with_capacity(bytes.len() * 2);
  for byte in bytes {
    use std::fmt::Write as _;
    write!(&mut output, "{byte:02x}").expect("writing to String cannot fail");
  }
  output
}

fn decode_seed(value: &str) -> Result<[u8; 32], String> {
  if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
    return Err("invalid P2P identity seed".into());
  }

  let mut seed = [0u8; 32];
  for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
    let text = std::str::from_utf8(pair).map_err(|_| "invalid P2P identity seed")?;
    seed[index] = u8::from_str_radix(text, 16).map_err(|_| "invalid P2P identity seed")?;
  }
  Ok(seed)
}

fn format_installation_id(mut bytes: [u8; 16]) -> String {
  // UUIDv4-compatible presentation for a random local installation identifier.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  let hex = encode_hex(&bytes);
  format!(
    "{}-{}-{}-{}-{}",
    &hex[0..8],
    &hex[8..12],
    &hex[12..16],
    &hex[16..20],
    &hex[20..32]
  )
}

fn valid_installation_id(value: &str) -> bool {
  let compact = value.replace('-', "");
  value.len() == 36
    && compact.len() == 32
    && compact.bytes().all(|byte| byte.is_ascii_hexdigit())
    && value.as_bytes().get(8) == Some(&b'-')
    && value.as_bytes().get(13) == Some(&b'-')
    && value.as_bytes().get(18) == Some(&b'-')
    && value.as_bytes().get(23) == Some(&b'-')
}

fn persist(root: &Path, identity: &IdentityFile) -> Result<(), String> {
  ensure_private_dir(root)?;
  let mut pending =
    NamedTempFile::new_in(root).map_err(|error| format!("failed to stage P2P identity: {error}"))?;
  let bytes = serde_json::to_vec_pretty(identity)
    .map_err(|error| format!("failed to encode P2P identity: {error}"))?;
  pending
    .write_all(&bytes)
    .map_err(|error| format!("failed to write P2P identity: {error}"))?;
  pending
    .as_file()
    .sync_all()
    .map_err(|error| format!("failed to flush P2P identity: {error}"))?;

  let path = root.join(IDENTITY_FILE);
  let file = pending
    .persist(&path)
    .map_err(|error| format!("failed to publish P2P identity: {}", error.error))?;
  file
    .sync_all()
    .map_err(|error| format!("failed to flush published P2P identity: {error}"))?;

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
      .map_err(|error| format!("failed to protect P2P identity: {error}"))?;
    File::open(root)
      .and_then(|dir| dir.sync_all())
      .map_err(|error| format!("failed to flush P2P identity directory: {error}"))?;
  }

  Ok(())
}

pub fn load_or_create(root: &Path) -> Result<InstallationIdentity, String> {
  ensure_private_dir(root)?;
  let path = root.join(IDENTITY_FILE);

  if path.exists() {
    if !fs::symlink_metadata(&path)
      .map_err(|error| format!("failed to inspect P2P identity: {error}"))?
      .file_type()
      .is_file()
    {
      return Err("P2P identity path is not a regular file".into());
    }

    let bytes = fs::read(&path).map_err(|error| format!("failed to read P2P identity: {error}"))?;
    let stored: IdentityFile =
      serde_json::from_slice(&bytes).map_err(|error| format!("invalid P2P identity: {error}"))?;
    if stored.version != IDENTITY_VERSION || !valid_installation_id(&stored.installation_id) {
      return Err("invalid P2P identity metadata".into());
    }
    return Ok(InstallationIdentity {
      installation_id: stored.installation_id,
      identity_seed: decode_seed(&stored.identity_seed)?,
    });
  }

  let mut random = [0u8; 48];
  getrandom::fill(&mut random).map_err(|error| format!("failed to create P2P identity: {error}"))?;
  let mut id_bytes = [0u8; 16];
  id_bytes.copy_from_slice(&random[..16]);
  let mut seed = [0u8; 32];
  seed.copy_from_slice(&random[16..]);

  let stored = IdentityFile {
    version: IDENTITY_VERSION,
    installation_id: format_installation_id(id_bytes),
    identity_seed: encode_hex(&seed),
  };
  persist(root, &stored)?;

  Ok(InstallationIdentity {
    installation_id: stored.installation_id,
    identity_seed: seed,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn identity_is_stable_across_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let first = load_or_create(dir.path()).unwrap();
    let second = load_or_create(dir.path()).unwrap();

    assert_eq!(first.view().installation_id, second.view().installation_id);
    assert_eq!(first.identity_seed(), second.identity_seed());
  }

  #[test]
  fn corrupted_identity_fails_closed() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
      dir.path().join(IDENTITY_FILE),
      br#"{"version":1,"installationId":"bad","identitySeed":"00"}"#,
    )
    .unwrap();

    assert!(load_or_create(dir.path()).is_err());
  }
}
