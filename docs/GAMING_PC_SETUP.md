# Gaming PC Setup

NEXUS is built to be installed on Joseph's gaming PC and start discovering the
real machine immediately. Nothing below requires editing code.

## 1. Install

Build the installer (or use a prebuilt one):

```powershell
npm install
npm run tauri:build
```

Artifact (NSIS, per-user install, no admin required):

```
src-tauri\target\release\bundle\nsis\NEXUS_0.3.0_x64-setup.exe
```

Run it. It installs to the current user's profile and creates a Start Menu
entry. WebView2 is downloaded automatically if missing. The build is unsigned
(publisher placeholder "NEXUS"); Windows SmartScreen may ask to confirm once.

## 2. First run — environment discovery

The onboarding flow runs a **local** environment scan:

- Windows version and hardware (CPU, RAM, GPU via WMI)
- **Steam**: located through the registry (`HKCU\Software\Valve\Steam\SteamPath`
  with HKLM fallbacks), then `steamapps\libraryfolders.vdf` and every
  `appmanifest_*.acf` in each library. Only those validated locations are read —
  never a drive crawl.
- Media: previously authorized folders only (never scans drives)
- Email: not configured until you connect an account

Then **Personalize** (name, environment, motion) and **Ready** — a short list of
what NEXUS can and cannot do, with optional shortcuts to Steam achievements and
media authorization. Four steps, replayable from Settings → General.

Every integration is **real-first**: Steam, media and email use the real
implementation the moment it is detected or connected, with clearly labelled
demo data only as a fallback (`VITE_DEMO_MODE=false` disables the fallback).

## 3. Steam

If Steam is detected, the Gaming hub renders the **real installed library**
immediately (names, install state, sizes, artwork from Steam's local cache with
CDN fallback). **Play** launches via `steam://rungameid/<appid>` — only ids that
were discovered can be launched.

Achievements and playtime need the Steam Web API:

1. Settings → Integrations → Steam.
2. Enter a Web API key (steamcommunity.com/dev/apikey) and your SteamID64.
3. **Save securely** — both are stored in **Windows Credential Manager**
   (service `ai.nexus.desktop`). They never touch settings files, localStorage,
   logs, exports, or the UI after saving.

States you may see in a game's detail view, all handled without breaking the
hub: *Web API not configured*, *Profile is private* (set Steam "Game details"
to Public), *No achievements*, *Steam unreachable*, *API error*.

If Steam is not installed, NEXUS shows the demo library and labels it as such
(`VITE_DEMO_MODE=false` disables that fallback and shows "Steam not detected").

## 4. Media (e.g. `X:\`)

Settings → Media → **Add folder**. Pick `X:\` or `X:\Videos`. NEXUS:

- validates and canonicalizes the folder, records whether it is removable,
- grants the WebView read access to **that folder only** (asset protocol scope),
- runs a bounded background index (depth ≤ 10, ≤ 25 000 files, ~45 s budget,
  skips junctions/symlinks, verifies containment), showing progress and Cancel.

Then Media → Library browses folders, favorites, collections and local search;
click a video to load it into the six-player workspace. `.mp4/.webm/.m4v/.mov`
play natively; `.mkv/.avi` are flagged *potentially unsupported* (WebView2 codec
availability).

Drive unplugged → **MEDIA SOURCE DISCONNECTED**; the index and workspace are
preserved for reconnect. **Remove authorization** stops access instantly.
**Clear media history** wipes the local index/favorites/collections.

Media authorization never extends to Storage Analyzer or cleanup.

**Thumbnails** (Settings → Media → Local thumbnails): rendered by Windows' own
thumbnail provider, cached under hashed names per authorized location, purged
when that location's authorization is removed. Off by default.

**Restore workspace**: the last workspace structure comes back on launch behind
a curtain (“6 sources restored — Reveal”); nothing plays until you reveal it.

## 5. Privacy hotkey

`Ctrl+Shift+`` is registered system-wide, so it fires even when a player has
focus. Order: pause all media → (optionally clear workspace) → Home / minimize
/ hide-to-tray per Settings → Privacy. Test it there with **Test privacy mode**.

Settings → Privacy shows whether Windows actually accepted the registration
("registered system-wide" vs "not registered · in-app only"); if another app
owns the shortcut, pick one of the other curated choices (Ctrl+Shift+P,
Ctrl+Alt+P, Alt+Shift+P, F9, F10). The tray menu also has **Privacy**.

## 6. Gaming Mode

Settings → System: set safety to **Enabled** and allow process management /
startup changes as desired. Then System → Processes: mark user apps as
**Close when Gaming Mode starts** or **Never touch**. Entering Gaming Mode shows
exactly what will happen:

- graceful close of approved apps (`taskkill /IM`, never `/F`),
- switch to the existing High/Ultimate performance power plan (previous plan
  recorded; restored on exit — and on next start if NEXUS crashed),
- reduced NEXUS footprint (ambient effects, telemetry polling) while a launched
  game is detected running (read-only process probe; no injection).

Protected classes (Windows, drivers, security, hardware, unknown) can never be
targeted.

## 7. Autostart, tray, window

Settings → General → **Launch on login**. With **Start minimized** on, a login
launch stays in the tray; otherwise the window opens. **Close button** chooses
between minimize-to-tray (default) and exit. Tray: Open · Gaming Mode · Normal
Mode · Privacy · Exit. Window size/position persist; a position that is no
longer on any monitor is re-centered.

## 7b. GPU telemetry

Utilization and dedicated VRAM come from Windows performance counters (the same
source Task Manager uses), mapped to adapters by LUID. With an integrated GPU
plus the RTX 5090, NEXUS picks the adapter with the most dedicated memory as
primary; override in Settings → System → Primary GPU if needed. Temperature has
no vendor-neutral source and is shown as unsupported rather than invented.

## 7c. Email (Outlook / Gmail)

NEXUS ships no shared client credentials. Register once, then connect:

- **Outlook**: Microsoft Entra → App registrations → new *public client*
  application; add redirect `http://127.0.0.1` under *Mobile and desktop
  applications*; paste the *Application (client) ID* into Settings →
  Integrations → Outlook → Configure.
- **Gmail**: Google Cloud → OAuth client (*Desktop app*); paste client id and
  secret into Settings → Integrations → Gmail → Configure.

**Connect** opens your browser; the sign-in returns to a loopback address on
this machine and the tokens are stored in Windows Credential Manager, used only
inside the native layer. Scopes are read/modify (mark, archive, delete) —
NEXUS never sends email. Message bodies are never written to disk.
Classification is heuristic and explainable (*why?*), correctable per sender
(“Move messages like this to…”), and stays on this machine.

## 8. Diagnostics & backup

Settings → System → **Copy diagnostics** (sanitized: no keys, no media paths;
includes the recent redacted log). **Activity history** (launches, sessions,
modes, cleanup — never media names or message content) can be cleared or
disabled there.
Settings → General → **Export configuration** (versioned JSON; secrets and media
history are never exported; media root paths only if you tick the box).
