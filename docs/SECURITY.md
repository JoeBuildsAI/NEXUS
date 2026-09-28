# Security & Safety Model

NEXUS is a personal application that touches system telemetry, processes, storage
and (eventually) email and game libraries. It follows **least privilege** and a
set of hard safety rules enforced in code, not just the UI.

## Core principles

1. **No arbitrary shell execution — ever.**
   - The UI cannot run shell commands.
   - The AI/assistant layer cannot run shell commands. It may only select a
     registered `ActionRegistry` action id and pass structured args.
   - `open_external` (Rust) allows only an explicit scheme allowlist
     (`https`, `http`, `steam`, `mailto`).

2. **No destructive disk operation without explicit approval.**
   - Cleanup follows `DISCOVER → PROPOSE → APPROVE → EXECUTE`.
   - There is no path from discovery to deletion. `validateExecution` blocks
     execution unless candidates are individually approved, and destructive
     candidates additionally require a confirmation dialog.

3. **No automatic removable‑drive scanning.**
   - `eligibleDrivesForScan` returns fixed drives only; removable drives require
     explicit per‑drive opt‑in. `assertScanAllowed` throws on removable/network
     drives without opt‑in. The Rust layer marks removable drives
     `eligibleForScan = false` at the source.

4. **No automatic process termination outside an explicit allowlist.**
   - Every process is classified (`system-critical`, `driver`, `security`,
     `hardware`, `user-application`, `optional`, `unknown`).
   - `unknown` and `system-critical` (and driver/security/hardware) are
     **protected** and never auto‑managed.
   - Only `user-application`/`optional` processes that are **also** on the user’s
     explicit allowlist may be suspended, and only when system safety is
     `enabled`. The dev laptop defaults to `observe` (no mutations at all).
   - The classifier is conservative: ambiguous cases fall back to `unknown`.

5. **Reversible operating modes.**
   - Entering a mode records every intended change; in `observe` mode nothing is
     applied (changes are logged as `[observe] Would …`). Leaving a mode restores
     recorded state.

## What NEXUS never touches

Windows Defender, firewall, registry security policies, Windows Update,
authentication, UAC, and credential providers. NEXUS does **not** replace the
Windows secure lock/login screen — it starts *after* successful Windows login.

## Credentials & secrets

- No credentials or API keys are committed. `.env` is git‑ignored; only
  `.env.example` is tracked.
- Real integrations (Steam, Gmail, Microsoft Graph) will use OS secure storage
  (Windows Credential Manager) rather than files or env at runtime.

## Logging & privacy

Structured local logging (`src/lib/logger.ts`) with a redaction pass for
secret‑shaped keys. The logger must **not** receive email bodies, media
filenames, credentials, or private media history. Privacy‑relevant guarantees:

- Private media filenames/thumbnails never appear on Home or in global recent
  activity.
- No removable media scanning without authorization; cleanup never touches
  authorized removable media.
- “Clear media history” is available in Settings → Media.

## Content Security Policy

The WebView CSP restricts `connect-src` to the app + IPC, disallows remote
scripts, and scopes media/image sources. See `src-tauri/tauri.conf.json`.
The `index.html` meta policy applies too (the stricter wins); both must allow
`http://asset.localhost` for local artwork/media (`src/app/csp.test.ts`).
`frame-src https:` plus the browser-surface address policy keep NEXUS's own
origins, loopback and private hosts out of iframes.

### Remote pages (browser surfaces)

Verified against the release build in WebView2: Tauri injects its IPC shim
into every frame, but a remote `https://` iframe is refused by the ACL for
every command — application commands (telemetry, process close, power plan,
media roots, secrets, session), core commands (app, event, window) and plugin
commands (sql, autostart) — and direct `ipc.localhost` requests fail. The
capability lists only the local `main` window; never add remote URLs to it.

## Capabilities

Tauri capabilities (`src-tauri/capabilities/default.json`) grant only the
specific window/plugin permissions the app needs (window controls, tray,
dialog open, autostart toggle). The privacy hotkey is registered natively,
so no global-shortcut permission is exposed to the WebView.
