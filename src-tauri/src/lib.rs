mod p2p;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

// Development uses localhost; release packages use the deployed Hub.
#[cfg(debug_assertions)]
const DEFAULT_HUB_URL: &str = "http://localhost:8080";
#[cfg(not(debug_assertions))]
const DEFAULT_HUB_URL: &str = "https://battle-hub.onrender.com";

#[derive(Clone, Default)]
pub(crate) struct AuthState {
  access_token: Arc<Mutex<Option<String>>>,
  refresh_token: Arc<Mutex<Option<String>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginRequest {
  username: String,
  password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HubAuthResponse {
  token: String,
  username: String,
  expires_at: String,
  refresh_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionView {
  username: String,
  expires_at: String,
}

#[derive(Serialize)]
struct CommandResponse<T>
where
  T: Serialize,
{
  ok: bool,
  status: u16,
  data: Option<T>,
  error: Option<String>,
}

impl<T> CommandResponse<T>
where
  T: Serialize,
{
  fn success(status: u16, data: T) -> Self {
    Self {
      ok: true,
      status,
      data: Some(data),
      error: None,
    }
  }

  fn failure(status: u16, error: impl Into<String>) -> Self {
    Self {
      ok: false,
      status,
      data: None,
      error: Some(error.into()),
    }
  }
}

pub(crate) fn hub_base_url() -> String {
  std::env::var("BATTLE_HUB_API_BASE_URL")
    .unwrap_or_else(|_| DEFAULT_HUB_URL.to_string())
    .trim_end_matches('/')
    .to_string()
}


const HUB_COLD_START_RETRIES: usize = 7;
/// Render Free may take tens of seconds to wake. Retry only requests that
/// have no side effects, or explicit login/refresh calls handled separately.
/// Never replay publication, grant consumption, or other unsafe POST operations.
async fn send_hub_get_with_retry(
  client: &reqwest::Client,
  token: &str,
  path: &str,
) -> Result<reqwest::Response, String> {
  for attempt in 0..=HUB_COLD_START_RETRIES {
    let result = client.get(format!("{}{}", hub_base_url(), path))
      .bearer_auth(token)
      .timeout(std::time::Duration::from_secs(12))
      .send().await;
    match result {
      Ok(response) if [502, 503, 504].contains(&response.status().as_u16())
        && attempt < HUB_COLD_START_RETRIES => {},
      Ok(response) => return Ok(response),
      Err(_) if attempt < HUB_COLD_START_RETRIES => {},
      Err(error) => return Err(format!("Cannot connect to Battle Hub: {error}")),
    }
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
  }
  Err("Battle Hub did not become available after retry".into())
}


/// Probe readiness before a one-shot authentication POST. In particular, a
/// refresh POST must never be automatically replayed when its response is lost:
/// the server could already have rotated the single-use refresh token.
async fn wait_for_hub_ready(client: &reqwest::Client) -> Result<(), String> {
  for attempt in 0..=HUB_COLD_START_RETRIES {
    let result = client.get(format!("{}/api/health", hub_base_url()))
      .timeout(std::time::Duration::from_secs(12)).send().await;
    match result {
      Ok(response) if response.status().is_success() => return Ok(()),
      Ok(response) if [502, 503, 504].contains(&response.status().as_u16())
        && attempt < HUB_COLD_START_RETRIES => {},
      Ok(response) => return Err(format!(
        "Battle Hub health check returned HTTP {}", response.status())),
      Err(_) if attempt < HUB_COLD_START_RETRIES => {},
      Err(error) => return Err(format!("Cannot connect to Battle Hub: {error}")),
    }
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
  }
  Err("Battle Hub did not become available after retry".into())
}

async fn parse_error(response: reqwest::Response) -> CommandResponse<Value> {
  let status = response.status().as_u16();
  let body = response.text().await.unwrap_or_default();

  let message = serde_json::from_str::<Value>(&body)
    .ok()
    .and_then(|value| {
      value
        .get("details")
        .and_then(Value::as_array)
        .map(|items| {
          items
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(", ")
        })
        .filter(|text| !text.is_empty())
        .or_else(|| {
          value
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_string)
        })
    })
    .unwrap_or_else(|| {
      if body.is_empty() {
        format!("HTTP {status}")
      } else {
        body
      }
    });

  CommandResponse::failure(status, message)
}

async fn refresh_access_token(
  client: &reqwest::Client,
  state: &AuthState,
) -> Result<String, String> {
  let refresh_token = state
    .refresh_token
    .lock()
    .map_err(|_| "Failed to lock authentication state")?
    .clone()
    .ok_or_else(|| "Refresh token is not available".to_string())?;

  wait_for_hub_ready(client).await?;
  let response = client.post(format!("{}/api/auth/refresh", hub_base_url()))
    .json(&serde_json::json!({ "refreshToken": refresh_token }))
    .timeout(std::time::Duration::from_secs(12))
    .send().await
    .map_err(|error| format!("Cannot connect to Battle Hub: {error}"))?;

  if !response.status().is_success() {
    return Err(format!(
      "Failed to refresh the access token: HTTP {}",
      response.status().as_u16()
    ));
  }

  let payload = response
    .json::<HubAuthResponse>()
    .await
    .map_err(|error| format!("Failed to read authentication response: {error}"))?;

  *state
    .access_token
    .lock()
    .map_err(|_| "Failed to lock authentication state")? = Some(payload.token.clone());

  if let Some(rotated) = payload.refresh_token {
    *state
      .refresh_token
      .lock()
      .map_err(|_| "Failed to lock authentication state")? = Some(rotated);
  }

  Ok(payload.token)
}

pub(crate) async fn authenticated_request(
  client: &reqwest::Client,
  state: &AuthState,
  method: reqwest::Method,
  path: &str,
  body: Option<&str>,
) -> Result<reqwest::Response, String> {
  let token = state
    .access_token
    .lock()
    .map_err(|_| "Failed to lock authentication state")?
    .clone()
    .ok_or_else(|| "Not signed in".to_string())?;

  let build = |token: &str| {
    let mut request = client
      .request(method.clone(), format!("{}{}", hub_base_url(), path))
      .bearer_auth(token);

    if let Some(body) = body {
      request = request
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_owned());
    }

    request
  };

  let response = if method == reqwest::Method::GET && body.is_none() {
    send_hub_get_with_retry(client, &token, path).await?
  } else {
    build(&token).send().await
      .map_err(|error| format!("Cannot connect to Battle Hub: {error}"))?
  };

  if response.status() != reqwest::StatusCode::UNAUTHORIZED {
    return Ok(response);
  }

  let refreshed = refresh_access_token(client, state).await?;
  if method == reqwest::Method::GET && body.is_none() {
    send_hub_get_with_retry(client, &refreshed, path).await
  } else {
    build(&refreshed).send().await
      .map_err(|error| format!("Cannot connect to Battle Hub: {error}"))
  }
}

#[tauri::command]
async fn auth_login(
  request: LoginRequest,
  state: State<'_, AuthState>,
) -> Result<CommandResponse<SessionView>, String> {
  let client = reqwest::Client::new();

  if let Err(error) = wait_for_hub_ready(&client).await {
    return Ok(CommandResponse::failure(502, error));
  }
  let response = match client.post(format!("{}/api/auth/login", hub_base_url()))
    .json(&serde_json::json!({
      "username": request.username,
      "password": request.password,
    }))
    .timeout(std::time::Duration::from_secs(12))
    .send().await
  {
    Ok(response) => response,
    Err(error) => {
      return Ok(CommandResponse::failure(
        502,
        format!("Cannot connect to Battle Hub: {error}"),
      ));
    }
  };

  if !response.status().is_success() {
    let error = parse_error(response).await;
    return Ok(CommandResponse::failure(
      error.status,
      error
        .error
        .unwrap_or_else(|| "Sign-in failed".to_string()),
    ));
  }

  let payload = match response.json::<HubAuthResponse>().await {
    Ok(payload) => payload,
    Err(error) => {
      return Ok(CommandResponse::failure(
        502,
        format!("Failed to read authentication response: {error}"),
      ));
    }
  };

  *state
    .access_token
    .lock()
    .map_err(|_| "Failed to lock authentication state".to_string())? =
    Some(payload.token);

  *state
    .refresh_token
    .lock()
    .map_err(|_| "Failed to lock authentication state".to_string())? =
    payload.refresh_token;

  Ok(CommandResponse::success(
    200,
    SessionView {
      username: payload.username,
      expires_at: payload.expires_at,
    },
  ))
}

#[tauri::command]
async fn auth_session(
  state: State<'_, AuthState>,
) -> Result<CommandResponse<SessionView>, String> {
  let client = reqwest::Client::new();

  let response = match authenticated_request(
    &client,
    &state,
    reqwest::Method::GET,
    "/api/auth/session",
    None,
  )
  .await
  {
    Ok(response) => response,
    Err(error) => return Ok(CommandResponse::failure(if error == "Not signed in" { 401 } else { 502 }, error)),
  };

  if !response.status().is_success() {
    let error = parse_error(response).await;
    return Ok(CommandResponse::failure(
      error.status,
      error.error.unwrap_or_else(|| "Unauthorized".to_string()),
    ));
  }

  match response.json::<HubAuthResponse>().await {
    Ok(payload) => Ok(CommandResponse::success(
      200,
      SessionView {
        username: payload.username,
        expires_at: payload.expires_at,
      },
    )),
    Err(error) => Ok(CommandResponse::failure(
      502,
      format!("Failed to read session response: {error}"),
    )),
  }
}

#[tauri::command]
async fn auth_logout(
  state: State<'_, AuthState>,
  p2p_state: State<'_, p2p::P2pState>,
) -> Result<CommandResponse<Value>, String> {
  p2p::stop_on_logout(&p2p_state).await;
  let access = state
    .access_token
    .lock()
    .ok()
    .and_then(|value| value.clone());

  let refresh = state
    .refresh_token
    .lock()
    .ok()
    .and_then(|value| value.clone());

  if let Some(token) = access {
    let client = reqwest::Client::new();
    let mut request = client
      .post(format!("{}/api/auth/logout", hub_base_url()))
      .bearer_auth(token);

    if let Some(refresh_token) = refresh {
      request = request.json(&serde_json::json!({
        "refreshToken": refresh_token
      }));
    }

    let _ = request.send().await;
  }

  if let Ok(mut value) = state.access_token.lock() {
    *value = None;
  }

  if let Ok(mut value) = state.refresh_token.lock() {
    *value = None;
  }

  Ok(CommandResponse::success(204, Value::Null))
}

#[tauri::command]
async fn hub_battle_json(id: String, state: State<'_, AuthState>) -> Result<CommandResponse<Value>, String> {
  let valid = id.len() == 36 && id.chars().enumerate().all(|(index, character)| {
    if [8, 13, 18, 23].contains(&index) {
      character == '-'
    } else {
      character.is_ascii_hexdigit()
    }
  });
  if !valid {
    return Ok(CommandResponse::failure(400, "Invalid battle ID"));
  }
  let response = match authenticated_request(
    &reqwest::Client::new(), &state, reqwest::Method::GET,
    &format!("/api/battles/{id}"), None,
  ).await {
    Ok(response) => response,
    Err(error) => return Ok(CommandResponse::failure(502, error)),
  };
  if !response.status().is_success() {
    return Ok(parse_error(response).await);
  }
  let value = response.json::<Value>().await.map_err(|error| error.to_string())?;
  match value.get("battleJson") {
    Some(json) if json.is_object() => Ok(CommandResponse::success(200, json.clone())),
    _ => Ok(CommandResponse::failure(502, "Battle Hub returned invalid JSON")),
  }
}

fn resource_path(resource: &str) -> Option<(&'static str, bool)> {
  match resource {
    "health" => Some(("/api/health", false)),
    "forces" => Some(("/api/forces", true)),
    "battles" => Some(("/api/battles", true)),
    "works" => Some(("/api/v2/works", true)),
    _ => None,
  }
}

#[tauri::command]
async fn hub_get(
  resource: String,
  state: State<'_, AuthState>,
) -> Result<CommandResponse<Value>, String> {
  let Some((path, authenticated)) = resource_path(&resource) else {
    return Ok(CommandResponse::failure(400, "Unsupported resource"));
  };

  let client = reqwest::Client::new();

  let response = if authenticated {
    match authenticated_request(
      &client,
      &state,
      reqwest::Method::GET,
      path,
      None,
    )
    .await
    {
      Ok(response) => response,
      Err(error) => return Ok(CommandResponse::failure(if error == "Not signed in" { 401 } else { 502 }, error)),
    }
  } else {
    match client
      .get(format!("{}{}", hub_base_url(), path))
      .send()
      .await
    {
      Ok(response) => response,
      Err(error) => {
        return Ok(CommandResponse::failure(
          502,
          format!("Cannot connect to Battle Hub: {error}"),
        ));
      }
    }
  };

  if !response.status().is_success() {
    return Ok(parse_error(response).await);
  }

  let status = response.status().as_u16();

  match response.json::<Value>().await {
    Ok(value) => Ok(CommandResponse::success(status, value)),
    Err(error) => Ok(CommandResponse::failure(
      502,
      format!("Failed to read response: {error}"),
    )),
  }
}

#[tauri::command]
async fn hub_post(
  resource: String,
  body: String,
  state: State<'_, AuthState>,
) -> Result<CommandResponse<Value>, String> {
  let path = match resource.as_str() {
    "forces" => "/api/forces",
    "battles" => "/api/battles",
    _ => return Ok(CommandResponse::failure(400, "Unsupported resource")),
  };

  let client = reqwest::Client::new();

  let response = match authenticated_request(
    &client,
    &state,
    reqwest::Method::POST,
    path,
    Some(&body),
  )
  .await
  {
    Ok(response) => response,
    Err(error) => return Ok(CommandResponse::failure(if error == "Not signed in" { 401 } else { 502 }, error)),
  };

  if !response.status().is_success() {
    return Ok(parse_error(response).await);
  }

  let status = response.status().as_u16();

  match response.json::<Value>().await {
    Ok(value) => Ok(CommandResponse::success(status, value)),
    Err(error) => Ok(CommandResponse::failure(
      502,
      format!("Failed to read response: {error}"),
    )),
  }
}

#[tauri::command]
async fn hub_search_works(query: String, state: State<'_, AuthState>) -> Result<CommandResponse<Value>, String> {
  if query.chars().count() > 200 {
    return Ok(CommandResponse::failure(400, "Search query is too long"));
  }
  let mut url = reqwest::Url::parse("http://localhost/api/v2/works")
    .map_err(|error| error.to_string())?;
  url.query_pairs_mut().append_pair("query", &query);
  let path = format!("/api/v2/works?{}", url.query().unwrap_or(""));
  let client = reqwest::Client::new();
  let response = match authenticated_request(&client, &state, reqwest::Method::GET, &path, None).await {
    Ok(response) => response,
    Err(error) => return Ok(CommandResponse::failure(502, error)),
  };
  if !response.status().is_success() { return Ok(parse_error(response).await); }
  let data = response.json::<Value>().await.map_err(|error| error.to_string())?;
  Ok(CommandResponse::success(200, data))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AuthState::default())
    .invoke_handler(tauri::generate_handler![
      auth_login,
      auth_session,
      auth_logout,
      hub_get,
      hub_post,
      hub_battle_json,
      hub_search_works,
      p2p::p2p_get_status,
      p2p::p2p_update_settings,
      p2p::p2p_get_inventory,
      p2p::commands::p2p_start,
      p2p::commands::p2p_stop,
      p2p::commands::p2p_publish,
      p2p::commands::p2p_fetch
    ])
    .setup(|app| {
      let p2p_state = match app.path().app_data_dir() {
        Ok(app_data_dir) => p2p::P2pState::initialize(app_data_dir.join("p2p")),
        Err(error) => p2p::P2pState::unavailable(format!(
          "failed to resolve app data directory: {error}"
        )),
      };
      app.manage(p2p_state);

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
