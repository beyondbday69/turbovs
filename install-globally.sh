#!/usr/bin/env bash
set -e

echo "======================================================="
echo "       TurboVs - Global VS Code Installer (Unix)       "
echo "======================================================="
echo ""

# 1. Locate editor command
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
    echo "In VS Code: Press Cmd+Shift+P (or Ctrl+Shift+P) and run 'Shell Command: Install code command in PATH'."
    exit 1
fi

echo "[1/3] Found editor command: $CODE_BIN"
echo ""

# 2. Locate VSIX package
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX_FILE="$(find "$SCRIPT_DIR" -maxdepth 1 -name "turbovs-*.vsix" -print -quit)"

if [ -z "$VSIX_FILE" ]; then
    echo "[2/3] Local VSIX not found. Attempting download from GitHub..."
    DOWNLOAD_URL="https://github.com/beyondbday69/turbovs/releases/latest/download/turbovs-1.0.0.vsix"
    VSIX_FILE="$SCRIPT_DIR/turbovs-1.0.0.vsix"
    curl -fsSL "$DOWNLOAD_URL" -o "$VSIX_FILE" || wget -qO "$VSIX_FILE" "$DOWNLOAD_URL"
fi

if [ ! -f "$VSIX_FILE" ]; then
    echo "[ERROR] Could not find or download turbovs-1.0.0.vsix."
    exit 1
fi

echo "[2/3] Installing package: $VSIX_FILE"
echo ""

"$CODE_BIN" --install-extension "$VSIX_FILE" --force

echo ""
echo "======================================================="
echo "  [3/3] SUCCESS: TurboVs is now installed globally!    "
echo "======================================================="
echo ""
echo "Quick Start:"
echo "1. Open VS Code."
echo "2. Open any .cpp or .c file."
echo "3. Press Ctrl+F9 (or Cmd+F9 on macOS) to run in Turbo C++!"
echo ""
