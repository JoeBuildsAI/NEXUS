# AGENTS

Project conventions and verified commands for NEXUS (Tauri 2 + React/TS).

## Commands (verified working)

```bash
npm install            # install JS deps
npm run dev            # Vite dev server on http://localhost:1420 (frontend only)
npm run tauri:dev      # full native app (Rust + WebView2)
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint (.ts,.tsx)
npm run test           # vitest run (41 tests)
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

Installer: `npm run tauri:build` → `src-tauri/target/release/bundle/nsis/NEXUS_0.5.0_x64-setup.exe`
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
