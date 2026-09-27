//! Secure secret storage via the OS credential store (Windows Credential
//! Manager). Secrets are written/deleted from the UI but NEVER read back to it —
//! only `configured: bool` is exposed. Consumers that need the value (the Steam
//! Web API proxy) read it inside the native layer.

use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "ai.nexus.desktop";

/// Allowlist of secret keys the UI may manage (set/delete/status). Token keys
/// are written only by the native OAuth flow; the UI can read their status.
const ALLOWED_KEYS: &[&str] = &[
    "steam.apiKey",
    "steam.steamId",
    "email.outlook.clientId",
    "email.gmail.clientId",
    "email.gmail.clientSecret",
];
/// Keys the native layer manages itself; never settable from the UI.
const NATIVE_KEYS: &[&str] = &[
    "email.outlook.accessToken",
    "email.outlook.refreshToken",
    "email.gmail.accessToken",
    "email.gmail.refreshToken",
];

fn entry(key: &str) -> Result<Entry, String> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(format!("unknown secret key: {key}"));
    }
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

fn native_entry(key: &str) -> Result<Entry, String> {
    if !ALLOWED_KEYS.contains(&key) && !NATIVE_KEYS.contains(&key) {
        return Err(format!("unknown secret key: {key}"));
    }
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

pub fn read_secret(key: &str) -> Option<String> {
    native_entry(key).ok()?.get_password().ok().filter(|s| !s.trim().is_empty())
}

/// Native-only write (OAuth tokens). Not exposed as a command.
pub fn write_secret(key: &str, value: &str) -> Result<(), String> {
    native_entry(key)?.set_password(value).map_err(|e| e.to_string())
}

/// Native-only delete; missing entries are not an error.
pub fn delete_secret(key: &str) -> Result<(), String> {
    match native_entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
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
        assert!(entry("email.outlook.refreshToken").is_err(), "tokens are never settable from the UI");
        assert!(native_entry("email.outlook.refreshToken").is_ok());
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
            let known = ALLOWED_KEYS.contains(&k.as_str()) || NATIVE_KEYS.contains(&k.as_str());
            let configured = known && read_secret(&k).is_some();
            SecretStatus { key: k, configured }
        })
        .collect())
}
