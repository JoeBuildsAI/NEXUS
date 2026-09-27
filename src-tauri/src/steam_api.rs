//! Steam Web API proxy. The frontend names an ALLOWLISTED endpoint; this layer
//! injects the API key / SteamID from the credential store, performs the HTTPS
//! request, caches the raw JSON briefly, and returns it. The key never leaves
//! the native layer. Parsing is done (and tested) in TypeScript.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const BASE: &str = "https://api.steampowered.com";
const CACHE_TTL: Duration = Duration::from_secs(600);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    /// "ok" | "not-configured" | "network-error" | "http-error"
    status: String,
    http_status: u16,
    body: String,
    cached: bool,
}

pub struct ApiCache(pub Mutex<HashMap<String, (Instant, ApiResponse)>>);

impl ApiCache {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

struct Endpoint {
    path: &'static str,
    needs_key: bool,
    needs_steamid: bool,
}

fn endpoint(name: &str) -> Option<Endpoint> {
    Some(match name {
        "playerAchievements" => Endpoint { path: "/ISteamUserStats/GetPlayerAchievements/v1/", needs_key: true, needs_steamid: true },
        "schema" => Endpoint { path: "/ISteamUserStats/GetSchemaForGame/v2/", needs_key: true, needs_steamid: false },
        "globalPercentages" => Endpoint { path: "/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/", needs_key: false, needs_steamid: false },
        "ownedGames" => Endpoint { path: "/IPlayerService/GetOwnedGames/v1/", needs_key: true, needs_steamid: true },
        "recentlyPlayed" => Endpoint { path: "/IPlayerService/GetRecentlyPlayedGames/v1/", needs_key: true, needs_steamid: true },
        "playerSummary" => Endpoint { path: "/ISteamUser/GetPlayerSummaries/v2/", needs_key: true, needs_steamid: true },
        _ => return None,
    })
}

fn sanitize_param(v: &str) -> Option<String> {
    let t = v.trim();
    if t.is_empty() || t.len() > 64 || !t.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return None;
    }
    Some(t.to_string())
}

#[tauri::command]
pub fn steam_api_get(
    cache: tauri::State<ApiCache>,
    endpoint_name: String,
    params: HashMap<String, String>,
) -> Result<ApiResponse, String> {
    let ep = endpoint(&endpoint_name).ok_or_else(|| format!("unknown endpoint {endpoint_name}"))?;

    let key = crate::secrets::read_secret("steam.apiKey");
    let steamid = crate::secrets::read_secret("steam.steamId");
    if (ep.needs_key && key.is_none()) || (ep.needs_steamid && steamid.is_none()) {
        return Ok(ApiResponse { status: "not-configured".into(), http_status: 0, body: String::new(), cached: false });
    }

    // Build query from sanitized, allowlisted params.
    let mut query: Vec<(String, String)> = Vec::new();
    for (k, v) in &params {
        if !["appid", "gameid", "l", "include_appinfo", "include_played_free_games", "count", "format"].contains(&k.as_str()) {
            continue;
        }
        if let Some(sv) = sanitize_param(v) {
            query.push((k.clone(), sv));
        }
    }
    let cache_key = format!("{}?{}", ep.path, query.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>().join("&"));

    if let Ok(map) = cache.0.lock() {
        if let Some((t, resp)) = map.get(&cache_key) {
            if t.elapsed() < CACHE_TTL {
                let mut r = resp.clone();
                r.cached = true;
                return Ok(r);
            }
        }
    }

    if ep.needs_key {
        query.push(("key".into(), key.unwrap()));
    }
    if ep.needs_steamid {
        let sid = steamid.unwrap();
        let sid = sanitize_param(&sid).ok_or("invalid SteamID")?;
        // GetPlayerSummaries uses `steamids` (plural).
        query.push((if endpoint_name == "playerSummary" { "steamids" } else { "steamid" }.into(), sid));
    }

    let url = format!("{BASE}{}", ep.path);
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(12)).build();
    let mut req = agent.get(&url);
    for (k, v) in &query {
        req = req.query(k, v);
    }
    let resp = match req.call() {
        Ok(r) => {
            let code = r.status();
            let body = r.into_string().unwrap_or_default();
            ApiResponse { status: "ok".into(), http_status: code, body, cached: false }
        }
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            ApiResponse { status: "http-error".into(), http_status: code, body, cached: false }
        }
        Err(ureq::Error::Transport(t)) => {
            let _ = t;
            ApiResponse { status: "network-error".into(), http_status: 0, body: String::new(), cached: false }
        }
    };

    if resp.status == "ok" {
        if let Ok(mut map) = cache.0.lock() {
            map.insert(cache_key, (Instant::now(), resp.clone()));
        }
    }
    Ok(resp)
}
