# EnvSnap - Environment Manager

A Windows desktop app for managing and switching environment variables through presets. Built with Electron, React, and TypeScript.

## What it does

- Create, edit, and organize environment variable presets (e.g. Development, Staging, Production)
- Activate a preset to write variables to Windows User Environment Variables in one click
- Switch presets from the system tray without opening the main window
- Automatic backup before every activation — roll back anytime
- Import/export presets as JSON for team sharing
- Portable or installable

## Screenshots
<img width="960" height="680" alt="14194586-3d32-40a0-9b04-158e5d63b715" src="https://github.com/user-attachments/assets/4ec9c182-330f-4ccb-ad74-d3a605d6770f" />
<img width="960" height="680" alt="b7961a81-9d5e-4a7b-b732-b7b93b99a6f7" src="https://github.com/user-attachments/assets/ded4eb6e-cba4-4694-8c07-01f40d574a87" />
<img width="960" height="680" alt="07eeab1e-abf4-4ed2-9ab7-1957aad75dcf" src="https://github.com/user-attachments/assets/4cfea98e-7b72-4566-9627-c6290092e875" />
<img width="289" height="308" alt="03b3bbc5-1001-4982-968e-7559dda0b733" src="https://github.com/user-attachments/assets/e41ee648-1f16-4829-bcd0-9a5cbdd29e67" />


<!-- Add screenshots here -->

## Requirements

- Windows 10 or 11
- No admin privileges needed (writes to User Environment Variables only)

## Installation

### Installer

Download `EnvSnap Setup x.x.x.exe` from [Releases](../../releases), run it, and follow the prompts.

### Portable

Download `EnvSnap x.x.x.exe` (single portable executable) or `EnvSnap-x.x.x-win.zip` (extract and run) from [Releases](../../releases).

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Type check
npm run lint

# Build for production
npm run build

# Package installer + portable + zip
npm run package
```

Output goes to `out/`.

## Tech Stack

- Electron 35
- React 19
- TypeScript 5
- Zustand (state management)
- electron-vite (build tooling)
- electron-builder (packaging)

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── env/        # PowerShell integration (read/write env vars)
│   ├── storage/    # JSON file persistence (presets, backups, settings)
│   ├── activation.ts
│   ├── ipc.ts      # IPC handlers
│   ├── tray.ts     # System tray
│   └── window.ts
├── preload/        # Context bridge (renderer ↔ main)
├── renderer/       # React UI
│   ├── components/
│   ├── pages/
│   ├── store/      # Zustand slices
│   └── styles/
└── shared/         # Types and constants shared across processes
```

## How it works

1. Presets are stored locally as JSON in `%APPDATA%/EnvSnap/`
2. Activation writes variables via `[Environment]::SetEnvironmentVariable(..., 'User')` in PowerShell
3. After writing, the app broadcasts `WM_SETTINGCHANGE` so other apps pick up the change
4. A pre-activation snapshot is saved automatically — deactivating or rolling back restores previous values

## Notes

- Changes to environment variables require restarting any already-open terminals or apps to take effect
- The app only modifies **User** environment variables, never System
- Preset values are stored in plain text locally — treat export files as sensitive if they contain secrets

## License

MIT
