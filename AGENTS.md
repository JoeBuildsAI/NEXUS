# AGENTS

NEXUS is a high-definition local video player (Tauri 2 + React/TS + Rust):
one video at a time, precise A–B loop markers, repeat (off / this video /
whole folder), and the other videos of the same folder with real thumbnails.

The previous product (the NEXUS "personal operating layer": PLAY, LIFE,
SYSTEM, Communications, media wall, …) is archived at tag
`archive/nexus-0.5.1` and branch `archive/nexus`. Do not port code back from
it unless asked.

## Commands (verified working)

```bash
npm install            # install JS deps
npm run dev            # Vite dev server on http://localhost:1420 (frontend only; no file access)
npm run tauri:dev      # full native app (Rust + WebView2)
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint (.ts,.tsx)
npm run test           # vitest run
npm run build          # tsc --noEmit && vite build
npm run tauri:build    # NSIS installer (Windows)
```

Rust lives in `src-tauri/`. Cargo must be on PATH (`~/.cargo/bin`, stable MSVC).
`cargo test --lib` inside `src-tauri` runs the Rust unit tests.

Installer: `npm run tauri:build` → `src-tauri/target/release/bundle/nsis/NEXUS_<version>_x64-setup.exe`
(NSIS, per-user, unsigned; registers "Open with" for mp4/m4v/mov/webm).

Drive the real app for validation: start it with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222 --remote-allow-origins=http://127.0.0.1"`
and connect over CDP. Keep scratch scripts outside the repo. Launching the app
pops a window in front of the user; check the foreground window first.

Commits on a machine without git identity: pass `GIT_AUTHOR_*`/`GIT_COMMITTER_*`
env vars (never edit git config).

## Layout

- `src-tauri/src/library.rs` — `open_video` / `open_folder` / `refresh_folder` / `launch_file`.
  Canonicalizes, grants the asset protocol the opened folder only (non-recursive),
  lists videos directly in it (bounded, reparse points skipped, natural sort).
- `src-tauri/src/thumbs.rs` — Windows Shell (IShellItemImageFactory) video frames →
  PNG under the app cache dir; hashed names keyed by path+size+mtime; only for files
  in an opened folder; rendered off the UI thread.
- `src-tauri/src/windows.rs` — independent player windows (labels `main`, `player-N`, no
  limit), cascade placement, per-label pending file handoff (`take_initial_file`).
  `tauri-plugin-single-instance` forwards second launches / Explorer "Open with" → new window.
  Window-state restore applies to `main` only. Capabilities cover `main` and `player-*`.
- Thumbnails are shared by all windows: one render per file (per-name async lock),
  atomic writes, session negative cache.
- `src/core/` — pure, tested logic: `loop.ts` (A–B segment model), `playlist.ts`
  (repeat/next), `shortcuts.ts` (key map), `persistence.ts` (shared records),
  `native.ts` (the only bridge to Rust).
- `src/state/player.ts` — this window's zustand store (no persist middleware). Each window is
  its own document, so stores are never shared. Shared localStorage records (persistence.ts):
  window defaults (read at window start, written on change — seeds the next window only),
  one A–B preset key per video identity, last file. Never sync playback live across windows.
- `src/state/video.ts` — live `<video>` state + imperative `playback` handle.
- `src/components/` — `Player` (stage, per-frame A–B loop via
  `requestVideoFrameCallback`), `Timeline` (draggable A/B handles), `Controls`,
  `FolderPanel` (lazy queued thumbnails via `useThumbnail`), `TitleBar`, `EmptyState`.

## Rules

- Local only: never upload media, frames, filenames or paths; never log them.
- No shell/fs plugins in capabilities; files reach the WebView only through the
  asset protocol for folders the user opened.
- CSP lives in both `index.html` and `tauri.conf.json` and must match (`src/csp.test.ts`).
- Never transcode or upscale; play the original stream with `object-fit: contain`.
- Strict TypeScript; path alias `@/* → src/*`. No emojis in files.
- Design: black stage, quiet white type, sky-400 accent reserved for loop/active state.
