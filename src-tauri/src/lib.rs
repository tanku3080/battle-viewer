use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

const DEFAULT_HUB_URL: &str = "http://localhost:8080";

#[derive(Default)]
struct AuthState {
  access_token: Mutex<Option<String>>,
  refresh_token: Mutex<Option<String>>,
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

fn hub_base_url() -> String {
  std::env::var("BATTLE_HUB_API_BASE_URL")
    .unwrap_or_else(|_| DEFAULT_HUB_URL.to_string())
    .trim_end_matches('/')
    .to_string()
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
    .map_err(|_| "認証状態のロックに失敗しました")?
    .clone()
    .ok_or_else(|| "Refresh Tokenがありません".to_string())?;

  let response = client
    .post(format!("{}/api/auth/refresh", hub_base_url()))
    .json(&serde_json::json!({ "refreshToken": refresh_token }))
    .send()
    .await
    .map_err(|error| format!("Battle Hubに接続できません: {error}"))?;

  if !response.status().is_success() {
    return Err(format!(
      "Refresh Tokenの更新に失敗しました: HTTP {}",
      response.status().as_u16()
    ));
  }

  let payload = response
    .json::<HubAuthResponse>()
    .await
    .map_err(|error| format!("認証レスポンスを読み込めません: {error}"))?;

  *state
    .access_token
    .lock()
    .map_err(|_| "認証状態のロックに失敗しました")? = Some(payload.token.clone());

  if let Some(rotated) = payload.refresh_token {
    *state
      .refresh_token
      .lock()
      .map_err(|_| "認証状態のロックに失敗しました")? = Some(rotated);
  }

  Ok(payload.token)
}

async fn authenticated_request(
  client: &reqwest::Client,
  state: &AuthState,
  method: reqwest::Method,
  path: &str,
  body: Option<&str>,
) -> Result<reqwest::Response, String> {
  let token = state
    .access_token
    .lock()
    .map_err(|_| "認証状態のロックに失敗しました")?
    .clone()
    .ok_or_else(|| "ログインしていません".to_string())?;

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

  let response = build(&token)
    .send()
    .await
    .map_err(|error| format!("Battle Hubに接続できません: {error}"))?;

  if response.status() != reqwest::StatusCode::UNAUTHORIZED {
    return Ok(response);
  }

  let refreshed = refresh_access_token(client, state).await?;
  build(&refreshed)
    .send()
    .await
    .map_err(|error| format!("Battle Hubに接続できません: {error}"))
}

#[tauri::command]
async fn auth_login(
  request: LoginRequest,
  state: State<'_, AuthState>,
) -> Result<CommandResponse<SessionView>, String> {
  let client = reqwest::Client::new();

  let response = match client
    .post(format!("{}/api/auth/login", hub_base_url()))
    .json(&serde_json::json!({
      "username": request.username,
      "password": request.password,
    }))
    .send()
    .await
  {
    Ok(response) => response,
    Err(error) => {
      return Ok(CommandResponse::failure(
        502,
        format!("Battle Hubに接続できません: {error}"),
      ));
    }
  };

  if !response.status().is_success() {
    let error = parse_error(response).await;
    return Ok(CommandResponse::failure(
      error.status,
      error
        .error
        .unwrap_or_else(|| "ログインに失敗しました".to_string()),
    ));
  }

  let payload = match response.json::<HubAuthResponse>().await {
    Ok(payload) => payload,
    Err(error) => {
      return Ok(CommandResponse::failure(
        502,
        format!("認証レスポンスを読み込めません: {error}"),
      ));
    }
  };

  *state
    .access_token
    .lock()
    .map_err(|_| "認証状態のロックに失敗しました".to_string())? =
    Some(payload.token);

  *state
    .refresh_token
    .lock()
    .map_err(|_| "認証状態のロックに失敗しました".to_string())? =
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
    Err(error) => return Ok(CommandResponse::failure(401, error)),
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
      format!("Sessionレスポンスを読み込めません: {error}"),
    )),
  }
}

#[tauri::command]
async fn auth_logout(
  state: State<'_, AuthState>,
) -> Result<CommandResponse<Value>, String> {
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

fn resource_path(resource: &str) -> Option<(&'static str, bool)> {
  match resource {
    "health" => Some(("/api/health", false)),
    "forces" => Some(("/api/forces", true)),
    "battles" => Some(("/api/battles", true)),
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
      Err(error) => return Ok(CommandResponse::failure(401, error)),
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
          format!("Battle Hubに接続できません: {error}"),
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
      format!("レスポンスを読み込めません: {error}"),
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
    Err(error) => return Ok(CommandResponse::failure(401, error)),
  };

  if !response.status().is_success() {
    return Ok(parse_error(response).await);
  }

  let status = response.status().as_u16();

  match response.json::<Value>().await {
    Ok(value) => Ok(CommandResponse::success(status, value)),
    Err(error) => Ok(CommandResponse::failure(
      502,
      format!("レスポンスを読み込めません: {error}"),
    )),
  }
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
      hub_post
    ])
    .setup(|app| {
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
