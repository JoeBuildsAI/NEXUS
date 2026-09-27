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

/// Shape checks so a mis-pasted value is rejected before it is stored.
/// Steam Web API keys are 32 hex characters; SteamID64 is 17 digits.
pub fn validate_format(key: &str, value: &str) -> Result<(), String> {
    match key {
        "steam.apiKey" if value.len() == 32 && value.chars().all(|c| c.is_ascii_hexdigit()) => Ok(()),
        "steam.apiKey" => Err("A Steam Web API key is 32 hexadecimal characters.".into()),
        "steam.steamId" if value.len() == 17 && value.chars().all(|c| c.is_ascii_digit()) => Ok(()),
        "steam.steamId" => Err("A SteamID64 is 17 digits.".into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_malformed_credentials_and_unknown_keys() {
        assert!(validate_format("steam.apiKey", "0123456789ABCDEF0123456789ABCDEF").is_ok());
        assert!(validate_format("steam.apiKey", "not-a-key").is_err());
        assert!(validate_format("steam.steamId", "76561198000000000").is_ok());
        assert!(validate_format("steam.steamId", "joseph").is_err());
        assert!(entry("email.password").is_err(), "only allowlisted keys may be stored");
    }
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
    validate_format(&key, v)?;
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
