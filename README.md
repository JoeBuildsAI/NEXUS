# NEXUS

A premium personal operating layer for Windows — a cinematic, JARVIS‑style command center that becomes the primary environment you see after login. Windows remains the OS underneath; NEXUS is the polished layer on top.

Built for **Joseph**.

![status](https://img.shields.io/badge/status-alpha-5ed0e6) ![tests](https://img.shields.io/badge/tests-41%20passing-5ee6a1)

## What it is

NEXUS is a Tauri 2 desktop app (Rust native layer + React/TypeScript frontend) with a coherent, restrained sci‑fi design system: deep charcoal glass surfaces, subtle depth and glow, an animated ambient background, and smooth, tasteful motion.

### Modes / screens
- **Today** — the Home: greeting, NEXT / NOW, a chronological day that references calendar events, routines, workouts, meals and tasks (each owned by its domain), quiet Communications signals, nutrition against your targets.
- **Calendar** — local-first Day / Week / Month / Year / Agenda with create, edit, drag-to-move, all-day, multi-day, recurrence and series exceptions; scheduled workouts appear automatically. External calendars stay behind an honest provider boundary (not connected in this build).
- **Life** — routines (generic engine: schedules, conditional steps, one-click logging, history), fitness (templates, weekly/rotating/manual programs, live sessions with targets, previous values, PBs, rest timer, history), nutrition (provenance-aware metrics vs your own targets), meals (planner + logging + derived nutrition), groceries (derived from the plan, pantry-aware, priced only when known), tasks. Stored in a local SQLite database with backups, export and import.
- **Play** — console-style rail (keyboard/controller friendly) over Steam and locally discovered Xbox PC games, plus a library (Continue Playing / Recently Played / Installed / Completion) and a rich game‑detail view with achievements, closest achievements, and playtime. Steam‑shaped provider interface.
- **Media** — private local video wall: an adaptive layout optimizer for 1–6 players (aspect‑aware, primary/focus modes), Smart fill / Fit / Fill without distortion, original‑quality playback, Full and precise A–B segment looping with saved presets, saved workspaces, removable‑drive resilience, and an instant global **privacy hotkey**.
- **System** — live telemetry, a safe process viewer with safety classification, storage analyzer, and startup apps.
- **Communications** — unified multi‑account Outlook + Gmail inbox (demo inbox until connected): explainable local classification into 15 categories, twelve views and filters, Inbox Health with honest KNOWN/ESTIMATED/UNAVAILABLE figures, subscription manager with safe bulk unsubscribe (RFC 8058 one‑click or rule fallback), real Gmail filters / Outlook rules with preview, review‑first cleanup transactions, and an optional (unconfigured, never faked) intelligence boundary.
- **Settings** — General, Appearance, Startup, Gaming, Media, Privacy, System, Shortcuts, Integrations, AI, Life, Data.

### Signature features
- **Boot sequence** — `INITIALIZING NEXUS` → `WELCOME, JOSEPH` → Home (skippable, respects reduced motion).
- **Command palette** (`Ctrl+Space`) — natural‑ish commands routed through a deterministic local parser into a locked‑down `ActionRegistry`.
- **Operating modes** — Normal / Gaming / Media / Work / Focus with a safety‑first, reversible change model.
- **Privacy mode** (`Ctrl+Shift+``) — immediately pauses media, hides the workspace, and returns Home / minimizes.

## Quick start

```bash
npm install
npm run tauri:dev      # launches the native desktop app (Rust + WebView2)
```

Frontend‑only preview (no native features):

```bash
npm run dev            # http://localhost:1420
```

### Verify

```bash
npm run typecheck      # strict TypeScript
npm run lint
npm run test           # vitest (safety-critical logic)
npm run build          # tsc + vite production build
npm run tauri:build    # NSIS installer (Windows)
```

## Requirements
- Node 18+ and npm
- Rust (stable, MSVC toolchain) — https://rustup.rs
- Microsoft Visual Studio C++ Build Tools + WebView2 (present on Windows 11)

## Demo mode

By default `VITE_DEMO_MODE=true`, so every domain uses realistic mock data and the app looks complete with zero integrations. Real system telemetry is used automatically when running under Tauri. See [`.env.example`](.env.example) and [docs/PROVIDERS.md](docs/PROVIDERS.md).

## Architecture at a glance

```
src/
  app/          shell + screen router
  components/   design system (ui/), shell/, background/, layout/
  screens/      home, gaming, media, system, communications, settings
  providers/    system | steam | media | email | assistant (interface + mock + real)
  core/         types, config, demo data, safety, storage, modes, actions
  state/        zustand stores (navigation, settings, modes, telemetry, media, privacy)
  hooks/  lib/
src-tauri/      Rust native layer (telemetry, processes, tray, plugins)
```

Presentation, application state, native functionality, external integrations, AI, and persistence are kept in separate layers. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security & safety

NEXUS follows least privilege and a strict safety model — no arbitrary shell execution from the UI or AI, no automatic removable‑drive scanning, no termination of critical/unknown processes, and destructive actions require explicit confirmation. See [docs/SECURITY.md](docs/SECURITY.md).

## Deploying to the gaming PC

See [docs/GAMING_PC_SETUP.md](docs/GAMING_PC_SETUP.md) for detecting Steam, authorizing media folders, enabling startup, configuring process allowlists, and switching mocks → real providers.
