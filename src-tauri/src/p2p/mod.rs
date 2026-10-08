mod identity;
#[allow(dead_code)]
mod network;
mod network_auth;
mod settings;
mod work_refs;

use battle_p2p_core::cache::Cache;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as AsyncMutex;
use network::DirectTransport;
use work_refs::WorkRef;
use tauri::State;

use settings::{P2pSettings, SETTINGS_VERSION};

use identity::{IdentityView, InstallationIdentity};

struct ReadyState {
  root: PathBuf,
  cache: Arc<Mutex<Cache>>,
  settings: Arc<Mutex<P2pSettings>>,
  identity: InstallationIdentity,
  network: AsyncMutex<Option<DirectTransport>>,
  advertised_address: Arc<Mutex<Option<String>>>,
  work_refs: Arc<Mutex<Vec<WorkRef>>>,
}

pub struct P2pState {
  ready: Option<ReadyState>,
  initialization_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntryView {
  pub content_hash: String,
  pub compressed_hash: String,
  pub compressed_size: u64,
  pub uncompressed_size: u64,
  pub stored_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P2pInventoryView {
  pub entries: Vec<CacheEntryView>,
  pub corrupt_hashes: Vec<String>,
  pub used_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P2pStatus {
  available: bool,
  network_active: bool,
  settings: Option<P2pSettings>,
  identity: Option<IdentityView>,
  cache_used_bytes: Option<u64>,
  initialization_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSettingsRequest {
  participation_enabled: bool,
  downloads_enabled: bool,
  redistribution_enabled: bool,
  cache_quota_bytes: u64,
  upload_limit_bytes_per_second: u64,
}

impl P2pState {
  pub fn initialize(root: PathBuf) -> Self {
    match ReadyState::open(root) {
      Ok(ready) => Self {
        ready: Some(ready),
        initialization_error: None,
      },
      Err(error) => Self {
        ready: None,
        initialization_error: Some(error),
      },
    }
  }

  pub fn unavailable(error: impl Into<String>) -> Self {
    Self {
      ready: None,
      initialization_error: Some(error.into()),
    }
  }
}

impl ReadyState {
  fn open(root: PathBuf) -> Result<Self, String> {
    settings::ensure_private_dir(&root)?;
    let settings = settings::load(&root)?;
    let cache_root = root.join("cache");
    // Acquire the process-wide cache lock before creating or reading the
    // installation identity. A second Battle Viewer process therefore fails
    // closed before it can race settings/identity persistence.
    let mut cache = Cache::open(&cache_root, settings.cache_quota_bytes)
      .map_err(|error| format!("failed to open P2P cache: {error}"))?;
    cache
      .set_quota(settings.cache_quota_bytes)
      .map_err(|error| format!("P2P cache exceeds configured quota: {error}"))?;
    let identity = identity::load_or_create(&root)?;
    let work_refs = work_refs::load(&root)?;

    Ok(Self {
      root,
      cache: Arc::new(Mutex::new(cache)),
      settings: Arc::new(Mutex::new(settings)),
      identity,
      network: AsyncMutex::new(None),
      advertised_address: Arc::new(Mutex::new(None)),
      work_refs: Arc::new(Mutex::new(work_refs)),
    })
  }
}

async fn cache_used_bytes(cache: Arc<Mutex<Cache>>) -> Result<u64, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let cache = cache
      .lock()
      .map_err(|_| "failed to lock P2P cache".to_string())?;
    cache
      .used_bytes()
      .map_err(|error| format!("failed to inspect P2P cache: {error}"))
  })
  .await
  .map_err(|error| format!("P2P cache worker failed: {error}"))?
}

async fn status(state: &P2pState) -> Result<P2pStatus, String> {
  let Some(ready) = &state.ready else {
    return Ok(P2pStatus {
      available: false,
      network_active: false,
      settings: None,
      identity: None,
      cache_used_bytes: None,
      initialization_error: state.initialization_error.clone(),
    });
  };

  let settings = ready
    .settings
    .lock()
    .map_err(|_| "failed to lock P2P settings".to_string())?
    .clone();
  let used = cache_used_bytes(Arc::clone(&ready.cache)).await?;

  Ok(P2pStatus {
    available: true,
    // Phase 2b stores consent/settings only. No listener or peer connection exists yet.
    network_active: ready.network.lock().await.is_some(),
    settings: Some(settings),
    identity: Some(ready.identity.view()),
    cache_used_bytes: Some(used),
    initialization_error: None,
  })
}

async fn inventory(ready: &ReadyState) -> Result<P2pInventoryView, String> {
  let cache = Arc::clone(&ready.cache);
  tauri::async_runtime::spawn_blocking(move || {
    let cache = cache
      .lock()
      .map_err(|_| "failed to lock P2P cache".to_string())?;
    let inventory = cache
      .inventory()
      .map_err(|error| format!("failed to inspect P2P cache: {error}"))?;

    Ok::<P2pInventoryView, String>(P2pInventoryView {
      entries: inventory
        .entries
        .into_iter()
        .map(|entry| CacheEntryView {
          content_hash: entry.manifest.content_hash,
          compressed_hash: entry.manifest.compressed_hash,
          compressed_size: entry.manifest.compressed_size,
          uncompressed_size: entry.manifest.uncompressed_size,
          stored_bytes: entry.stored_bytes,
        })
        .collect(),
      corrupt_hashes: inventory.corrupt_hashes,
      used_bytes: inventory.used_bytes,
    })
  })
  .await
  .map_err(|error| format!("P2P inventory worker failed: {error}"))?
}

#[tauri::command]
pub async fn p2p_get_status(state: State<'_, P2pState>) -> Result<P2pStatus, String> {
  status(&state).await
}


#[tauri::command]
pub async fn p2p_get_inventory(
  state: State<'_, P2pState>,
) -> Result<P2pInventoryView, String> {
  let ready = state
    .ready
    .as_ref()
    .ok_or_else(|| {
      state
        .initialization_error
        .clone()
        .unwrap_or_else(|| "P2P is unavailable".to_string())
    })?;
  inventory(ready).await
}

#[tauri::command]
pub async fn p2p_update_settings(
  request: UpdateSettingsRequest,
  state: State<'_, P2pState>,
) -> Result<P2pStatus, String> {
  let ready = state
    .ready
    .as_ref()
    .ok_or_else(|| {
      state
        .initialization_error
        .clone()
        .unwrap_or_else(|| "P2P is unavailable".to_string())
    })?;

  let updated = P2pSettings {
    version: SETTINGS_VERSION,
    participation_enabled: request.participation_enabled,
    downloads_enabled: request.downloads_enabled,
    redistribution_enabled: request.redistribution_enabled,
    cache_quota_bytes: request.cache_quota_bytes,
    upload_limit_bytes_per_second: request.upload_limit_bytes_per_second,
  };
  updated.validate()?;

  let root = ready.root.clone();
  let cache = Arc::clone(&ready.cache);
  let settings_state = Arc::clone(&ready.settings);
  let updated_for_worker = updated.clone();

  tauri::async_runtime::spawn_blocking(move || {
    let mut cache = cache
      .lock()
      .map_err(|_| "failed to lock P2P cache".to_string())?;
    let previous = settings_state
      .lock()
      .map_err(|_| "failed to lock P2P settings".to_string())?
      .clone();

    cache
      .set_quota(updated_for_worker.cache_quota_bytes)
      .map_err(|error| format!("failed to update P2P cache quota: {error}"))?;

    if let Err(error) = settings::save(&root, &updated_for_worker) {
      let _ = cache.set_quota(previous.cache_quota_bytes);
      return Err(error);
    }

    *settings_state
      .lock()
      .map_err(|_| "failed to lock P2P settings".to_string())? = updated_for_worker;
    Ok::<(), String>(())
  })
  .await
  .map_err(|error| format!("P2P settings worker failed: {error}"))??;

  status(&state).await
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::Path;

  #[test]
  fn initialization_failure_does_not_require_app_shutdown() {
    let state = P2pState::unavailable("test failure");
    assert!(state.ready.is_none());
    assert_eq!(state.initialization_error.as_deref(), Some("test failure"));
  }

  #[test]
  fn ready_state_uses_app_owned_root_and_default_off_settings() {
    let dir = tempfile::tempdir().unwrap();
    let ready = ReadyState::open(dir.path().join("p2p")).unwrap();
    let settings = ready.settings.lock().unwrap().clone();

    assert!(!settings.participation_enabled);
    assert!(!settings.downloads_enabled);
    assert!(!settings.redistribution_enabled);
    assert!(ready.root.ends_with(Path::new("p2p")));
  }
}
