# IronNestFCT

An **internal + external fire control** integration project for *Iron Nest: Heavy Turret Simulator*:

- **External fire-control terminal** (this directory): tactical map + cross-bearing positioning + briefing import + ballistics / TOT / moving-target / train solutions + master fire plan. It can be launched standalone for offline calculation experiments, and also serves as the front end for in-game automatic fire control.
- **Internal fire-control mod** (`internal/`, derived from IronNestFCS-Smart): MelonLoader in-game automation (solving, loading, aiming, firing) that receives fire plans from the external terminal over a local HTTP + SSE bridge.

## Directory structure

```text
src/shared/            Pure functions and shared config (ballistics, coordinates,
                       positioning, TOT, intercept, derivation, bridge client)
src/renderer/map.html  Main terminal UI (shared by Tauri desktop and browser)
index.html             Standalone elevation quick-calc page (mobile/browser)
overlay.html           Read-only master fire plan overlay window
src-tauri/             Tauri 2 desktop shell (Windows release build only)
tests/unit/            Unit tests for formulas and pure functions
internal/              Internal fire-control mod (MelonLoader, derived from
                       IronNestFCS-Smart + bridge)
```

## Cross-platform development

The game and the internal mod run on Windows only; Linux / macOS are used **only for developing and testing the external UI**.

```bash
# Any platform: run the pure-function unit tests
npm test

# Any platform: browser dev server (no Tauri / Rust required)
npm run dev:web
# open http://127.0.0.1:5180/src/renderer/map.html

# Windows only (requires Rust + VS Build Tools + Node.js):
npm install
npm run dev        # Tauri desktop dev build
npm run build      # Windows portable EXE (single, install-free)
```

`npm run dev:web` uses the zero-dependency `scripts/dev-server.js` to serve the repository root. `map.html` degrades gracefully in a normal browser via `tauri-bridge.js`, so you do not need Tauri dependencies on Linux to develop the UI.

## New capabilities

- **Chained derivation auto-refresh**: when a target is located relative to a "point" (an observer or another target), its derivation dependency is recorded. After that point's coordinate is manually corrected, targets depending on it are re-solved automatically and the refresh cascades along the dependency chain.
- **Destroyed-target archive**: destroying a target no longer deletes it. It is kept semi-transparent and archived into the "destroyed" column in destruction order, persisted the same way as normal targets.
- **Internal/external fire-control bridge**: the external terminal's "sync fire plan" action is sent over local HTTP to the in-game mod, which auto-loads/aims/fires; the mod streams gun state, queue and plan progress back over SSE.

## Internal fire-control bridge (HTTP + SSE)

- The mod (`internal/`) listens on `127.0.0.1:37841` (falls through to 37842… if the port is taken).
- Endpoints: `GET /ping` (discovery), `GET /events` (SSE status stream), `POST /command` (commands).
- Commands: `sync` (push/replace fire plan), `clear` (clear plan), `autofire` (toggle auto fire).
- Events: `status` (bind state, per-gun physical state, turret azimuth, pending count, plan progress).
- **AutoFire timed firing**: train / moving / TOT tasks fire on a relative countdown (`fireAtSec` seconds after receipt). The in-game mission clock is not located yet, so absolute-time alignment is reserved as a later hook.
- **Time-sensitive priority preemption queue**: pending tasks are ordered by (fire deadline, priority) ascending; only **not-yet-started** tasks are reordered, and tasks already loading/aiming/firing are not interrupted.
- The original in-game detailed FCS UI (IMGUI) is **left blank for now**; status is shown by the external terminal.

### Internal mod deployment (Windows release)

Like the reference mod, **end users do not need to edit `GameDir` or recompile**: the developer packages once on Windows into a three-folder release ZIP, and users just extract it into the game root.

```powershell
# Run on Windows (internal mod packaging):
cd internal
.\打包.bat                  # auto-detect the game directory
# or pass it explicitly:
powershell -File tools\Build-ReleasePackages.ps1 -GameDir "D:\SteamLibrary\steamapps\common\Iron Nest Heavy Turret Simulator"
```

The artifact `artifacts/release-v<version>/IronNestFCT_internal_v<version>.zip` contains three folders:

- `Mods/IronNestFCS.dll` (host mod)
- `UserLibs/IronNestFCS.Abstractions.dll` (ABI contract)
- `UserData/IronNestFCS/IronNestFCS.Logic.dll` (fire-control logic)

Users extract the ZIP and merge the `Mods` / `UserData` / `UserLibs` folders into the game root.

### External UI deployment (portable EXE)

The external terminal is packaged as an **install-free, portable single-file EXE** (Tauri 2, `bundle.active: false`, frontend assets embedded at compile time):

```bat
# Run on Windows (repository root):
打包exe.bat
```

- Artifact: `artifacts/IronNestFCT.exe` (single file, double-click to run, no installation).
- Target machines need the WebView2 runtime (preinstalled with Edge on Windows 10/11).
- Frontend assets are embedded at compile time; no `tauri-dist/` folder is needed at runtime.

## Sources and acknowledgments

This project combines **external + internal fire control** and references and credits the following resources:

| Source | Role | Links |
| --- | --- | --- |
| Iron Nest Fire Control Terminal | **External fire control** | demo video & source [BV13RgG6nEYp](https://www.bilibili.com/video/BV13RgG6nEYp) · author [space.bilibili.com/484713314](https://space.bilibili.com/484713314) |
| IronNestFCS-Smart | **Internal fire control** | [GitHub HisenWeb/IronNestFCS-Smart](https://github.com/HisenWeb/IronNestFCS-Smart) · [svr2kos2/IronNestFCS: A Fire Control System for Iron Nest](https://github.com/svr2kos2/IronNestFCS) · author [space.bilibili.com/568944](https://space.bilibili.com/568944) |
| IronNestFCS | **Internal + external combined instance** | [GitHub Walkersifolia/IronNestFCS](https://github.com/Walkersifolia/IronNestFCS) · author [Walkersifolia](https://github.com/Walkersifolia) · demo video [BV13oub6cE9K](https://www.bilibili.com/video/BV13oub6cE9K) |

- **External fire control**: the external fire-control terminal UI in this directory is derived directly from the "Iron Nest Fire Control Terminal". No public GitHub repository has been found for it; please let us know if one exists.
- **Internal fire control**: IronNestFCS-Smart (upstream [svr2kos2/IronNestFCS](https://github.com/svr2kos2/IronNestFCS)) provides the reference implementation for in-game automatic fire control.
- **Combined instance**: IronNestFCS (project 1) is maintained by [Walkersifolia](https://github.com/Walkersifolia) and is the pioneering instance of combined internal + external fire-control use.

**Apology**: we could not find HisenWeb's Bilibili homepage. If you know it, please let us know so we can add it.

Copyright and contributions of the upstream code belong to their original authors and contributors.

## Disclaimer

This is an unofficial, community-made project and is **not affiliated with, endorsed by, or sponsored by** the developers or publishers of *Iron Nest: Heavy Turret Simulator*. Any game-related names are used for identification only. This project is provided for learning and personal/single-player entertainment; use it at your own risk.

## License

[GPL-3.0](LICENSE)
