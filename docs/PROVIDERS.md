# Providers

Every external/system capability sits behind an interface with at least a mock
implementation. The UI depends only on the interface; `src/providers/index.ts`
chooses the concrete implementation from `src/core/config.ts` (env‑driven).

## Selection

`config.providers.<domain>` is `mock | real | auto`:
- **mock** — always demo data.
- **real** — always the real implementation (may be a documented stub today).
- **auto** — real when viable (Tauri present, and — except for `system` — not
  demo mode), otherwise mock.

Set via env (see `.env.example`): `VITE_PROVIDER_SYSTEM`, `VITE_PROVIDER_STEAM`,
`VITE_PROVIDER_MEDIA`, `VITE_PROVIDER_EMAIL`, `VITE_PROVIDER_ASSISTANT`,
plus `VITE_DEMO_MODE` and `VITE_SYSTEM_SAFETY`.

## Domains

### SystemProvider
`getTelemetry`, `getDrives`, `getProcesses`, `getStartupApps`.
- `MockSystemProvider` — animated demo telemetry + demo processes/drives.
- `TauriSystemProvider` — real telemetry from Rust (`sysinfo`); applies process
  classification client‑side; falls back to mock per‑capability on error.
- Real telemetry is preferred whenever running under Tauri (even in demo mode).

### SteamProvider
`getGames`, `getGameDetails`, `getAchievements`, `launchGame`.
- `MockSteamProvider` — realistic demo library (We Were Here Too, Cyberpunk 2077,
  Baldur’s Gate 3, Helldivers 2, …) with achievements and rarity.
- `RealSteamProvider` — documented stub. Intended path (no HTML scraping):
  1. Detect Steam install via registry (Rust).
  2. `IPlayerService/GetOwnedGames` for the library.
  3. `ISteamUserStats/GetPlayerAchievements` + global rarity percentages.
  4. Local install state/sizes from `libraryfolders.vdf` / `appmanifest`.
  5. `launchGame` → `steam://rungameid/<appid>` via `open_external`.
  API key + SteamID stored in OS secure storage.

### MediaProvider
`getItems`, `getCollections`, `getAuthorizedRoots`, `authorizeRoot`,
`revokeRoot`, `clearHistory`.
- `MockMediaProvider` — demo library using public sample videos so the six‑player
  workspace is fully functional; all demo items marked private.
- `LocalMediaProvider` — stub. Intended path: dialog‑based folder authorization,
  removable‑drive detection + opt‑in, root‑scoped enumeration (never whole‑drive),
  asset‑protocol playback, local SQLite index (private by default).

### EmailProvider
`getAccounts`, `getMessages`, `getSummary`, `markRead`, `archive`, `delete`,
`unsubscribe`.
- `MockEmailProvider` — realistic multi‑account inbox with heuristic categories
  and working local actions. Real Gmail / Microsoft Graph adapters come later
  (credentials via OS secure storage).

### AssistantProvider
`interpret(input)` → ranked matches referencing **registered action ids only**.
- `LocalCommandProvider` — deterministic parser (navigation, modes, media,
  privacy, game launch). A future LLM provider implements the same interface and
  is likewise restricted to `ActionRegistry` actions — never shell.

## Adding a real provider
1. Implement the interface in `providers/<domain>/Real*Provider.ts`.
2. Wire it into the `pick(...)` call in `providers/index.ts`.
3. Flip the env flag (and store any secret in OS secure storage).
No screen/component changes required.
