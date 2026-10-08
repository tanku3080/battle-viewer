use crate::{authenticated_request, AuthState};
use reqwest::{Client, Method};
use serde::Deserialize;

#[derive(Clone)]
pub(crate) struct HubTransferAuthorizer {
  client: Client,
  auth: AuthState,
}

#[derive(Deserialize)]
struct Decision {
  authorized: bool,
  receipt: String,
}

impl HubTransferAuthorizer {
  pub fn new(auth: AuthState) -> Self {
    Self {
      client: Client::new(),
      auth,
    }
  }

  /// The authenticated provider must ask Hub on every inbound transfer.
  /// Any non-2xx status, timeout, outage or malformed response is a denial.
  pub async fn check(
    &self,
    work_id: &str,
    token: &str,
    provider_peer: &str,
    observed_requester_peer: &str,
    content_hash: &str,
  ) -> Result<String, String> {
    if token.len() > 128 || token.is_empty() || work_id.len() != 36 {
      return Err("invalid transfer authorization".into());
    }
    let body = serde_json::json!({
      "token": token,
      "providerPeerId": provider_peer,
      "requesterPeerId": observed_requester_peer,
      "contentHash": content_hash,
    }).to_string();

    let response = tokio::time::timeout(
      std::time::Duration::from_secs(4),
      authenticated_request(
        &self.client,
        &self.auth,
        Method::POST,
        &format!("/api/v2/works/{work_id}/peers/check"),
        Some(&body),
      )
    )
    .await
    .map_err(|_| "Hub authorization timed out".to_string())??;

    if !response.status().is_success() {
      return Err(format!("Hub denied peer transfer: HTTP {}", response.status()));
    }
    let decision: Decision = response.json().await
      .map_err(|_| "Malformed Hub authorization response".to_string())?;
    if !decision.authorized || decision.receipt.len() < 32 || decision.receipt.len() > 128 {
      return Err("Hub did not authorize peer transfer".into());
    }
    Ok(decision.receipt)
  }
}
