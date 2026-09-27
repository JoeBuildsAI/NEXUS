# Gaming PC Setup

How to take NEXUS from the development laptop (all mocks) to Joseph’s gaming PC
(real integrations). Nothing here requires rewriting UI — it’s configuration plus
completing the provider stubs.

## 1. Clone & build

```powershell
git clone <repo> NEXUS
cd NEXUS
npm install
npm run tauri:dev        # first run compiles the Rust layer (a few minutes)
```

Prerequisites: Node 18+, Rust (stable, MSVC) from https://rustup.rs, Visual
Studio C++ Build Tools, and WebView2 (present on Windows 11).

## 2. Turn off demo mode

Copy `.env.example` → `.env` and set:

```
VITE_DEMO_MODE=false
VITE_PROVIDER_SYSTEM=auto     # real telemetry
VITE_PROVIDER_STEAM=real      # once RealSteamProvider is completed
VITE_PROVIDER_MEDIA=real      # once LocalMediaProvider is completed
VITE_PROVIDER_EMAIL=mock      # until email adapters exist
```

Real system telemetry already works today (it’s used automatically under Tauri).

## 3. Detect & configure Steam

`RealSteamProvider` is a documented stub (see `docs/PROVIDERS.md`). To complete:
1. Add a Rust command to read `HKCU\Software\Valve\Steam\SteamPath` and parse
   `libraryfolders.vdf` / `appmanifest_*.acf` for installed games + sizes.
2. Store a Steam Web API key and SteamID in Windows Credential Manager (never in
   the repo). Use `IPlayerService/GetOwnedGames`,
   `ISteamUserStats/GetPlayerAchievements`, and
   `GetGlobalAchievementPercentagesForApp`.
3. `launchGame` already has a safe path: `steam://rungameid/<appid>` via the
   scheme‑allowlisted `open_external` command.

Do **not** scrape Steam HTML.

## 4. Authorize a local media folder / drive

The gaming PC media may live on e.g. `X:\` (a removable drive). NEXUS never scans
drives automatically.
1. Settings → **Media → Authorize folder**, pick the media root explicitly.
2. If it’s on a removable drive, opt in per‑drive; it’s otherwise excluded from
   scanning and from all cleanup operations.
3. Complete `LocalMediaProvider` (folder‑scoped enumeration + asset‑protocol
   playback). The six‑player workspace already works against the provider.

## 5. Enable startup

Settings → **Startup → Launch on login** (uses the Tauri autostart plugin under
the desktop build). Optionally enable **Start minimized** to boot into the tray.

## 6. Configure process allowlists (Gaming Mode)

1. Settings → **System** → set safety to **Enabled** and toggle **Allow process
   management** (defaults are observe‑only/off for safety).
2. Settings → **Gaming** → add exact process names to **Approved background apps**
   (e.g. `Spotify.exe`, `Discord.exe`). Only these — and only
   `user-application`/`optional` class — can ever be suspended in Gaming Mode.
   System‑critical, driver, security, hardware, and unknown processes are always
   protected.

## 7. Test the privacy hotkey

Default `Ctrl+Shift+`` (configurable in Settings → Privacy). Under Tauri it’s
also registered as an OS‑level global shortcut, so it fires even when NEXUS isn’t
focused. Trigger it and confirm media pauses immediately and the workspace is
hidden / NEXUS returns Home or minimizes per your setting.

## 8. Switching mocks → real, summarized

| Domain  | Dev laptop | Gaming PC action |
|---------|-----------|------------------|
| System  | real (Tauri) | works as‑is |
| Steam   | mock | complete `RealSteamProvider`, set `VITE_PROVIDER_STEAM=real`, add API key to Credential Manager |
| Media   | mock | authorize folder, complete `LocalMediaProvider`, set `VITE_PROVIDER_MEDIA=real` |
| Email   | mock | implement Gmail/Graph adapter later |
| Assistant | local | optionally add an LLM provider (still action‑restricted) |

## 9. Package an installer

```powershell
npm run tauri:build      # produces an NSIS installer under src-tauri/target/release/bundle
```
