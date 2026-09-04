#!/usr/bin/env bash
set -e

echo "======================================================="
echo "   TurboVs - Complete All-in-One Global Installer (Unix)"
echo "======================================================="
echo ""

# 1. Locate editor command
echo "[1/4] Checking Visual Studio Code..."
CODE_BIN=""
for cmd in code codium cursor; do
    if command -v "$cmd" >/dev/null 2>&1; then
        CODE_BIN="$cmd"
        break
    fi
done

if [ -z "$CODE_BIN" ]; then
    echo "[ERROR] Visual Studio Code (or Codium/Cursor) CLI is not found in PATH."
    echo "Please ensure VS Code is installed and 'code' is available in your PATH."
    exit 1
fi
echo "    - Found editor command: $CODE_BIN"
echo ""

# 2. Locate VSIX package
echo "[2/4] Installing TurboVs VS Code extension..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX_FILE="$(find "$SCRIPT_DIR" -maxdepth 1 -name "turbovs-*.vsix" -print -quit)"

if [ -z "$VSIX_FILE" ]; then
    echo "    - Local VSIX not found. Downloading latest TurboVs from GitHub..."
    DOWNLOAD_URL="https://github.com/beyondbday69/turbovs/releases/latest/download/turbovs.vsix"
    VSIX_FILE="$SCRIPT_DIR/turbovs.vsix"
    curl -fsSL "$DOWNLOAD_URL" -o "$VSIX_FILE" 2>/dev/null || wget -qO "$VSIX_FILE" "$DOWNLOAD_URL" 2>/dev/null || {
        echo "    - Trying versioned asset fallback..."
        curl -fsSL "https://github.com/beyondbday69/turbovs/releases/latest/download/turbovs-1.1.0.vsix" -o "$VSIX_FILE"
    }
fi

"$CODE_BIN" --install-extension "$VSIX_FILE" --force
echo "    - TurboVs extension installed successfully!"
echo ""

# 3. Check & Install DOSBox
echo "[3/4] Checking DOSBox dependency..."
if command -v dosbox >/dev/null 2>&1 || command -v dosbox-x >/dev/null 2>&1; then
    echo "    - DOSBox is already installed!"
else
    echo "    - DOSBox not found. Attempting to install..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y dosbox
    elif command -v brew >/dev/null 2>&1; then
        brew install dosbox-x
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y dosbox
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm dosbox
    else
        echo "    - Please install DOSBox using your package manager (e.g. apt install dosbox, brew install dosbox-x)."
    fi
fi
echo ""

# 4. Check Turbo C++ directory
echo "[4/4] Checking Turbo C++ directory (~/turboc3)..."
TC_DIR="$HOME/turboc3"
if [ -d "$TC_DIR/BIN" ] || [ -d "$TC_DIR/bin" ]; then
    echo "    - Turbo C++ directory found at $TC_DIR!"
else
    echo "    - Turbo C++ folder not found at $TC_DIR."
    echo "    - Automatically downloading and setting up Turbo C++ 3.0 files..."
    if [ -f "$SCRIPT_DIR/scripts/setup-turboc3.sh" ]; then
        bash "$SCRIPT_DIR/scripts/setup-turboc3.sh" "$TC_DIR" || true
    else
        curl -fsSL https://raw.githubusercontent.com/beyondbday69/turbovs/main/scripts/setup-turboc3.sh | bash -s "$TC_DIR" || true
    fi
fi

echo ""
echo "======================================================="
echo "                INSTALLATION SUMMARY                   "
echo "======================================================="
echo "1. TurboVs Extension:   INSTALLED GLOBALLY"
echo "2. DOSBox Dependency:   CHECKED"
echo "3. Turbo C++:           Directory target: $TC_DIR"
echo ""
echo "Press Ctrl+F9 (or Cmd+F9 on macOS) in VS Code to run!"
echo "======================================================="
