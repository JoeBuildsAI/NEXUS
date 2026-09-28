# AGENTS

Project conventions and verified commands for NEXUS (Tauri 2 + React/TS).

## Commands (verified working)

```bash
npm install            # install JS deps
npm run dev            # Vite dev server on http://localhost:1420 (frontend only)
npm run tauri:dev      # full native app (Rust + WebView2)
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint (.ts,.tsx)
npm run test           # vitest run (~310 tests)
npm run build          # tsc --noEmit && vite build
npm run tauri:build    # NSIS installer (Windows)
```

Visual audit (headless Edge via playwright-core, needs `npm run dev` or `tauri:dev` running):
`node scripts/screenshots.mjs 1920x1080` → `scripts/.shots/*.png` (also reports page errors).
Quick error probe: `node scripts/diag.mjs`.
Dev simulation panel in the app: `Ctrl+Shift+D` (dev builds only).

Rust lives in `src-tauri/`. Cargo needs to be on PATH (`~/.cargo/bin`); toolchain
is stable MSVC. `cargo build` inside `src-tauri` compiles the native layer;
`cargo test --lib` runs the Rust unit tests (steam/media/storage/system fixtures).

Installer: `npm run tauri:build` → `src-tauri/target/release/bundle/nsis/NEXUS_0.5.1_x64-setup.exe`
(NSIS, per-user, unsigned; ~3 min release compile).

Adding a Tauri feature to `Cargo.toml` (e.g. `protocol-asset`) must be paired
with the matching `tauri.conf.json` setting in the same edit, or the dev watcher
dies with an allowlist mismatch.

If port 1420 is stuck between runs, kill the listening PID:
`netstat -ano | grep :1420` then `taskkill //F //PID <pid>`.

## Conventions
- Strict TypeScript; path alias `@/* → src/*`.
- Keep modules small; prefer reusable components over giant page components.
- Never import demo data or providers directly into screens — go through
  `getProviders()` and the zustand stores.
- Demo/mock data lives in `src/core/demo/*` behind providers.
- Design system primitives live in `src/components/ui`.
- Do not add emojis to files. Do not add/remove comments unless relevant.

## Design system (NEXUS BLACK)
- Black is the interface: environment bottoms out at #000; hierarchy comes from
  type scale, spacing, luminance and artwork — not bordered cards. Radii 3/6/10px.
- Tokens live in `tailwind.config.js` (`void`, `surface`, `accent` = platinum,
  `text-micro`, `text-display-*`) and `src/styles/global.css` (`.label`, `.rule`,
  `.glass-strong`, scrollbars, focus ring). `cn()` in `src/lib/utils.ts` knows the
  custom font sizes — add any new `text-*` size token there too.
- Large numerals use Inter (`font-sans … tabular tracking-tight`); headings use
  Space Grotesk; telemetry uses JetBrains Mono.
- Visual audit: `node scripts/screenshots.mjs 1920x1080` (add `--quick` to skip
  mode/onboarding/empty-state flows); `node scripts/unused.mjs` lists dead modules.

## Phase 5 additions (native)
- `gpu.rs` — PDH GPU Engine/Adapter Memory counters + DXGI LUID mapping; `GpuState` in app state.
- `media_thumbs.rs` — IShellItemImageFactory thumbnails/icons → PNG; hashed cache under app cache dir.
- `oauth.rs` — PKCE + loopback OAuth, token storage (native-only keyring keys), allowlisted mail API proxy.
- `apps.rs` — resolved .lnk targets (IShellLinkW), App Paths, ranking, shell icons.
- Windows crate features live in `Cargo.toml` `[target.'cfg(windows)'.dependencies]`.
- Stress/chaos visual audit: `node scripts/stress.mjs` (uses `window.__nexusDev` in dev builds).

## 0.4.0 additions
- Media: `src/core/media/layout.ts` (deterministic wall optimizer), `loop.ts` (A–B model); `PlayerTile`/`VideoWall`/`Timeline`; `loopPresetsStore` purged with roots; `useMediaRootWatch` (drive lifecycle). Demo clips in `public/demo` (generated, synthetic). `node scripts/gen-fixtures.mjs` makes larger fixtures for `node scripts/media-audit.mjs` (layout/loop/perf audit with real playback).
- Comms: `src/core/email/{classify,unsubscribe,rules,cleanup,health}.ts` are pure and tested; providers in `src/providers/email` (slot-scoped RealMailProvider, EmailAutoProvider over `emailAccountsStore`); native tokens `email.<provider>.<slot>.*`; `unsubscribe_one_click` in `oauth.rs`. `node scripts/comms-audit.mjs [--stress]` drives the demo/synthetic inbox incl. chaos states.
- Intelligence boundary: `src/providers/intelligence` — only `NoIntelligenceProvider` exists; never fake output.

## 0.5.0 additions (Life OS)
- Portable domain: `src/core/life/**` is UI- and platform-free (ESLint `no-restricted-imports` enforces it) — time (local DayKeys), recurrence, calendar, routines, fitness, nutrition, grocery, tasks, today aggregation, repository interface, transfer (export/import), sample + synthetic data. A future mobile app consumes this folder unchanged.
- Persistence: `LifeRepository` → `SqliteLifeRepository` (desktop, tauri-plugin-sql, migrations in `src-tauri/src/life_db.rs`, WAL, integrity check, VACUUM INTO backups, attach-validate-swap restore) or `MemoryLifeRepository` (browser preview/tests, localStorage). App state lives in `src/state/lifeStore.ts`. DB: `%APPDATA%/ai.nexus.desktop/life.db`; backups under `backups/`.
- Screens: `src/screens/today` (Home), `src/screens/calendar`, `src/screens/life/*`. Settings → Life (reminders) and Data (backup/restore/export/import/sample data/wipe).
- Play: `src-tauri/src/xbox.rs` discovers GDK titles from `<drive>:\XboxGames\*\Content\MicrosoftGame.config`; `src/providers/xbox`; rail in `src/screens/gaming/GameRail.tsx`.
- Media: BROWSER surfaces (`BrowserTile`, sandboxed iframe, https only) share the wall; CSP `frame-src https:`.
- Audits: `node scripts/life-audit.mjs [WxH]`; scale/perf: `npx vitest run src/core/life/scale`.

## 0.5.1 additions (real gaming-PC hardening)
- Drive the REAL native app: start `tauri:dev` with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222 --remote-allow-origins=http://127.0.0.1"`
  and connect `playwright-core` with `chromium.connectOverCDP("http://127.0.0.1:9222")`. Keep scratch
  drivers outside the repo (gitignored paths are not writable by agent file tools). Playwright's CDP
  session emulates focus — use raw CDP `Runtime.evaluate` when focus matters.
- Relaunching the app (or a Rust edit under `tauri dev`) pops a maximized window in front of the
  user; avoid while someone is using the PC.
- Steam: `EAppState` flags (2048 = uninstalling), manifest `LastPlayed`, non-game apps filtered,
  artwork in `librarycache/<appid>/<sha1>/library_capsule.jpg` (`steam::local_artwork_in`).
- Xbox: DLC configs skipped; AUMID app id from `Content/appxmanifest.xml`.
- CSP: `index.html` meta and `tauri.conf.json` must both allow `http://asset.localhost` (`src/app/csp.test.ts`).
- Safety: process class `platform` (Steam/Xbox/anti-cheat) is protected; the allowlist ships empty;
  `modeStore` re-classifies running instances by path before closing (veto).
- Privacy hotkey is registered natively (`hotkey.rs`, event `nexus:privacy-hotkey`).
- Performance: ambient motion runs on one frame-limited clock (`ambientMotion.ts`) and stops when the
  window is not in front (`windowStore`, native focus events); telemetry cadence from `telemetryInterval`.
- `useExternalGameWatch` + `processes_running_under` detect games started outside NEXUS.
- Commits on a fresh machine without git identity: pass `GIT_AUTHOR_*`/`GIT_COMMITTER_*` env vars
  (never edit git config).

## Native/provider boundaries
- Steam: discovery reads only registry-located Steam paths + manifests; launch
  by numeric app id only; Web API key/SteamID live in Windows Credential Manager
  (`keyring`, service `ai.nexus.desktop`) and are injected in Rust — never sent to UI.
- Media: roots are user-picked, canonicalized, granted to the asset protocol at
  runtime; scans are bounded and skip reparse points; never log paths/filenames.
- Gaming Mode: graceful close only (`taskkill /IM`, no `/F`), existing power
  plans only, session file in app-data for crash recovery.
- Cleanup: explicit rules in `storage.rs` (`RULES`); never add "delete folder X".

## Safety rules (do not weaken — see docs/SECURITY.md)
- No arbitrary shell execution from UI or AI; AI selects only `ActionRegistry` ids.
- No automatic removable‑drive scanning (`eligibleDrivesForScan` / `assertScanAllowed`).
- No auto process termination outside the explicit allowlist; `unknown` +
  `system-critical` are always protected. Classifier is conservative.
- Destructive actions require confirmation (`confirmStore` / `ConfirmDialog`).
- Cleanup is DISCOVER→PROPOSE→APPROVE→EXECUTE; never straight to delete.

## Tests to keep green
`processClassifier`, `storageService`, `ActionRegistry`, `modeEngine`,
`LocalCommandProvider`, `privacyStore`, provider factory.
