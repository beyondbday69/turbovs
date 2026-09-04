# Change Log

All notable changes to the "TurboVs" extension will be documented in this file.

## [1.2.0] - 2026-09-04

### Added
- **Automatic VS Code Native Single Input Prompt**: When a program requires inputs (e.g. `cin >>`, `scanf`), TurboVs automatically opens the native VS Code input UI (`turbovs.autoPromptForInput`) with smart contextual prompt detection.
- **Official VS Code Webview UI Toolkit & Codicons**: Replaced generic web components with official `@vscode/webview-ui-toolkit` (`<vscode-text-field>`, `<vscode-button>`, `<vscode-tag>`) and `@vscode/codicons` for seamless theme integration.
- **Soft Pastel Minimalist Icon**: Updated extension branding with an elegant, modern pastel aesthetic.
- **Cloud VS Code Server Workflow**: Run Turbo C++ in your browser on GitHub Actions with multi-provider tunnels (Pinggy, Localhost.run, Cloudflare).
- **Automated GitHub Release & Publish Workflow**: Added GitHub Actions workflow to build, package `.vsix`, create GitHub Releases with changelogs, and publish to Visual Studio Marketplace & Open VSX.

## [1.1.0] - 2026-09-04

### Added
- **Pure Script Output Only**: Terminal displays exclusively the compiled program's `stdout` with zero bash command echoes, shell prompts, or DOSBox startup noise via a dedicated VS Code `Pseudoterminal`.
- **Automatic Script Input Detection**: Static analysis engine (`detectScriptInputs`) analyzes C/C++ source code to detect all `cin >>`, `scanf`, `cin.getline`, `gets`, and `getch` calls and automatically associates preceding `cout` and `printf` prompt labels.
- **Dedicated Separate Input Panel (`turbovs.openInputPanel`)**: Interactive UI with individual input cards for each detected variable, real-time keystroke synchronization to `TC_IN.TXT`, dynamic add/remove fields, and a live piped sequence preview.
- **Check Script Inputs Command (`turbovs.checkScriptInputs`)**: Command to inspect active script input requirements with actionable run/configure prompts.
- **New High-Res Extension Logo**: Redesigned 256×256 app logo featuring a glowing retro-futuristic CRT monitor with electric cyan/blue lighting and C++ emblem.

## [1.0.0] - 2026-09-04

### Added
- **TurboVs Initial Release**: Complete VS Code extension for running legacy Turbo C++ 3.0 / Borland C++ code natively inside DOSBox / DOSBox-X.
- **Legacy C++ Compatibility**: Full support for classic headers and functions:
  - `<iostream.h>`, `<conio.h>`, `<graphics.h>`, `<dos.h>`, `<process.h>`
  - `void main()`, `clrscr()`, `getch()`, `getche()`, `gotoyx()`, `textbackground()`, `textcolor()`
  - Authentic stream I/O (`cout <<`, `cin >>`) and C I/O (`printf`, `scanf`)
- **VS Code Integration**:
  - Run/Play button in editor title bar when viewing `.cpp` or `.c` files.
  - Stop button in editor title bar to terminate runaway programs.
  - Right-click context menu: `Run with TurboVs` and `Open in Turbo C++ IDE`.
  - Command palette shortcuts: `TurboVs: Run Program` (`Ctrl+F9` / `Cmd+F9`).
- **Terminal Integration**:
  - Dedicated integrated terminal named `"TurboVs"`.
  - Automatic terminal clearing option before each build.
  - Clean build logging and runtime status banners.
- **Interactive DOSBox Support**:
  - Full keyboard input preservation for `cin`, `scanf`, `getch()`.
  - Support for graphics mode (`graphics.h`, BGI drivers).
- **Intelligent Error Handling & Diagnostics**:
  - Automatically captures compiler errors and warnings from `TCC.EXE`.
  - Maps compiler messages directly to line numbers with squiggles in the VS Code editor.
  - Actionable error prompts if DOSBox or Turbo C++ paths are missing or incorrect.
- **Smart DOS 8.3 Filename Compatibility**:
  - Handles modern long filenames and paths with spaces safely by creating seamless DOS 8.3 aliases (`TC_RUN.CPP`).
  - Automatically translates compiler error line numbers back to the original source file.
- **Cross-Platform Support**:
  - Windows (DOSBox 0.74, DOSBox-X)
  - Linux (Native packages, Snap, Flatpak)
  - macOS (Homebrew, DMG installations)
- **Status Bar Indicator & Quick Menu**:
  - Visual indicator showing environment status (`TurboVs: Ready`, `Running...`, or `Setup Needed`).
  - Interactive QuickPick menu for one-click configuration, testing, and IDE launching.
