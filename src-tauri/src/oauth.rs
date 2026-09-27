//! OAuth 2.0 (authorization code + PKCE, loopback redirect) and an allowlisted
//! mail API proxy for Microsoft Graph and Gmail.
//!
//! Boundary: NEXUS ships no client credentials. The user (or a future
//! registration step) supplies a client id (and, for Google, the installed-app
//! client secret). Everything else — browser hand-off, loopback listener, code
//! exchange, refresh, secure token storage, bearer injection — lives here, so
//! the WebView never sees a token.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Provider {
    Outlook,
    Gmail,
}

impl Provider {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "outlook" => Some(Self::Outlook),
            "gmail" => Some(Self::Gmail),
            _ => None,
        }
    }
    fn key(&self) -> &'static str {
        match self {
            Self::Outlook => "outlook",
            Self::Gmail => "gmail",
        }
    }
    fn auth_url(&self) -> &'static str {
        match self {
            Self::Outlook => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            Self::Gmail => "https://accounts.google.com/o/oauth2/v2/auth",
        }
    }
    fn token_url(&self) -> &'static str {
        match self {
            Self::Outlook => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            Self::Gmail => "https://oauth2.googleapis.com/token",
        }
    }
    fn scopes(&self) -> &'static str {
        match self {
            Self::Outlook => "offline_access User.Read Mail.ReadWrite MailboxSettings.ReadWrite",
            Self::Gmail => "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/userinfo.email",
        }
    }
    fn api_base(&self) -> &'static str {
        match self {
            Self::Outlook => "https://graph.microsoft.com/v1.0",
            Self::Gmail => "https://gmail.googleapis.com/gmail/v1",
        }
    }
}

fn secret_key(p: Provider, what: &str) -> String {
    format!("email.{}.{}", p.key(), what)
}

/// Account slots let several accounts of one provider coexist (1–9). Slot 1
/// also reads the pre-0.4 slot-less keys so existing connections survive.
pub fn valid_slot(slot: u8) -> Result<u8, String> {
    if (1..=9).contains(&slot) { Ok(slot) } else { Err("invalid account slot".into()) }
}
fn token_key(p: Provider, slot: u8, what: &str) -> String {
    format!("email.{}.{}.{}", p.key(), slot, what)
}
fn read_token(p: Provider, slot: u8, what: &str) -> Option<String> {
    crate::secrets::read_secret(&token_key(p, slot, what)).or_else(|| if slot == 1 { crate::secrets::read_secret(&secret_key(p, what)) } else { None })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStatus {
    pub provider: String,
    pub slot: u8,
    /// Client id (and secret where required) present.
    pub client_configured: bool,
    /// A refresh token exists — the account is connected.
    pub connected: bool,
    /// Whether an authorization flow is currently waiting for the browser.
    pub pending: bool,
}

pub struct OAuthState {
    pending: std::sync::Mutex<Option<(Provider, u8, Instant)>>,
}
impl OAuthState {
    pub fn new() -> Self {
        Self { pending: std::sync::Mutex::new(None) }
    }
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// URL-safe base64 without padding (RFC 7636).
pub fn b64url(bytes: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(T[((n >> 6) & 63) as usize] as char);
        }
        if chunk.len() > 2 {
            out.push(T[(n & 63) as usize] as char);
        }
    }
    out
}

fn random_bytes(n: usize) -> Vec<u8> {
    // Mix several entropy sources; not cryptographic-grade RNG but adequate for
    // PKCE/state when combined with per-process addresses and high-res time.
    let mut h = Sha256::new();
    h.update(now_secs().to_le_bytes());
    h.update(std::process::id().to_le_bytes());
    h.update((Instant::now().elapsed().as_nanos() as u64).to_le_bytes());
    let addr = &h as *const _ as usize;
    h.update(addr.to_le_bytes());
    if let Ok(d) = SystemTime::now().duration_since(UNIX_EPOCH) {
        h.update(d.subsec_nanos().to_le_bytes());
    }
    let mut out = Vec::new();
    let mut seed = h.finalize();
    while out.len() < n {
        out.extend_from_slice(&seed);
        let mut h2 = Sha256::new();
        h2.update(seed);
        h2.update(out.len().to_le_bytes());
        seed = h2.finalize();
    }
    out.truncate(n);
    out
}

pub fn pkce_pair() -> (String, String) {
    let verifier = b64url(&random_bytes(48));
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

/// Parse `GET /callback?code=..&state=.. HTTP/1.1` → (code, state).
pub fn parse_callback_request(head: &str) -> Option<(String, String)> {
    let first = head.lines().next()?;
    let path = first.split_whitespace().nth(1)?;
    let query = path.split_once('?')?.1;
    let mut code = None;
    let mut state = None;
    for kv in query.split('&') {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        let v = url_decode(v);
        match k {
            "code" => code = Some(v),
            "state" => state = Some(v),
            _ => {}
        }
    }
    Some((code?, state?))
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(if bytes[i] == b'+' { b' ' } else { bytes[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[tauri::command]
pub fn oauth_status(state: tauri::State<OAuthState>, provider: String, slot: Option<u8>) -> Result<OAuthStatus, String> {
    let p = Provider::parse(&provider).ok_or("unknown provider")?;
    let slot = valid_slot(slot.unwrap_or(1))?;
    let client_id = crate::secrets::read_secret(&secret_key(p, "clientId")).is_some();
    let client_ok = match p {
        Provider::Outlook => client_id,
        Provider::Gmail => client_id && crate::secrets::read_secret(&secret_key(p, "clientSecret")).is_some(),
    };
    let pending = state.pending.lock().map(|g| g.as_ref().map(|(pp, ps, at)| *pp == p && *ps == slot && at.elapsed() < Duration::from_secs(200)).unwrap_or(false)).unwrap_or(false);
    Ok(OAuthStatus { provider, slot, client_configured: client_ok, connected: read_token(p, slot, "refreshToken").is_some(), pending })
}

/// Start the browser authorization flow. Emits `oauth:complete` with
/// `{ provider, ok, error }` when the loopback redirect arrives (or times out).
#[tauri::command]
pub fn oauth_begin(app: tauri::AppHandle, state: tauri::State<OAuthState>, provider: String, slot: Option<u8>) -> Result<(), String> {
    let p = Provider::parse(&provider).ok_or("unknown provider")?;
    let slot = valid_slot(slot.unwrap_or(1))?;
    let client_id = crate::secrets::read_secret(&secret_key(p, "clientId")).ok_or("Client id not configured")?;
    if p == Provider::Gmail && crate::secrets::read_secret(&secret_key(p, "clientSecret")).is_none() {
        return Err("Client secret not configured".into());
    }
    {
        let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
        if let Some((_, _, at)) = pending.as_ref() {
            if at.elapsed() < Duration::from_secs(200) {
                return Err("An authorization is already in progress.".into());
            }
        }
        *pending = Some((p, slot, Instant::now()));
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}/callback");
    let (verifier, challenge) = pkce_pair();
    let csrf = b64url(&random_bytes(24));
    let mut url = format!(
        "{}?client_id={}&response_type=code&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        p.auth_url(),
        url_encode(&client_id),
        url_encode(&redirect),
        url_encode(p.scopes()),
        url_encode(&csrf),
        url_encode(&challenge)
    );
    if p == Provider::Gmail {
        url.push_str("&access_type=offline&prompt=consent");
    } else {
        url.push_str("&response_mode=query&prompt=select_account");
    }
    crate::system::open_url(&url)?;

    let app2 = app.clone();
    std::thread::spawn(move || {
        let outcome = wait_for_code(&listener, &csrf, Duration::from_secs(180)).and_then(|code| exchange_code(p, slot, &client_id, &code, &verifier, &redirect));
        let (ok, error) = match outcome {
            Ok(()) => (true, None),
            Err(e) => (false, Some(e)),
        };
        if let Some(st) = app2.try_state::<OAuthState>() {
            if let Ok(mut g) = st.pending.lock() {
                *g = None;
            }
        }
        let _ = app2.emit("oauth:complete", serde_json::json!({ "provider": p.key(), "slot": slot, "ok": ok, "error": error }));
    });
    Ok(())
}

fn wait_for_code(listener: &TcpListener, expected_state: &str, timeout: Duration) -> Result<String, String> {
    let start = Instant::now();
    loop {
        if start.elapsed() > timeout {
            return Err("Timed out waiting for the browser to return.".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let head = String::from_utf8_lossy(&buf[..n]).to_string();
                let parsed = parse_callback_request(&head);
                let body = match &parsed {
                    Some((_, st)) if st == expected_state => "<!doctype html><html><body style=\"background:#000;color:#ddd;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div style=\"text-align:center\"><p style=\"letter-spacing:.3em;font-size:12px;opacity:.5\">NEXUS</p><p style=\"font-size:20px\">Connected. You can return to NEXUS.</p></div></body></html>",
                    _ => "<!doctype html><html><body style=\"background:#000;color:#ddd;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><p>Authorization could not be verified. You can close this tab.</p></body></html>",
                };
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}", body.len(), body);
                let _ = stream.flush();
                return match parsed {
                    Some((code, st)) if st == expected_state => Ok(code),
                    Some(_) => Err("State mismatch — the redirect did not come from this NEXUS session.".into()),
                    None => Err("The browser returned without an authorization code.".into()),
                };
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(120)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn exchange_code(p: Provider, slot: u8, client_id: &str, code: &str, verifier: &str, redirect: &str) -> Result<(), String> {
    let mut form: Vec<(&str, String)> = vec![
        ("client_id", client_id.to_string()),
        ("grant_type", "authorization_code".into()),
        ("code", code.to_string()),
        ("redirect_uri", redirect.to_string()),
        ("code_verifier", verifier.to_string()),
    ];
    if p == Provider::Gmail {
        form.push(("client_secret", crate::secrets::read_secret(&secret_key(p, "clientSecret")).ok_or("Client secret missing")?));
    }
    let resp = post_form(p.token_url(), &form)?;
    store_tokens(p, slot, &resp)
}

fn post_form(url: &str, form: &[(&str, String)]) -> Result<serde_json::Value, String> {
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build();
    let pairs: Vec<(&str, &str)> = form.iter().map(|(k, v)| (*k, v.as_str())).collect();
    match agent.post(url).send_form(&pairs) {
        Ok(r) => r.into_json::<serde_json::Value>().map_err(|_| "Token response was not JSON".to_string()),
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            let v: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
            let desc = v.get("error_description").and_then(|d| d.as_str()).or_else(|| v.get("error").and_then(|d| d.as_str())).unwrap_or("token endpoint error");
            // Never echo the raw body (could include identifiers); keep the provider's short description.
            Err(format!("HTTP {code}: {}", desc.chars().take(160).collect::<String>()))
        }
        Err(ureq::Error::Transport(_)) => Err("Network unavailable".into()),
    }
}

fn store_tokens(p: Provider, slot: u8, v: &serde_json::Value) -> Result<(), String> {
    let access = v.get("access_token").and_then(|a| a.as_str()).ok_or("No access token in response")?;
    let expires_in = v.get("expires_in").and_then(|e| e.as_u64()).unwrap_or(3600);
    crate::secrets::write_secret(&token_key(p, slot, "accessToken"), &format!("{}|{}", access, now_secs() + expires_in.saturating_sub(60)))?;
    if let Some(rt) = v.get("refresh_token").and_then(|a| a.as_str()) {
        crate::secrets::write_secret(&token_key(p, slot, "refreshToken"), rt)?;
    }
    Ok(())
}

/// Valid access token, refreshing with the stored refresh token when expired.
fn access_token(p: Provider, slot: u8) -> Result<String, String> {
    if let Some(stored) = read_token(p, slot, "accessToken") {
        if let Some((tok, exp)) = stored.rsplit_once('|') {
            if exp.parse::<u64>().map(|e| e > now_secs()).unwrap_or(false) {
                return Ok(tok.to_string());
            }
        }
    }
    let refresh = read_token(p, slot, "refreshToken").ok_or("not-connected")?;
    let client_id = crate::secrets::read_secret(&secret_key(p, "clientId")).ok_or("not-configured")?;
    let mut form: Vec<(&str, String)> = vec![("client_id", client_id), ("grant_type", "refresh_token".into()), ("refresh_token", refresh)];
    if p == Provider::Gmail {
        form.push(("client_secret", crate::secrets::read_secret(&secret_key(p, "clientSecret")).ok_or("not-configured")?));
    } else {
        form.push(("scope", p.scopes().into()));
    }
    let resp = post_form(p.token_url(), &form)?;
    store_tokens(p, slot, &resp)?;
    read_token(p, slot, "accessToken").and_then(|s| s.rsplit_once('|').map(|(t, _)| t.to_string())).ok_or_else(|| "refresh failed".into())
}

#[tauri::command]
pub fn oauth_disconnect(provider: String, slot: Option<u8>) -> Result<(), String> {
    let p = Provider::parse(&provider).ok_or("unknown provider")?;
    let slot = valid_slot(slot.unwrap_or(1))?;
    if p == Provider::Gmail {
        if let Some(rt) = read_token(p, slot, "refreshToken") {
            let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(10)).build();
            let _ = agent.post("https://oauth2.googleapis.com/revoke").send_form(&[("token", rt.as_str())]);
        }
    }
    for what in ["accessToken", "refreshToken"] {
        crate::secrets::delete_secret(&token_key(p, slot, what))?;
        if slot == 1 {
            crate::secrets::delete_secret(&secret_key(p, what))?;
        }
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailApiResponse {
    /// ok | not-configured | not-connected | network-error | rate-limited | http-error | auth-error
    pub status: String,
    pub http_status: u16,
    pub body: String,
    pub retry_after_secs: Option<u64>,
}

/// Validate an API path: absolute, no traversal, no scheme, bounded length.
pub fn validate_api_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/') || path.len() > 2048 || path.contains("..") || path.contains("//") || path.contains("://") || path.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("invalid API path".into());
    }
    Ok(())
}

/// Allowlisted mail API call with bearer injection. Bodies are JSON strings
/// produced by the frontend mappers; responses are raw JSON for TS parsing.
#[tauri::command]
pub fn mail_api(provider: String, method: String, path: String, body: Option<String>, slot: Option<u8>) -> Result<MailApiResponse, String> {
    let p = Provider::parse(&provider).ok_or("unknown provider")?;
    let slot = valid_slot(slot.unwrap_or(1))?;
    validate_api_path(&path)?;
    let m = method.to_uppercase();
    if !["GET", "POST", "PATCH", "DELETE"].contains(&m.as_str()) {
        return Err("method not allowed".into());
    }
    let token = match access_token(p, slot) {
        Ok(t) => t,
        Err(e) if e == "not-connected" || e == "not-configured" => return Ok(MailApiResponse { status: e, http_status: 0, body: String::new(), retry_after_secs: None }),
        Err(e) if e == "Network unavailable" => return Ok(MailApiResponse { status: "network-error".into(), http_status: 0, body: String::new(), retry_after_secs: None }),
        Err(_) => return Ok(MailApiResponse { status: "auth-error".into(), http_status: 0, body: String::new(), retry_after_secs: None }),
    };
    let url = format!("{}{}", p.api_base(), path);
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build();
    let req = agent.request(&m, &url).set("Authorization", &format!("Bearer {token}")).set("Accept", "application/json");
    let result = match body {
        Some(b) if m != "GET" => req.set("Content-Type", "application/json").send_string(&b),
        _ => req.call(),
    };
    Ok(match result {
        Ok(r) => MailApiResponse { status: "ok".into(), http_status: r.status(), body: r.into_string().unwrap_or_default(), retry_after_secs: None },
        Err(ureq::Error::Status(code, r)) => {
            let retry = r.header("Retry-After").and_then(|v| v.parse().ok());
            let status = match code {
                401 => "auth-error",
                429 => "rate-limited",
                _ => "http-error",
            };
            // Bodies may echo identifiers; keep only a bounded prefix for diagnostics.
            let body = r.into_string().unwrap_or_default().chars().take(2000).collect();
            MailApiResponse { status: status.into(), http_status: code, body, retry_after_secs: retry }
        }
        Err(ureq::Error::Transport(_)) => MailApiResponse { status: "network-error".into(), http_status: 0, body: String::new(), retry_after_secs: None },
    })
}

/// Reject anything but https to a public host; no credentials, default port only.
pub fn validate_unsubscribe_url(raw: &str) -> Result<String, String> {
    if raw.len() > 2048 || !raw.starts_with("https://") {
        return Err("only https unsubscribe targets are allowed".into());
    }
    let rest = &raw["https://".len()..];
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.contains('@') {
        return Err("credentials in URL are not allowed".into());
    }
    let host = authority.split(':').next().unwrap_or("").to_ascii_lowercase();
    let port = authority.split(':').nth(1);
    if port.is_some_and(|p| p != "443") {
        return Err("non-standard port".into());
    }
    let private = host == "localhost" || host.ends_with(".local") || host.parse::<std::net::IpAddr>().is_ok() || !host.contains('.');
    if private {
        return Err("target host is not public".into());
    }
    Ok(raw.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsubscribeResult {
    pub ok: bool,
    pub http_status: u16,
    pub detail: String,
}

/// RFC 8058 one-click unsubscribe: a single POST with the standard body to a
/// validated https URL. No redirects are followed, no body is rendered, no
/// cookies are sent. Nothing else is ever fetched from email content.
#[tauri::command]
pub fn unsubscribe_one_click(url: String) -> Result<UnsubscribeResult, String> {
    let target = validate_unsubscribe_url(&url)?;
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(12)).redirects(0).build();
    match agent.post(&target).set("Content-Type", "application/x-www-form-urlencoded").set("User-Agent", "NEXUS/0.4 (one-click unsubscribe)").send_string("List-Unsubscribe=One-Click") {
        Ok(r) => Ok(UnsubscribeResult { ok: (200..400).contains(&r.status()), http_status: r.status(), detail: "accepted".into() }),
        Err(ureq::Error::Status(code, _)) => Ok(UnsubscribeResult { ok: false, http_status: code, detail: format!("sender responded with HTTP {code}") }),
        Err(ureq::Error::Transport(_)) => Ok(UnsubscribeResult { ok: false, http_status: 0, detail: "network error".into() }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsubscribe_targets_are_https_public_hosts_only() {
        assert!(validate_unsubscribe_url("https://lists.example.com/u?x=1").is_ok());
        assert!(validate_unsubscribe_url("http://lists.example.com/u").is_err());
        assert!(validate_unsubscribe_url("https://user:pw@lists.example.com/u").is_err());
        assert!(validate_unsubscribe_url("https://127.0.0.1/u").is_err());
        assert!(validate_unsubscribe_url("https://localhost/u").is_err());
        assert!(validate_unsubscribe_url("https://lists.example.com:8443/u").is_err());
        assert!(validate_unsubscribe_url("https://intranet/u").is_err());
    }

    #[test]
    fn account_slots_are_bounded_and_keyed() {
        assert!(valid_slot(0).is_err());
        assert!(valid_slot(10).is_err());
        assert_eq!(token_key(Provider::Gmail, 2, "refreshToken"), "email.gmail.2.refreshToken");
    }

    #[test]
    fn pkce_challenge_is_sha256_of_verifier() {
        let (v, c) = pkce_pair();
        assert!(v.len() >= 43 && v.len() <= 128);
        assert_eq!(c, b64url(&Sha256::digest(v.as_bytes())));
        assert!(!c.contains('=') && !c.contains('+') && !c.contains('/'));
    }

    #[test]
    fn parses_loopback_callback() {
        let head = "GET /callback?code=abc%2F123&state=xyz&session_state=q HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        assert_eq!(parse_callback_request(head), Some(("abc/123".into(), "xyz".into())));
        assert!(parse_callback_request("GET /favicon.ico HTTP/1.1\r\n").is_none());
        assert!(parse_callback_request("GET /callback?error=access_denied HTTP/1.1\r\n").is_none());
    }

    #[test]
    fn api_paths_are_bounded_and_relative() {
        assert!(validate_api_path("/me/messages?$top=50").is_ok());
        assert!(validate_api_path("me/messages").is_err());
        assert!(validate_api_path("/../admin").is_err());
        assert!(validate_api_path("//evil.com/x").is_err());
        assert!(validate_api_path("/x?u=https://evil").is_err());
        assert!(validate_api_path("/x y").is_err());
    }

    #[test]
    fn b64url_matches_rfc4648() {
        assert_eq!(b64url(b""), "");
        assert_eq!(b64url(b"f"), "Zg");
        assert_eq!(b64url(b"fo"), "Zm8");
        assert_eq!(b64url(b"foo"), "Zm9v");
        assert_eq!(b64url(&[0xfb, 0xff]), "-_8");
    }
}
