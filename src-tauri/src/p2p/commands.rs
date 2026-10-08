use super::{P2pState, ReadyState};
use super::network::{self, PeerRoute};
use super::network_auth::HubTransferAuthorizer;
use super::work_refs::{self, WorkRef};
use crate::{authenticated_request, AuthState};
use battle_p2p_core::content;
use libp2p::{Multiaddr, PeerId};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
use std::sync::{Arc, atomic::Ordering};
use std::time::Duration;
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
  advertised_ip: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkView {
  peer_id: String,
  address: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkResponse {
  id: String,
  content_hash: String,
  distribution_state: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Provider {
  peer_id: String,
  address: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Grant {
  token: String,
  provider_peer_id: String,
  address: String,
}

fn ready(state: &P2pState) -> Result<&ReadyState, String> {
  state.ready.as_ref()
    .ok_or_else(|| state.initialization_error.clone().unwrap_or_else(|| "P2P unavailable".into()))
}

fn enabled(ready: &ReadyState, download: bool, redistribute: bool) -> Result<(), String> {
  let settings = ready.settings.lock().map_err(|_| "P2P settings unavailable".to_string())?;
  if !settings.participation_enabled ||
    (download && !settings.downloads_enabled) ||
    (redistribute && !settings.redistribution_enabled) {
    return Err("P2P consent is not enabled for this operation".into());
  }
  Ok(())
}

async fn hub(
  auth: &AuthState,
  method: Method,
  path: &str,
  body: Option<&str>,
) -> Result<reqwest::Response, String> {
  let response = tokio::time::timeout(Duration::from_secs(6),
    authenticated_request(&Client::new(), auth, method, path, body))
      .await.map_err(|_| "Battle Hub request timed out".to_string())??;
  if !response.status().is_success() {
    return Err(format!("Battle Hub returned HTTP {}", response.status()));
  }
  Ok(response)
}

fn address_for(ip: &str, listener: &Multiaddr) -> Result<String, String> {
  let ip: Ipv4Addr = ip.parse().map_err(|_| "Invalid advertised IPv4 address".to_string())?;
  if ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast() {
    return Err("Advertised IP must be a reachable IPv4 address".into());
  }
  let port = listener.to_string().split('/').next_back()
    .and_then(|value| value.parse::<u16>().ok())
    .ok_or_else(|| "P2P listener port unavailable".to_string())?;
  Ok(format!("/ip4/{ip}/tcp/{port}"))
}

async fn announce(
  auth: &AuthState,
  reference: &WorkRef,
  peer_id: &str,
  address: &str,
) -> Result<(), String> {
  let endpoint = "renew";
  let body = serde_json::json!({ "peerId": peer_id, "address": address }).to_string();
  hub(auth, Method::POST,
    &format!("/api/v2/works/{}/peers/{endpoint}", reference.work_id), Some(&body)).await?;
  Ok(())
}

async fn persist_reference(ready: &ReadyState, reference: WorkRef) -> Result<(), String> {
  let root = ready.root.clone();
  let refs = Arc::clone(&ready.work_refs);
  tauri::async_runtime::spawn_blocking(move || {
    let mut refs = refs.lock().map_err(|_| "P2P references unavailable".to_string())?;
    let old = refs.clone();
    refs.retain(|item| item.work_id != reference.work_id);
    refs.push(reference);
    if let Err(error) = work_refs::save(&root, &refs) {
      *refs = old;
      return Err(error);
    }
    Ok::<(), String>(())
  }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn p2p_start(
  request: StartRequest,
  state: State<'_, P2pState>,
  auth: State<'_, AuthState>,
) -> Result<NetworkView, String> {
  let ready = ready(&state)?;
  enabled(ready, false, false)?;
  let _: serde_json::Value = hub(&auth, Method::GET, "/api/auth/session", None)
    .await?.json().await.map_err(|error| error.to_string())?;
  let ip: Ipv4Addr = request.advertised_ip.parse()
    .map_err(|_| "Invalid advertised IPv4 address".to_string())?;
  if ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast() {
    return Err("Invalid advertised IPv4 address".into());
  }

  let mut network = ready.network.lock().await;
  if network.is_some() { return Err("P2P listener is already active".into()); }
  let seed = *ready.identity.identity_seed();
  let transport = network::spawn_authorized_direct_transport(
    &seed,
    Arc::clone(&ready.cache),
    "/ip4/0.0.0.0/tcp/0".parse().map_err(|error| format!("{error}"))?,
    HubTransferAuthorizer::new(auth.inner().clone()),
    Arc::clone(&ready.settings),
  ).await?;
  let address = address_for(&request.advertised_ip, transport.listen_addr())?;
  let peer_id = transport.peer_id().to_string();
  *ready.advertised_address.lock().map_err(|_| "P2P address unavailable".to_string())? = Some(address.clone());
  *network = Some(transport);
  ready.running.store(true, Ordering::Release);
  drop(network);

  let running = Arc::clone(&ready.running);
  let refs = Arc::clone(&ready.work_refs);
  let settings = Arc::clone(&ready.settings);
  let auth = auth.inner().clone();
  let refresh_addr = address.clone();
  let refresh_peer = peer_id.clone();
  tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(25));
    while running.load(Ordering::Acquire) {
      interval.tick().await;
      if !running.load(Ordering::Acquire) { break; }
      let allowed = settings.lock().map(|settings| {
        settings.participation_enabled
      }).unwrap_or(false);
      if !allowed { break; }
      let references = refs.lock().map(|refs| refs.clone()).unwrap_or_default();
      for reference in references {
        if !running.load(Ordering::Acquire) { break; }
        let _ = announce(&auth, &reference, &refresh_peer, &refresh_addr).await;
      }
    }
  });

  Ok(NetworkView { peer_id, address })
}

#[tauri::command]
pub async fn p2p_stop(
  state: State<'_, P2pState>,
  auth: State<'_, AuthState>,
) -> Result<(), String> {
  let ready = ready(&state)?;
  ready.running.store(false, Ordering::Release);
  let transport = ready.network.lock().await.take();
  if let Some(transport) = transport {
    let peer_id = transport.peer_id().to_string();
    transport.handle().shutdown().await;
    let references = ready.work_refs.lock()
      .map_err(|_| "P2P work references unavailable".to_string())?.clone();
    for reference in references {
      let _ = hub(&auth, Method::DELETE,
        &format!("/api/v2/works/{}/peers/{peer_id}", reference.work_id), None).await;
    }
  }
  *ready.advertised_address.lock().map_err(|_| "P2P address unavailable".to_string())? = None;
  Ok(())
}

#[tauri::command]
pub async fn p2p_publish(
  raw: String,
  description: String,
  state: State<'_, P2pState>,
  auth: State<'_, AuthState>,
) -> Result<serde_json::Value, String> {
  let ready = ready(&state)?;
  enabled(ready, false, true)?;
  if description.len() > 2000 { return Err("Description too long".into()); }
  let network = ready.network.lock().await;
  let transport = network.as_ref().ok_or_else(|| "Start P2P before publishing".to_string())?;
  let peer_id = transport.peer_id().to_string();
  let address = ready.advertised_address.lock()
    .map_err(|_| "P2P address unavailable".to_string())?
    .clone().ok_or_else(|| "No advertised address".to_string())?;
  drop(network);

  let cache = Arc::clone(&ready.cache);
  let (manifest, title) = tauri::async_runtime::spawn_blocking(move || {
    let document: serde_json::Value = serde_json::from_str(&raw)
      .map_err(|error| format!("Invalid JSON: {error}"))?;
    let title = document.get("title").and_then(|value| value.as_str())
      .filter(|title| !title.trim().is_empty())
      .ok_or_else(|| "Battle title required".to_string())?.to_string();
    let (manifest, gzip) = content::encode(raw.as_bytes())
      .map_err(|error| error.to_string())?;
    cache.lock().map_err(|_| "P2P cache unavailable".to_string())?
      .store(&manifest, &gzip).map_err(|error| error.to_string())?;
    Ok::<_, String>((manifest, title))
  }).await.map_err(|error| error.to_string())??;

  let body = serde_json::json!({
    "title": title,
    "description": description,
    "protocolVersion": manifest.protocol_version,
    "encoding": manifest.encoding,
    "contentHash": manifest.content_hash,
    "compressedHash": manifest.compressed_hash,
    "compressedSize": manifest.compressed_size,
    "uncompressedSize": manifest.uncompressed_size,
  }).to_string();
  let work: serde_json::Value = hub(&auth, Method::POST, "/api/v2/works", Some(&body))
    .await?.json().await.map_err(|error| error.to_string())?;
  let work_id = work.get("id").and_then(|value| value.as_str())
    .ok_or_else(|| "Hub returned no work ID".to_string())?.to_string();

  persist_reference(ready, WorkRef {
    work_id: work_id.clone(), content_hash: manifest.content_hash, replica: false,
  }).await?;

  let lease = serde_json::json!({ "peerId": peer_id, "address": address }).to_string();
  hub(&auth, Method::POST,
    &format!("/api/v2/works/{work_id}/peers/origin"), Some(&lease)).await?;
  Ok(work)
}

#[tauri::command]
pub async fn p2p_fetch(
  work_id: String,
  state: State<'_, P2pState>,
  auth: State<'_, AuthState>,
) -> Result<String, String> {
  let ready = ready(&state)?;
  enabled(ready, true, false)?;
  if work_id.len() != 36 || !work_id.bytes().all(|byte| byte.is_ascii_hexdigit() || byte == b'-') {
    return Err("Invalid work ID".into());
  }
  let network = ready.network.lock().await;
  let transport = network.as_ref().ok_or_else(|| "Start P2P before downloading".to_string())?;
  let handle = transport.handle();
  let own_peer = transport.peer_id().to_string();
  drop(network);

  let work: WorkResponse = hub(&auth, Method::GET, &format!("/api/v2/works/{work_id}"), None)
    .await?.json().await.map_err(|error| error.to_string())?;
  if work.id != work_id || work.distribution_state != "ACTIVE" {
    return Err("Work distribution is not active".into());
  }
  let cache = Arc::clone(&ready.cache);
  let hash = work.content_hash.clone();

  let already_cached = {
    let cache = Arc::clone(&cache);
    let hash = hash.clone();
    tauri::async_runtime::spawn_blocking(move || {
      cache.lock().map_err(|_| "P2P cache unavailable".to_string())?
        .read_raw(&hash).map_err(|error| error.to_string())
    }).await.map_err(|error| error.to_string())?
  };
  if let Ok(bytes) = already_cached {
    return String::from_utf8(bytes).map_err(|error| error.to_string());
  }

  let providers: Vec<Provider> = hub(&auth, Method::GET,
    &format!("/api/v2/works/{work_id}/peers"), None)
    .await?.json().await.map_err(|error| error.to_string())?;

  let mut last_error = "No online P2P peers".to_string();
  for provider in providers.into_iter().filter(|p| p.peer_id != own_peer) {
    let grant_body = serde_json::json!({
      "requesterPeerId": own_peer,
      "providerPeerId": provider.peer_id,
    }).to_string();
    let grant_response = hub(&auth, Method::POST,
      &format!("/api/v2/works/{work_id}/peers/grant"), Some(&grant_body)).await;
    let grant: Grant = match grant_response {
      Ok(response) => match response.json().await {
        Ok(value) => value,
        Err(_) => continue,
      },
      Err(error) => {
        last_error = error;
        continue;
      }
    };
    if grant.provider_peer_id != provider.peer_id { continue; }
    let address: Multiaddr = match grant.address.parse() {
      Ok(address) => address,
      Err(_) => continue,
    };
    let peer: PeerId = match provider.peer_id.parse() {
      Ok(peer) => peer,
      Err(_) => continue,
    };
    match handle.fetch_authorized(
      vec![PeerRoute { peer_id: peer, addresses: vec![address] }],
      hash.clone(), work_id.clone(), vec![grant.token],
    ).await {
      Ok(receipt) => {
        let result = {
          let cache = Arc::clone(&cache);
          let hash = hash.clone();
          tauri::async_runtime::spawn_blocking(move || {
            cache.lock().map_err(|_| "P2P cache unavailable".to_string())?
              .read_raw(&hash).map_err(|error| error.to_string())
          }).await.map_err(|error| error.to_string())??
        };
        let text = String::from_utf8(result).map_err(|error| error.to_string())?;
        persist_reference(ready, WorkRef {
          work_id: work_id.clone(), content_hash: hash.clone(), replica: true,
        }).await?;
        let may_redistribute = enabled(ready, false, true).is_ok();
        if may_redistribute {
          let address = ready.advertised_address.lock()
            .map_err(|_| "P2P address unavailable".to_string())?.clone();
          if let Some(address) = address {
            let registration = serde_json::json!({
              "peerId": own_peer, "address": address, "receipt": receipt
            }).to_string();
            let _ = hub(&auth, Method::POST,
              &format!("/api/v2/works/{work_id}/peers/replica"),
              Some(&registration)).await;
          }
        }
        return Ok(text);
      }
      Err(error) => last_error = error,
    }
  }
  Err(last_error)
}
