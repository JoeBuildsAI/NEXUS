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

Rust lives in `src-tauri/`. Cargo needs to be on PATH (`~/.cargo/bin`); toolchain
is stable MSVC. `cargo build` inside `src-tauri` compiles the native layer.

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
