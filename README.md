# TurboVs — Turbo C++ for Visual Studio Code

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-orange.svg)](#)

Write and run legacy **Turbo C++ 3.0** and **Borland C++** programs directly from Visual Studio Code using **DOSBox** or **DOSBox-X**!

---

## 🚀 Overview

Many schools, universities, competitive programming curriculums, and retro developers still write code relying on legacy Turbo C++ libraries and conventions. Modern compilers (GCC, Clang, MSVC) reject headers like `<iostream.h>`, `<conio.h>`, or `void main()`.

**TurboVs** bridges the modern VS Code editor with genuine Turbo C++ compilation inside DOSBox:
- **No syntax translation or modern shims** — Your code is compiled by genuine Borland `TCC.EXE`.
- **Full interactive keyboard & console support** — `getch()`, `clrscr()`, `cin >>`, `scanf()`, and `getche()` work smoothly.
- **BGI Graphics mode support** — Run programs using `<graphics.h>` with authentic 640x480 VGA graphics.
- **Modern VS Code developer experience** — One-click Run button, editor line error squiggles, command palette, and integrated terminal feedback.

---

## ✨ Key Features

- **🎮 Authentic Turbo C++ Compatibility**:
  - Full support for `#include <iostream.h>`, `#include <conio.h>`, `#include <graphics.h>`, `#include <dos.h>`.
  - Supports `void main()`, `clrscr()`, `getch()`, `textcolor()`, `gotoxy()`, and all Borland primitives.
- **▶ One-Click Execution**:
  - **Run Button**: Dedicated Play icon in the editor title tab for any `.cpp` or `.c` file.
  - **Context Menu**: Right-click any C/C++ editor tab or file in the Explorer and choose **"Run with TurboVs"**.
  - **Keyboard Shortcut**: Press `Ctrl+F9` (or `Cmd+F9` on macOS) — the classic Turbo C++ shortcut!
- **⏹ Runaway Program Protection**:
  - Click the **Stop** button (`Ctrl+Shift+F9`) in the editor tab to terminate stuck loops or hanging DOSBox sessions immediately.
- **📟 Integrated VS Code Terminal**:
  - Launches a dedicated `"TurboVs"` terminal.
  - Auto-clears before runs (configurable) and outputs compilation status.
- **🔍 Smart Compiler Diagnostics**:
  - Automatically parses Borland compiler output from `TCC.EXE`.
  - Underlines syntax errors with red squiggles on the exact line in your VS Code editor.
- **📁 Transparent DOS 8.3 Handling**:
  - Safely handles modern filenames, long paths, and spaces without DOSBox filename truncation errors.
- **🖥️ Dual Mode (CLI Runner & Full IDE)**:
  - Run fast headless compilation directly to execution.
  - Or run **"TurboVs: Open in Turbo C++ IDE"** to open the classic blue Borland IDE with your code preloaded!
- **🌐 Cross-Platform**:
  - Runs on **Windows**, **Linux**, and **macOS**.

---

## ⌨️ Shortcuts & Commands

| Command | Shortcut | Description |
| :--- | :--- | :--- |
| `TurboVs: Run Program` | `Ctrl+F9` (`Cmd+F9`) | Saves, compiles, and runs active file |
| `TurboVs: Stop Program` | `Ctrl+Shift+F9` | Kills running DOSBox session |
| `TurboVs: Open in Turbo C++ IDE` | Command Palette | Launches the classic blue Borland IDE |
| `TurboVs: Check Environment Status` | Command Palette | Diagnoses DOSBox and compiler paths |
| `TurboVs: Configure Settings` | Command Palette | Quick configuration wizard |

---

## ⚙️ Configuration Settings

Open VS Code Settings (`Ctrl+,` or `Cmd+,`) and search for `turbovs`:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `turbovs.dosboxPath` | `string` | `""` (auto-detect) | Path to `dosbox` or `dosbox-x` executable. |
| `turbovs.compilerPath` | `string` | `""` (auto-detect) | Path to Turbo C++ installation directory (containing `BIN`, `INCLUDE`, `LIB`). |
| `turbovs.workspacePath` | `string` | `""` (auto) | Custom host folder mounted as drive `D:`. Defaults to current file's folder. |
| `turbovs.autoClearTerminal` | `boolean` | `true` | Clears the "TurboVs" terminal before compiling. |
| `turbovs.closeOnExit` | `boolean` | `true` | Exits DOSBox after the user presses a key when the program finishes. |
| `turbovs.windowResolution` | `string` | `"1024x768"` | DOSBox window resolution (`"original"`, `"800x600"`, `"1024x768"`, `"fullscreen"`). |
| `turbovs.memoryModel` | `string` | `"default"` | Memory model passed to `TCC` (`default`, `-ms`, `-mm`, `-mc`, `-ml`, `-mh`). |
| `turbovs.dosboxArgs` | `string` | `""` | Additional command-line flags to pass to DOSBox. |

---

## 📦 Setup & Prerequisites

You need two components:
1. **DOSBox** (or **DOSBox-X**)
2. **Turbo C++ 3.0** (Borland C++ directory containing `BIN`, `INCLUDE`, and `LIB`)

### 🪟 Windows Setup
1. **Install DOSBox**:
   - Download DOSBox from [dosbox.com](https://www.dosbox.com/download.php?main=1) or install via `winget install DOSBox.DOSBox`.
2. **Extract Turbo C++**:
   - Place Turbo C++ in `C:\TURBOC3` or `C:\TC`.
   - Ensure it contains `BIN\TCC.EXE`, `INCLUDE`, and `LIB`.
3. TurboVs auto-detects `C:\Program Files (x86)\DOSBox-0.74-3\DOSBox.exe` and `C:\TURBOC3`.

### 🐧 Linux Setup (Ubuntu / Debian / Fedora / Arch)
1. **Install DOSBox**:
   ```bash
   sudo apt-get update && sudo apt-get install -y dosbox
   # or Fedora: sudo dnf install dosbox
   # or Arch: sudo pacman -S dosbox
   ```
2. **Place Turbo C++**:
   - Extract Turbo C++ to `~/turboc3` (or `/opt/turboc3`).
   - Structure should look like:
     ```
     ~/turboc3/
       ├── BIN/
       │   ├── TCC.EXE
       │   └── TC.EXE
       ├── INCLUDE/
       │   ├── iostream.h
       │   └── conio.h
       └── LIB/
     ```
3. Set the compiler path in VS Code (`Ctrl+,`):
   ```json
   "turbovs.compilerPath": "~/turboc3"
   ```

### 🍎 macOS Setup
1. **Install DOSBox**:
   ```bash
   brew install dosbox-x
   # or brew install --cask dosbox
   ```
2. **Place Turbo C++**:
   - Extract Turbo C++ to `~/turboc3`.
3. In VS Code settings (`Cmd+,`):
   ```json
   "turbovs.dosboxPath": "/opt/homebrew/bin/dosbox-x",
   "turbovs.compilerPath": "~/turboc3"
   ```

---

## 📝 Example Turbo C++ Programs

### 1. Interactive Console with `conio.h` and `iostream.h`
```cpp
#include <iostream.h>
#include <conio.h>

void main() {
    clrscr();
    
    char name[50];
    int age;
    
    cout << "========================================" << endl;
    cout << "        Welcome to TurboVs!             " << endl;
    cout << "========================================" << endl;
    
    cout << "Enter your name: ";
    cin >> name;
    
    cout << "Enter your age: ";
    cin >> age;
    
    cout << "\nHello, " << name << "! You are " << age << " years old." << endl;
    cout << "\nPress any key to finish...";
    
    getch();
}
```

### 2. Authentic BGI Graphics (`graphics.h`)
```cpp
#include <graphics.h>
#include <conio.h>
#include <iostream.h>

void main() {
    int gd = DETECT, gm;
    // C:\BGI or C:\TC\BGI inside DOSBox
    initgraph(&gd, &gm, "C:\\BGI");
    
    setcolor(YELLOW);
    circle(320, 240, 100);
    
    setcolor(CYAN);
    line(100, 240, 540, 240);
    line(320, 100, 320, 380);
    
    outtextxy(220, 360, "Turbo C++ BGI Graphics in TurboVs!");
    
    getch();
    closegraph();
}
```

---

## 🛠️ Diagnostics & Troubleshooting

1. **"DOSBox executable not found"**:
   - Make sure DOSBox is installed.
   - Run `TurboVs: Configure Settings` and select your `dosbox.exe` or `dosbox` path.
2. **"Turbo C++ directory not found"**:
   - Ensure the directory contains `BIN` (with `TCC.EXE`), `INCLUDE`, and `LIB`.
   - If your folder is named `turboc3`, set `turbovs.compilerPath` to that folder.
3. **Run `TurboVs: Check Environment Status`**:
   - Run this from the Command Palette (`Ctrl+Shift+P`) to see an exhaustive report of your setup.

---

## 📄 License

This extension is licensed under the [MIT License](LICENSE).
