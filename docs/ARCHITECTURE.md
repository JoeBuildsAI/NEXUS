# Architecture

## Life OS layering and the future mobile boundary (0.5)

```
src/core/life/        PORTABLE DOMAIN — no React, DOM, Tauri, Windows, zustand
  time · recurrence · calendar · routines · fitness · nutrition · grocery ·
  tasks · today · models · repository (interface + memory impl) · transfer ·
  sample · synthetic
src/providers/life/   DESKTOP persistence: SqliteLifeRepository (tauri-plugin-sql)
src/state/lifeStore   App cache + domain operations over LifeRepository
src/screens/today|calendar|life   Desktop UI
src-tauri/src/life_db.rs          Migrations, paths, backups, quarantine
```

The mobile app of the future imports `src/core/life` as-is and supplies its
own `LifeRepository` (e.g. SQLite on device) and UI. ESLint blocks any import
of React, Tauri, providers, state or components from that folder. Entities are
sync-ready (stable ids, createdAt/updatedAt, rev, tombstones; SQLite keeps a
change log) but no cloud sync exists — nothing is faked.

Privacy classes: SECRET (OAuth tokens, credentials → Credential Manager only),
PRIVATE (email content, media paths → never logged/exported), PERSONAL
(routines, fitness, nutrition, calendar, tasks → life.db, exportable by the
user), PUBLIC APP STATE (settings, layout).

NEXUS separates six concerns into distinct layers. Dependencies point inward:
UI depends on state and provider *interfaces*, never on concrete integrations.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Presentation        src/components, src/screens, src/app   │
│ 2. Application state    src/state (zustand)                    │
│ 3. Native Windows       src-tauri (Rust) via provider adapters │
│ 4. External integ.      src/providers/{steam,email,...}        │
│ 5. AI / command layer   src/providers/assistant, core/actions  │
│ 6. Persistence          zustand persist (localStorage) → SQLite│
└─────────────────────────────────────────────────────────────┘
```

## 1. Presentation
- `src/components/ui` — reusable design‑system primitives (Panel, Button, Badge, ProgressRing, StatBar, Sparkline, Toggle, Slider, Tabs, ConfirmDialog).
- `src/components/shell` — TitleBar, NavRail, CommandPalette, BootSequence, ModeSwitcher, PrivacyVeil.
- `src/components/background` — procedural `AmbientBackground` (canvas particles + gradients), designed so WebGL/video/contextual scenes can replace it later.
- `src/screens/*` — one folder per top‑level screen, composed of small components rather than monolithic pages.

Screens never import demo data or integrations directly — they read through providers and stores.

## 2. Application state (`src/state`)
Lightweight zustand stores, each with a single responsibility:
- `navigationStore` — current screen, selected game, system tab, command‑palette + boot phase.
- `settingsStore` — persisted user settings (appearance, startup, gaming, media, privacy, system, AI).
- `modeStore` — operating mode, active session, reversible change history.
- `telemetryStore` — polls the system provider and keeps a rolling history for sparklines.
- `mediaStore` — six‑player workspace slots + saved layouts (persisted, never auto‑playing on restore).
- `privacyStore` — synchronous privacy activation.
- `confirmStore` — global confirmation gate for impactful actions.

## 3. Native Windows layer (`src-tauri`)
Rust commands with typed inputs/outputs and error handling:
- `telemetry.rs` — `get_telemetry`, `get_drives` (via `sysinfo`). Removable drives are marked `eligibleForScan = false` at the source.
- `system.rs` — `get_processes` (compact, top‑by‑memory), `get_startup_apps` (stub → frontend falls back to demo), `open_external` (scheme‑allowlisted URL open).
- `lib.rs` — plugin registration (shell, dialog, fs, autostart, global‑shortcut), system tray, minimize‑to‑tray, managed `AppState`.

The frontend talks to Rust only through `TauriSystemProvider`, which falls back to `MockSystemProvider` per‑capability so the UI is never blocked by a missing native feature.

## 4. External integrations (`src/providers`)
Each domain defines an interface plus a mock and a real/stub implementation:
- `system` — `SystemProvider` → `MockSystemProvider`, `TauriSystemProvider`.
- `steam` — `SteamProvider` → `MockSteamProvider`, `RealSteamProvider` (documented stub).
- `media` — `MediaProvider` → `MockMediaProvider`, `LocalMediaProvider` (stub).
- `email` — `EmailProvider` → `MockEmailProvider`.
- `assistant` — `AssistantProvider` → `LocalCommandProvider`.

`src/providers/index.ts` is the single factory. Real vs. mock is chosen purely from `src/core/config.ts` (env‑driven), so enabling real providers on the gaming PC requires zero UI changes.

## 5. AI / command layer
- `core/actions` — the `ActionRegistry` is the **only** surface that can cause side effects from the palette or any assistant. Actions declare `requiresConfirmation`; destructive ones are gated.
- `providers/assistant/LocalCommandProvider` — deterministic natural‑language → action mapping. A future LLM provider implements the same interface and is likewise restricted to registered actions (never shell).

## 6. Persistence
Settings and the media workspace persist via zustand’s `persist` middleware (localStorage) today. The domain models and repository‑style provider boundaries are designed to move to SQLite (via a Tauri plugin) without touching the UI when richer persistence is warranted.

## Data flow example (telemetry)
`telemetryStore.start()` → `getProviders().system.getTelemetry()` → (`TauriSystemProvider` → Rust `get_telemetry` | `MockSystemProvider` → `demoTelemetry`) → store updates → `SystemStatusPanel` / `SystemOverview` re‑render.
