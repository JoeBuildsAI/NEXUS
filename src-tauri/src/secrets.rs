//! Secure secret storage via the OS credential store (Windows Credential
//! Manager). Secrets are written/deleted from the UI but NEVER read back to it —
//! only `configured: bool` is exposed. Consumers that need the value (the Steam
//! Web API proxy) read it inside the native layer.

use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "ai.nexus.desktop";

/// Allowlist of secret keys the UI may manage.
const ALLOWED_KEYS: &[&str] = &["steam.apiKey", "steam.steamId"];

fn entry(key: &str) -> Result<Entry, String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("unknown secret key: {key}"));
    }
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

pub fn read_secret(key: &str) -> Option<String> {
    entry(key).ok()?.get_password().ok().filter(|s| !s.trim().is_empty())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretStatus {
    key: String,
    configured: bool,
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<SecretStatus, String> {
    let v = value.trim();
    if v.is_empty() {
        return Err("empty secret".into());
    }
    if v.len() > 512 {
        return Err("secret too long".into());
    }
    entry(&key)?.set_password(v).map_err(|e| e.to_string())?;
    Ok(SecretStatus { key, configured: true })
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<SecretStatus, String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(SecretStatus { key, configured: false }),
        Err(keyring::Error::NoEntry) => Ok(SecretStatus { key, configured: false }),
        Err(e) => Err(e.to_string()),
    }
}

/// Only reports whether a secret exists — never its value.
#[tauri::command]
pub fn secret_status(keys: Vec<String>) -> Result<Vec<SecretStatus>, String> {
    Ok(keys
        .into_iter()
        .map(|k| {
            let configured = ALLOWED_KEYS.contains(&k.as_str()) && read_secret(&k).is_some();
            SecretStatus { key: k, configured }
        })
        .collect())
}
