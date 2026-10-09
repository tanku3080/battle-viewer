use battle_p2p_core::cache::Cache;
use battle_p2p_core::content::{Manifest, MAX_COMPRESSED_SIZE};
use futures::io::{AsyncRead, AsyncWrite};
use futures::StreamExt;
use std::future::Future;
use std::io;
use std::pin::Pin;
use std::task::{Context, Poll};
use libp2p::request_response::{self, ProtocolSupport};
use libp2p::swarm::SwarmEvent;
use libp2p::{Multiaddr, PeerId, StreamProtocol, Swarm, SwarmBuilder, identity, noise, tcp, yamux};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::Instant;
use super::network_auth::HubTransferAuthorizer;
use super::settings::{P2pSettings, DEFAULT_UPLOAD_LIMIT_BYTES_PER_SECOND};
use super::image_guard::validate_render_assets;
use battle_p2p_core::content::decode;
use tokio::sync::{mpsc, oneshot};

const PROTOCOL: &str = "/battle-viewer/content/1";
// A maximum-sized upload at the minimum setting (16 KiB/s) can take 512 s.
// Eight simultaneously authorized streams share the same limiter, so allow
// the full bounded worst-case duration instead of timing out slow peers.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(75 * 60);
const MAX_CONCURRENT_STREAMS: usize = 8;
const MAX_REQUEST_BYTES: u64 = 256;
const MAX_RESPONSE_BYTES: u64 = MAX_COMPRESSED_SIZE + 16 * 1024;
const UPLOAD_CHUNK_BYTES: usize = 4 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FetchRequest {
  content_hash: String,
  work_id: String,
  grant: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
enum FetchResponse {
  #[serde(rename = "found")]
  Found {
    manifest: Manifest,
    #[serde(with = "serde_bytes")]
    gzip: Vec<u8>,
    receipt: String,
  },
  #[serde(rename = "notFound")]
  NotFound,
  #[serde(rename = "denied")]
  Denied,
  #[serde(rename = "unavailable")]
  Unavailable,
}

// One shared limiter shapes the aggregate amount of CBOR data handed to
// libp2p/Noise/Yamux, even when distinct peer streams upload concurrently.
// Socket framing/encryption overhead is outside this application-byte budget.
struct UploadLimiter {
  next_send: tokio::sync::Mutex<Option<Instant>>,
  settings: Option<Arc<Mutex<P2pSettings>>>,
}

impl UploadLimiter {
  fn new(settings: Option<Arc<Mutex<P2pSettings>>>) -> Self {
    Self { next_send: tokio::sync::Mutex::new(None), settings }
  }

  fn bytes_per_second(&self) -> u64 {
    self.settings.as_ref().and_then(|value| {
      value.lock().ok().map(|settings| settings.upload_limit_bytes_per_second)
    }).unwrap_or(DEFAULT_UPLOAD_LIMIT_BYTES_PER_SECOND)
  }

  // Revoking redistribution permission must stop an already-authorized
  // response at the next write, not only affect future FetchRequests.
  fn may_serve(&self) -> bool {
    self.settings.as_ref().map(|settings| {
      settings.lock().map(|value| {
        value.participation_enabled && value.redistribution_enabled
      }).unwrap_or(false)
    }).unwrap_or(true)
  }

  async fn reserve(&self, size: usize) {
    let rate = self.bytes_per_second();
    let delay = Duration::from_secs_f64(size as f64 / rate as f64);
    let mut next_send = self.next_send.lock().await;
    let at = next_send.unwrap_or_else(Instant::now).max(Instant::now());
    *next_send = Some(at + delay);
    drop(next_send);
    tokio::time::sleep_until(at).await;
  }
}

// Limit each poll_write to a 4KiB reservation before the built-in CBOR
// codec writes to the underlying stream. No CBOR re-encoding or gzip changes.
struct PacedWriter<'a, W: AsyncWrite + Unpin> {
  inner: &'a mut W,
  limiter: Arc<UploadLimiter>,
  reservation: Option<Pin<Box<dyn Future<Output = ()> + Send>>>,
  available: usize,
}

impl<'a, W: AsyncWrite + Unpin> PacedWriter<'a, W> {
  fn new(inner: &'a mut W, limiter: Arc<UploadLimiter>) -> Self {
    Self { inner, limiter, reservation: None, available: 0 }
  }
}

impl<W: AsyncWrite + Unpin> AsyncWrite for PacedWriter<'_, W> {
  fn poll_write(self: Pin<&mut Self>, cx: &mut Context<'_>, bytes: &[u8]) -> Poll<io::Result<usize>> {
    let this = self.get_mut();
    if !this.limiter.may_serve() {
      return Poll::Ready(Err(io::Error::new(io::ErrorKind::PermissionDenied,
        "P2P redistribution permission was revoked")));
    }
    if bytes.is_empty() { return Poll::Ready(Ok(0)); }
    if this.available == 0 {
      if this.reservation.is_none() {
        let limiter = Arc::clone(&this.limiter);
        let size = bytes.len().min(UPLOAD_CHUNK_BYTES);
        this.reservation = Some(Box::pin(async move { limiter.reserve(size).await }));
      }
      match this.reservation.as_mut().expect("reservation exists").as_mut().poll(cx) {
        Poll::Pending => return Poll::Pending,
        Poll::Ready(()) => {
          this.available = bytes.len().min(UPLOAD_CHUNK_BYTES);
          this.reservation = None;
        }
      }
    }
    match Pin::new(&mut *this.inner).poll_write(cx, &bytes[..bytes.len().min(this.available)]) {
      Poll::Ready(Ok(sent)) => {
        this.available -= sent;
        Poll::Ready(Ok(sent))
      }
      Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
      Poll::Pending => Poll::Pending,
    }
  }

  fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
    Pin::new(&mut *self.get_mut().inner).poll_flush(cx)
  }

  fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
    Pin::new(&mut *self.get_mut().inner).poll_close(cx)
  }
}

#[derive(Clone)]
struct PacedCodec {
  inner: request_response::cbor::codec::Codec<FetchRequest, FetchResponse>,
  limiter: Arc<UploadLimiter>,
}

#[async_trait::async_trait]
impl request_response::Codec for PacedCodec {
  type Protocol = StreamProtocol;
  type Request = FetchRequest;
  type Response = FetchResponse;

  async fn read_request<T>(&mut self, protocol: &Self::Protocol, io: &mut T) -> io::Result<Self::Request>
  where T: AsyncRead + Unpin + Send {
    self.inner.read_request(protocol, io).await
  }

  async fn read_response<T>(&mut self, protocol: &Self::Protocol, io: &mut T) -> io::Result<Self::Response>
  where T: AsyncRead + Unpin + Send {
    self.inner.read_response(protocol, io).await
  }

  async fn write_request<T>(&mut self, protocol: &Self::Protocol, io: &mut T, req: Self::Request) -> io::Result<()>
  where T: AsyncWrite + Unpin + Send {
    self.inner.write_request(protocol, io, req).await
  }

  async fn write_response<T>(&mut self, protocol: &Self::Protocol, io: &mut T, response: Self::Response) -> io::Result<()>
  where T: AsyncWrite + Unpin + Send {
    let mut paced = PacedWriter::new(io, Arc::clone(&self.limiter));
    self.inner.write_response(protocol, &mut paced, response).await
  }
}

type Behaviour = request_response::Behaviour<PacedCodec>;

#[derive(Debug, Clone)]
pub(crate) struct PeerRoute {
  pub peer_id: PeerId,
  pub addresses: Vec<Multiaddr>,
}

#[derive(Clone)]
pub(crate) struct DirectTransportHandle {
  peer_id: PeerId,
  command_tx: mpsc::Sender<Command>,
}

pub(crate) struct DirectTransport {
  handle: DirectTransportHandle,
  listen_addr: Multiaddr,
}

enum Command {
  Fetch {
    routes: Vec<PeerRoute>,
    content_hash: String,
    work_id: String,
    grants: Vec<String>,
    expected_compressed_hash: String,
    reply: oneshot::Sender<Result<String, String>>,
  },
  Shutdown,
}

struct PendingFetch {
  routes: Vec<PeerRoute>,
  route_index: usize,
  content_hash: String,
  work_id: String,
  grants: Vec<String>,
  expected_compressed_hash: String,
  reply: oneshot::Sender<Result<String, String>>,
}

type ResponseChannel = request_response::ResponseChannel<FetchResponse>;

impl DirectTransportHandle {
  pub fn peer_id(&self) -> PeerId {
    self.peer_id
  }

  pub async fn fetch_to_cache(
    &self,
    routes: Vec<PeerRoute>,
    content_hash: String,
  ) -> Result<String, String> {
    self.fetch_authorized(routes, content_hash, String::new(), Vec::new(), String::new()).await
  }

  pub async fn fetch_authorized(
    &self,
    routes: Vec<PeerRoute>,
    content_hash: String,
    work_id: String,
    grants: Vec<String>,
    expected_compressed_hash: String,
  ) -> Result<String, String> {
    if routes.is_empty() || (!grants.is_empty() && grants.len() != routes.len()) {
      return Err("invalid P2P peer routes".into());
    }
    validate_hash(&content_hash)?;
    let (reply_tx, reply_rx) = oneshot::channel();
    self.command_tx
      .send(Command::Fetch {
        routes, content_hash, work_id, grants, expected_compressed_hash, reply: reply_tx,
      }).await.map_err(|_| "P2P network task is not running".to_string())?;
    reply_rx.await.map_err(|_| "P2P network task stopped".to_string())?
  }

  pub async fn shutdown(&self) {
    let _ = self.command_tx.send(Command::Shutdown).await;
  }
}

impl DirectTransport {
  pub fn peer_id(&self) -> PeerId {
    self.handle.peer_id()
  }

  pub fn listen_addr(&self) -> &Multiaddr {
    &self.listen_addr
  }

  pub fn handle(&self) -> DirectTransportHandle {
    self.handle.clone()
  }
}

fn validate_hash(value: &str) -> Result<(), String> {
  if value.len() == 64
    && value
      .bytes()
      .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
  {
    Ok(())
  } else {
    Err("invalid content hash".into())
  }
}

pub(crate) fn keypair_from_seed(seed: &[u8; 32]) -> Result<identity::Keypair, String> {
  let mut bytes = *seed;
  identity::Keypair::ed25519_from_bytes(&mut bytes)
    .map_err(|error| format!("failed to derive libp2p identity: {error}"))
}

fn behaviour(limiter: Arc<UploadLimiter>) -> Behaviour {
  let codec = request_response::cbor::codec::Codec::<FetchRequest, FetchResponse>::default()
    .set_request_size_maximum(MAX_REQUEST_BYTES)
    .set_response_size_maximum(MAX_RESPONSE_BYTES);
  let config = request_response::Config::default()
    .with_request_timeout(REQUEST_TIMEOUT)
    .with_max_concurrent_streams(MAX_CONCURRENT_STREAMS);

  request_response::Behaviour::with_codec(
    PacedCodec { inner: codec, limiter },
    [(StreamProtocol::new(PROTOCOL), ProtocolSupport::Full)],
    config,
  )
}

fn swarm(keypair: identity::Keypair, limiter: Arc<UploadLimiter>) -> Result<Swarm<Behaviour>, String> {
  SwarmBuilder::with_existing_identity(keypair)
    .with_tokio()
    .with_tcp(
      tcp::Config::default().nodelay(true),
      noise::Config::new,
      yamux::Config::default,
    )
    .map_err(|error| format!("failed to configure P2P TCP transport: {error}"))?
    .with_behaviour(move |_| behaviour(limiter))
    .map_err(|error| format!("failed to configure P2P behaviour: {error}"))
    .map(|builder| {
      builder
        .with_swarm_config(|config| config.with_idle_connection_timeout(Duration::from_secs(20)))
        .build()
    })
}

pub(crate) async fn spawn_authorized_direct_transport(
  identity_seed: &[u8; 32],
  cache: Arc<Mutex<Cache>>,
  listen_addr: Multiaddr,
  authorizer: HubTransferAuthorizer,
  settings: Arc<Mutex<P2pSettings>>,
) -> Result<DirectTransport, String> {
  spawn_transport(identity_seed, cache, true, listen_addr, Some(authorizer), Some(settings)).await
}

#[cfg(test)]
pub(crate) async fn spawn_direct_transport(
  identity_seed: &[u8; 32],
  cache: Arc<Mutex<Cache>>,
  allow_serving: bool,
  listen_addr: Multiaddr,
) -> Result<DirectTransport, String> {
  spawn_transport(identity_seed, cache, allow_serving, listen_addr, None, None).await
}

async fn spawn_transport(
  identity_seed: &[u8; 32],
  cache: Arc<Mutex<Cache>>,
  allow_serving: bool,
  listen_addr: Multiaddr,
  authorizer: Option<HubTransferAuthorizer>,
  settings: Option<Arc<Mutex<P2pSettings>>>,
) -> Result<DirectTransport, String> {
  let limiter = Arc::new(UploadLimiter::new(settings.clone()));
  let mut swarm = swarm(keypair_from_seed(identity_seed)?, limiter)?;
  swarm
    .listen_on(listen_addr)
    .map_err(|error| format!("failed to start P2P listener: {error}"))?;

  let listen_addr = loop {
    match swarm.select_next_some().await {
      SwarmEvent::NewListenAddr { address, .. } => break address,
      SwarmEvent::ListenerError { error, .. } => {
        return Err(format!("P2P listener failed: {error}"));
      }
      _ => {}
    }
  };

  let peer_id = *swarm.local_peer_id();
  let (command_tx, command_rx) = mpsc::channel(8);
  tokio::spawn(run_actor(
    swarm,
    cache,
    allow_serving,
    authorizer,
    settings,
    command_rx,
  ));

  Ok(DirectTransport {
    handle: DirectTransportHandle {
      peer_id,
      command_tx,
    },
    listen_addr,
  })
}

async fn run_actor(
  mut swarm: Swarm<Behaviour>,
  cache: Arc<Mutex<Cache>>,
  allow_serving: bool,
  authorizer: Option<HubTransferAuthorizer>,
  settings: Option<Arc<Mutex<P2pSettings>>>,
  mut command_rx: mpsc::Receiver<Command>,
) {
  use request_response::{Event, Message};

  let mut pending: Option<(
    request_response::OutboundRequestId,
    PendingFetch,
  )> = None;
  let mut validating_response = false;

  let (serve_tx, mut serve_rx) =
    mpsc::channel::<(ResponseChannel, FetchResponse)>(MAX_CONCURRENT_STREAMS);
  let (accept_tx, mut accept_rx) =
    mpsc::channel::<(PendingFetch, Result<String, String>)>(1);

  loop {
    tokio::select! {
      maybe_command = command_rx.recv() => {
        match maybe_command {
          Some(Command::Fetch { routes, content_hash, work_id, grants, expected_compressed_hash, reply }) => {
            if pending.is_some() || validating_response {
              let _ = reply.send(Err("another P2P fetch is already in progress".into()));
              continue;
            }
            let mut state = PendingFetch {
              routes,
              route_index: 0,
              content_hash,
              work_id,
              grants,
              expected_compressed_hash,
              reply,
            };
            let request_id = send_next_request(&mut swarm, &mut state);
            pending = Some((request_id, state));
          }
          Some(Command::Shutdown) | None => break,
        }
      }

      Some((channel, response)) = serve_rx.recv() => {
        let _ = swarm.behaviour_mut().send_response(channel, response);
      }

      Some((state, result)) = accept_rx.recv() => {
        validating_response = false;
        match result {
          Ok(receipt) => {
            let _ = state.reply.send(Ok(receipt));
          }
          Err(error) => {
            pending = retry_or_finish(&mut swarm, state, error);
          }
        }
      }

      event = swarm.select_next_some() => {
        match event {
          SwarmEvent::Behaviour(Event::Message { peer, message, .. }) => {
            match message {
              Message::Request { request, channel, .. } => {
                let cache = Arc::clone(&cache);
                let serve_tx = serve_tx.clone();
                let authorizer = authorizer.clone();
                let settings = settings.clone();
                let provider_peer = swarm.local_peer_id().to_string();
                let requester_peer = peer.to_string();
                tokio::spawn(async move {
                  let still_consented = settings.as_ref().map(|settings| {
                    settings.lock().map(|settings| {
                      settings.participation_enabled && settings.redistribution_enabled
                    }).unwrap_or(false)
                  }).unwrap_or(cfg!(test));
                  let receipt = if !still_consented {
                    Err("P2P redistribution consent is disabled".to_string())
                  } else if let Some(auth) = authorizer {
                    auth.check(
                      &request.work_id,
                      &request.grant,
                      &provider_peer,
                      &requester_peer,
                      &request.content_hash,
                    ).await
                  } else {
                    #[cfg(test)]
                    { Ok(String::new()) }
                    #[cfg(not(test))]
                    { Err("No Hub authorization".to_string()) }
                  };
                  let response = match receipt {
                    Ok(receipt) => {
                      tokio::task::spawn_blocking(move || {
                        serve_request(&cache, allow_serving, request, receipt)
                      }).await.unwrap_or(FetchResponse::Unavailable)
                    }
                    Err(_) => FetchResponse::Denied
                  };
                  let _ = serve_tx.send((channel, response)).await;
                });
              }
              Message::Response { request_id, response } => {
                if let Some((expected_id, state)) = pending.take() {
                  if request_id != expected_id {
                    pending = Some((expected_id, state));
                    continue;
                  }

                  validating_response = true;
                  let cache = Arc::clone(&cache);
                  let accept_tx = accept_tx.clone();
                  let expected_hash = state.content_hash.clone();
                  let expected_compressed_hash = state.expected_compressed_hash.clone();
                  tokio::spawn(async move {
                    let result = tokio::task::spawn_blocking(move || {
                      accept_response(&cache, &expected_hash, &expected_compressed_hash, response)
                    })
                    .await
                    .unwrap_or_else(|error| {
                      Err(format!("P2P content validation worker failed: {error}"))
                    });
                    let _ = accept_tx.send((state, result)).await;
                  });
                }
              }
            }
          }
          SwarmEvent::Behaviour(Event::OutboundFailure { request_id, error, .. }) => {
            if let Some((expected_id, state)) = pending.take() {
              if request_id != expected_id {
                pending = Some((expected_id, state));
                continue;
              }
              pending = retry_or_finish(
                &mut swarm,
                state,
                format!("P2P request failed: {error}"),
              );
            }
          }
          _ => {}
        }
      }
    }
  }

  if let Some((_, state)) = pending {
    let _ = state.reply.send(Err("P2P network task stopped".into()));
  }
}
fn send_next_request(
  swarm: &mut Swarm<Behaviour>,
  state: &mut PendingFetch,
) -> request_response::OutboundRequestId {
  let route = &state.routes[state.route_index];
  swarm.behaviour_mut().send_request_with_addresses(
    &route.peer_id,
    FetchRequest {
      content_hash: state.content_hash.clone(),
      work_id: state.work_id.clone(),
      grant: state.grants.get(state.route_index).cloned().unwrap_or_default(),
    },
    route.addresses.clone(),
  )
}

fn retry_or_finish(
  swarm: &mut Swarm<Behaviour>,
  mut state: PendingFetch,
  error: String,
) -> Option<(request_response::OutboundRequestId, PendingFetch)> {
  state.route_index += 1;
  if state.route_index >= state.routes.len() {
    let _ = state.reply.send(Err(error));
    return None;
  }

  let request_id = send_next_request(swarm, &mut state);
  Some((request_id, state))
}

fn serve_request(
  cache: &Arc<Mutex<Cache>>,
  allow_serving: bool,
  request: FetchRequest,
  receipt: String,
) -> FetchResponse {
  if !allow_serving {
    return FetchResponse::Denied;
  }
  if validate_hash(&request.content_hash).is_err() {
    return FetchResponse::Denied;
  }

  let cache = match cache.lock() {
    Ok(cache) => cache,
    Err(_) => return FetchResponse::Unavailable,
  };

  match cache.read(&request.content_hash) {
    Ok((manifest, gzip)) => {
      // Reject older local cache entries that have not passed image decoding.
      match decode(&manifest, &gzip)
        .map_err(|error| error.to_string())
        .and_then(|raw| validate_render_assets(&raw))
      {
        Ok(()) => FetchResponse::Found { manifest, gzip, receipt },
        Err(_) => FetchResponse::Denied,
      }
    }
    Err(_) => FetchResponse::NotFound,
  }
}

fn accept_response(
  cache: &Arc<Mutex<Cache>>,
  expected_hash: &str,
  expected_compressed_hash: &str,
  response: FetchResponse,
) -> Result<String, String> {
  match response {
    FetchResponse::Found { manifest, gzip, receipt } => {
      if manifest.content_hash != expected_hash {
        return Err("P2P peer returned a different content hash".into());
      }
      if !expected_compressed_hash.is_empty() && manifest.compressed_hash != expected_compressed_hash {
        return Err("P2P peer returned a compressed representation that does not match Hub".into());
      }
      // Reject malicious raster payloads *before* publishing to the native cache.
      let raw = decode(&manifest, &gzip)
        .map_err(|error| format!("rejected P2P content: {error}"))?;
      validate_render_assets(&raw)?;
      let mut cache = cache
        .lock()
        .map_err(|_| "failed to lock P2P cache".to_string())?;
      cache
        .store(&manifest, &gzip)
        .map_err(|error| format!("rejected P2P content: {error}"))?;
      Ok(receipt)
    }
    FetchResponse::NotFound => Err("P2P peer does not have the requested content".into()),
    FetchResponse::Denied => Err("P2P peer denied the transfer".into()),
    FetchResponse::Unavailable => Err("P2P peer could not read its local cache".into()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use battle_p2p_core::content::encode;

  fn test_document(title: &str) -> Vec<u8> {
    format!(
      r#"{{"title":"{title}","map":{{"width":100,"height":100,"coordinateOrigin":"center"}},"units":[],"timeline":{{"units":{{}}}}}}"#
    )
    .into_bytes()
  }

  #[tokio::test]
  async fn configured_upload_limit_shares_bandwidth_across_streams() {
    use futures::io::{AsyncWriteExt, Cursor};

    let settings = Arc::new(Mutex::new(P2pSettings {
      participation_enabled: true,
      redistribution_enabled: true,
      upload_limit_bytes_per_second: 16 * 1024,
      ..P2pSettings::default()
    }));
    let limiter = Arc::new(UploadLimiter::new(Some(Arc::clone(&settings))));
    assert_eq!(limiter.bytes_per_second(), 16 * 1024);

    let start = Instant::now();
    let (a, b) = tokio::join!(
      async {
        let mut output = Cursor::new(Vec::new());
        PacedWriter::new(&mut output, Arc::clone(&limiter))
          .write_all(&vec![b'a'; 8 * 1024]).await.unwrap();
        output.into_inner()
      },
      async {
        let mut output = Cursor::new(Vec::new());
        PacedWriter::new(&mut output, Arc::clone(&limiter))
          .write_all(&vec![b'b'; 8 * 1024]).await.unwrap();
        output.into_inner()
      }
    );
    assert_eq!(a, vec![b'a'; 8 * 1024]);
    assert_eq!(b, vec![b'b'; 8 * 1024]);
    // Four aggregate 4KiB chunks at 16KiB/s begin at 0, .25, .5, .75s.
    assert!(start.elapsed() >= Duration::from_millis(650),
      "concurrent uploads bypassed the shared limiter");

    settings.lock().unwrap().upload_limit_bytes_per_second = 512 * 1024;
    assert_eq!(limiter.bytes_per_second(), 512 * 1024);
    settings.lock().unwrap().redistribution_enabled = false;
    let mut rejected = Cursor::new(Vec::new());
    let error = PacedWriter::new(&mut rejected, Arc::clone(&limiter))
      .write_all(&[1, 2, 3]).await.unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
  }

  fn test_cache(quota: u64) -> (tempfile::TempDir, Arc<Mutex<Cache>>) {
    let dir = tempfile::tempdir().unwrap();
    let cache = Cache::open(dir.path(), quota).unwrap();
    (dir, Arc::new(Mutex::new(cache)))
  }

  #[test]
  fn malformed_raster_is_neither_accepted_nor_served() {
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\n");
    let raw = format!(
      r#"{{"title":"bad image","map":{{"width":100,"height":100,"coordinateOrigin":"center","image":"data:image/png;base64,{encoded}"}},"units":[]}}"#
    );
    let (manifest, gzip) = encode(raw.as_bytes()).unwrap();
    let (_source, source_cache) = test_cache(32 * 1024 * 1024);
    let (_dest, dest_cache) = test_cache(32 * 1024 * 1024);
    source_cache.lock().unwrap().store(&manifest, &gzip).unwrap();
    let request = FetchRequest {
      content_hash: manifest.content_hash.clone(),
      work_id: "01234567-89ab-cdef-0123-456789abcdef".into(),
      grant: "for-test".into(),
    };
    assert!(matches!(
      serve_request(&source_cache, true, request, "receipt".into()),
      FetchResponse::Denied
    ));
    let expected_content_hash = manifest.content_hash.clone();
    let expected_compressed_hash = manifest.compressed_hash.clone();
    let result = accept_response(
      &dest_cache,
      &expected_content_hash,
      &expected_compressed_hash,
      FetchResponse::Found { manifest, gzip, receipt: "receipt".into() },
    );
    assert!(result.is_err());
    assert!(dest_cache.lock().unwrap().inventory().unwrap().entries.is_empty());
  }

  #[test]
  fn rejects_compressed_digest_mismatch_without_cache_write() {
    let raw = test_document("compressed representation mismatch");
    let (manifest, gzip) = encode(&raw).unwrap();
    let (_dir, cache) = test_cache(32 * 1024 * 1024);
    let wrong = "f".repeat(64);
    assert_ne!(manifest.compressed_hash, wrong);
    let result = accept_response(
      &cache,
      &manifest.content_hash,
      &wrong,
      FetchResponse::Found { manifest: manifest.clone(), gzip, receipt: "r".into() },
    );
    assert!(result.is_err());
    assert!(cache.lock().unwrap().inventory().unwrap().entries.is_empty());
  }

  #[test]
  fn deterministic_seed_produces_stable_peer_id() {
    let seed = [7u8; 32];
    let first = keypair_from_seed(&seed).unwrap().public().to_peer_id();
    let second = keypair_from_seed(&seed).unwrap().public().to_peer_id();
    assert_eq!(first, second);
  }

  #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
  async fn consent_off_denies_serving() {
    let source_bytes = test_document("denied");
    let (manifest, gzip) = encode(&source_bytes).unwrap();

    let (_a_dir, a_cache) = test_cache(32 * 1024 * 1024);
    a_cache.lock().unwrap().store(&manifest, &gzip).unwrap();
    let (_b_dir, b_cache) = test_cache(32 * 1024 * 1024);

    let a = spawn_direct_transport(
      &[1u8; 32],
      a_cache,
      false,
      "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
      .await
      .unwrap();
    let b = spawn_direct_transport(
      &[2u8; 32],
      b_cache,
      true,
      "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
      .await
      .unwrap();

    let result = b
      .handle()
      .fetch_to_cache(
        vec![PeerRoute {
          peer_id: a.peer_id(),
          addresses: vec![a.listen_addr().clone()],
        }],
        manifest.content_hash.clone(),
      )
      .await;

    assert!(result.unwrap_err().contains("denied"));
    a.handle().shutdown().await;
    b.handle().shutdown().await;
  }

  #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
  async fn a_to_b_to_c_preserves_exact_gzip_and_supports_replica_serving() {
    let source_bytes = test_document("A to B to C");
    let (manifest, gzip) = encode(&source_bytes).unwrap();

    let (_a_dir, a_cache) = test_cache(32 * 1024 * 1024);
    a_cache.lock().unwrap().store(&manifest, &gzip).unwrap();
    let (_b_dir, b_cache) = test_cache(32 * 1024 * 1024);
    let (_c_dir, c_cache) = test_cache(32 * 1024 * 1024);

    let a = spawn_direct_transport(
      &[11u8; 32],
      Arc::clone(&a_cache),
      true,
      "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
      .await
      .unwrap();
    let b = spawn_direct_transport(
      &[12u8; 32],
      Arc::clone(&b_cache),
      true,
      "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
      .await
      .unwrap();
    let c = spawn_direct_transport(
      &[13u8; 32],
      Arc::clone(&c_cache),
      false,
      "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
      .await
      .unwrap();

    b.handle()
      .fetch_to_cache(
        vec![PeerRoute {
          peer_id: a.peer_id(),
          addresses: vec![a.listen_addr().clone()],
        }],
        manifest.content_hash.clone(),
      )
      .await
      .unwrap();

    let (b_manifest, b_gzip) = b_cache
      .lock()
      .unwrap()
      .read(&manifest.content_hash)
      .unwrap();
    assert_eq!(b_manifest, manifest);
    assert_eq!(b_gzip, gzip);

    c.handle()
      .fetch_to_cache(
        vec![PeerRoute {
          peer_id: b.peer_id(),
          addresses: vec![b.listen_addr().clone()],
        }],
        manifest.content_hash.clone(),
      )
      .await
      .unwrap();

    let (c_manifest, c_gzip) = c_cache
      .lock()
      .unwrap()
      .read(&manifest.content_hash)
      .unwrap();
    assert_eq!(c_manifest, manifest);
    assert_eq!(c_gzip, gzip);
    assert_eq!(
      c_cache
        .lock()
        .unwrap()
        .read_raw(&manifest.content_hash)
        .unwrap(),
      source_bytes
    );

    a.handle().shutdown().await;
    b.handle().shutdown().await;
    c.handle().shutdown().await;
  }

  #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
  async fn retries_next_peer_route_after_failure() {
    let source_bytes = test_document("retry");
    let (manifest, gzip) = encode(&source_bytes).unwrap();

    let (_a_dir, a_cache) = test_cache(32 * 1024 * 1024);
    a_cache.lock().unwrap().store(&manifest, &gzip).unwrap();
    let (_b_dir, b_cache) = test_cache(32 * 1024 * 1024);

    let a = spawn_direct_transport(
      &[21u8; 32],
      a_cache,
      true,
      "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
      .await
      .unwrap();
    let b = spawn_direct_transport(
      &[22u8; 32],
      Arc::clone(&b_cache),
      false,
      "/ip4/127.0.0.1/tcp/0".parse().unwrap(),
    )
      .await
      .unwrap();

    let unreachable: Multiaddr = "/ip4/127.0.0.1/tcp/1".parse().unwrap();
    b.handle()
      .fetch_to_cache(
        vec![
          PeerRoute {
            peer_id: keypair_from_seed(&[99u8; 32])
              .unwrap()
              .public()
              .to_peer_id(),
            addresses: vec![unreachable],
          },
          PeerRoute {
            peer_id: a.peer_id(),
            addresses: vec![a.listen_addr().clone()],
          },
        ],
        manifest.content_hash.clone(),
      )
      .await
      .unwrap();

    assert!(b_cache
      .lock()
      .unwrap()
      .read(&manifest.content_hash)
      .is_ok());

    a.handle().shutdown().await;
    b.handle().shutdown().await;
  }
}
