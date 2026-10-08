use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WorkRef {
  pub work_id: String,
  pub content_hash: String,
  pub replica: bool,
}

fn valid_ref(work: &WorkRef) -> bool {
  uuid_like(&work.work_id)
    && work.content_hash.len() == 64
    && work.content_hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn uuid_like(value: &str) -> bool {
  value.len() == 36
    && value.bytes().enumerate().all(|(i, b)| {
      if [8, 13, 18, 23].contains(&i) { b == b'-' }
      else { b.is_ascii_hexdigit() }
    })
}

pub fn load(root: &Path) -> Result<Vec<WorkRef>, String> {
  let path = root.join("work-refs.json");
  if !path.exists() { return Ok(Vec::new()); }
  let data = fs::read(path).map_err(|error| format!("Failed to read P2P work refs: {error}"))?;
  if data.len() > 128 * 1024 { return Err("P2P work refs too large".into()); }
  let refs: Vec<WorkRef> = serde_json::from_slice(&data)
    .map_err(|error| format!("Invalid P2P work refs: {error}"))?;
  if refs.len() > 4096 || refs.iter().any(|r| !valid_ref(r)) {
    return Err("Invalid P2P work refs".into());
  }
  Ok(refs)
}
pub fn save(root: &Path, refs: &[WorkRef]) -> Result<(), String> {
  if refs.len() > 4096 || refs.iter().any(|r| !valid_ref(r)) {
    return Err("Invalid P2P work refs".into());
  }
  let data = serde_json::to_vec(refs).map_err(|error| error.to_string())?;
  if data.len() > 128 * 1024 { return Err("P2P work refs too large".into()); }
  let mut temp = NamedTempFile::new_in(root).map_err(|error| error.to_string())?;
  temp.write_all(&data).map_err(|error| error.to_string())?;
  temp.as_file().sync_all().map_err(|error| error.to_string())?;
  temp.persist(root.join("work-refs.json")).map_err(|error| error.error.to_string())?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn persistence_roundtrip() {
    let dir = tempfile::tempdir().unwrap();
    let r = WorkRef {
      work_id: "01234567-89ab-cdef-0123-456789abcdef".into(),
      content_hash: "a".repeat(64),
      replica: false,
    };
    save(dir.path(), std::slice::from_ref(&r)).unwrap();
    assert_eq!(load(dir.path()).unwrap(), vec![r]);
  }
}
