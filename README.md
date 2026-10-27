# NEXUS

A high-definition local video player for Windows.

- **Original quality.** Plays the file's own stream on a pure black stage — no transcoding, no upscaling filters.
- **A–B loops.** Set loop start and end at the playhead (`I` / `O`), drag the markers on the timeline, and loop the segment (`L`). Markers are remembered per video.
- **Repeat.** Off, this video, or the whole folder (`R`).
- **The folder, at a glance.** Every other video in the same folder, with a real frame from each file. Click to play; `N` / `P` for next / previous.
- **Many windows.** Like Windows Photos: every video can play in its own window with its own position, volume, speed, repeat and A–B loop. `Ctrl+N`, "Open in new window" in the folder (or Ctrl+click / middle-click), and opening a video from Explorer all create a new window — nothing already playing is replaced. No window limit beyond what your hardware can decode.
- **Private.** Everything stays on your machine. NEXUS can read only the folder you opened.

## Keyboard

| Key | Action |
| --- | --- |
| Space / K | Play / pause |
| ← / → | Back / forward 5 s (Shift: 30 s) |
| , / . | Previous / next frame |
| I / O | Set loop start A / end B |
| L | Loop A–B on/off |
| A | Jump to A |
| X | Clear markers |
| R | Repeat: off → this video → folder |
| N / P | Next / previous video |
| F / Esc | Full screen / exit |
| M, ↑ / ↓ | Mute, volume |
| [ / ] | Slower / faster |
| B | Show / hide the folder |
| Ctrl+O | Open a video |
| Ctrl+N | New window |

Drop a video (or a folder) anywhere on the window to open it.

## Build

Requires Node 20+, Rust (stable MSVC) and WebView2.

```bash
npm install
npm run tauri:dev     # run
npm run tauri:build   # NSIS installer
```

The previous NEXUS "personal operating layer" is archived at tag `archive/nexus-0.5.1`.
