#!/usr/bin/env bash
set -e

TARGET_DIR="${1:-$HOME/turboc3}"

echo "======================================================="
echo "   Setting up Turbo C++ 3.0 Environment               "
echo "   Target Directory: $TARGET_DIR"
echo "======================================================="

# Check if already installed
if [ -f "$TARGET_DIR/BIN/TCC.EXE" ] || [ -f "$TARGET_DIR/bin/tcc.exe" ]; then
    echo "✔ Turbo C++ 3.0 is already present at $TARGET_DIR"
    exit 0
fi

mkdir -p "$TARGET_DIR"
TMP_DIR=$(mktemp -d)

echo "Downloading Turbo C++ 3.0 runtime files..."
git clone --depth 1 https://github.com/AlbatrossC/graphics-h-compiler.git "$TMP_DIR/tc-repo"

if [ -d "$TMP_DIR/tc-repo/TURBOC3" ]; then
    cp -r "$TMP_DIR/tc-repo/TURBOC3"/* "$TARGET_DIR/"
else
    echo "Error: TURBOC3 directory not found in repository."
    rm -rf "$TMP_DIR"
    exit 1
fi

rm -rf "$TMP_DIR"

# Verify critical files
if [ -f "$TARGET_DIR/BIN/TCC.EXE" ] && [ -d "$TARGET_DIR/INCLUDE" ] && [ -d "$TARGET_DIR/LIB" ]; then
    echo "✔ Turbo C++ 3.0 successfully installed at: $TARGET_DIR"
    echo "  - Compiler: $TARGET_DIR/BIN/TCC.EXE"
    echo "  - IDE:      $TARGET_DIR/BIN/TC.EXE"
    echo "  - Headers:  $TARGET_DIR/INCLUDE"
    echo "  - Libs:     $TARGET_DIR/LIB"
    echo "  - BGI:      $TARGET_DIR/BGI"
else
    echo "Warning: Files copied, but one or more standard folders (BIN/INCLUDE/LIB) were not verified."
fi

chmod -R u+rwX "$TARGET_DIR"
echo "======================================================="
