#!/usr/bin/env bash
set -e

SOURCE_FILE="${1:-examples/hello.cpp}"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file not found: $SOURCE_FILE"
    exit 1
fi

SOURCE_ABS=$(cd "$(dirname "$SOURCE_FILE")" && pwd)/$(basename "$SOURCE_FILE")
WORKSPACE_DIR=$(dirname "$SOURCE_ABS")
FILE_NAME=$(basename "$SOURCE_ABS")
BASE_NAME="${FILE_NAME%.*}"
BASE_83=$(echo "$BASE_NAME" | tr '[:lower:]' '[:upper:]' | cut -c1-8)
EXT_83=$(echo "${FILE_NAME##*.}" | tr '[:lower:]' '[:upper:]' | cut -c1-3)
DOS_FILE="${BASE_83}.${EXT_83}"
DOS_EXE="${BASE_83}.EXE"

# Locate compiler
TC_DIR=""
for cand in "/home/runner/turboc3" "$HOME/turboc3" "/root/turboc3" "/opt/turboc3"; do
    if [ -f "$cand/BIN/TCC.EXE" ]; then
        TC_DIR="$cand"
        break
    fi
done

if [ -z "$TC_DIR" ]; then
    echo "Error: Turbo C++ not found. Please run scripts/setup-turboc3.sh first."
    exit 1
fi

# Locate DOSBox
DOSBOX_BIN=$(command -v dosbox || command -v dosbox-x || true)
if [ -z "$DOSBOX_BIN" ]; then
    echo "Error: DOSBox not found in PATH."
    exit 1
fi

# Temporary files
CONF_FILE=$(mktemp /tmp/dosbox_run_XXXXXX.conf)
OUT_LOG="$WORKSPACE_DIR/TC_OUT.LOG"
IN_TXT="$WORKSPACE_DIR/TC_IN.TXT"

rm -f "$OUT_LOG" "$WORKSPACE_DIR/$DOS_EXE" "$TC_DIR/BIN/$DOS_EXE"

if [ ! -f "$IN_TXT" ]; then
    printf "Alice\r\n\r\n" > "$IN_TXT"
fi

cat << CONF > "$CONF_FILE"
[sdl]
fullscreen=false
windowresolution=1024x768
output=surface

[mixer]
nosound=true

[midi]
mpu401=none
mididevice=none

[sblaster]
sbtype=none

[gus]
gus=false

[speaker]
pcspeaker=false
tandy=off
disney=false

[cpu]
core=auto
cycles=max

[autoexec]
@echo off
mount c "$TC_DIR"
mount d "$WORKSPACE_DIR"
c:
cd BIN
TCC -IC:\INCLUDE -LC:\LIB -IC:\TC\INCLUDE -LC:\TC\LIB d:\\$DOS_FILE > d:\TC_OUT.LOG
if errorlevel 1 goto error
$DOS_EXE >> d:\TC_OUT.LOG < d:\TC_IN.TXT
goto done
:error
echo. >> d:\TC_OUT.LOG
echo [TurboVs] Compilation failed! >> d:\TC_OUT.LOG
:done
exit
CONF

echo "======================================================="
echo "   TurboVs Headless Runner"
echo "   Source: $SOURCE_FILE -> $DOS_FILE"
echo "   Compiler: $TC_DIR/BIN/TCC.EXE"
echo "======================================================="

# Run under xvfb-run if available, with -exit flag
if command -v xvfb-run >/dev/null 2>&1; then
    SDL_AUDIODRIVER=dummy ALSA_CARD=none xvfb-run -a "$DOSBOX_BIN" -conf "$CONF_FILE" -exit 2>/dev/null || true
else
    SDL_AUDIODRIVER=dummy ALSA_CARD=none "$DOSBOX_BIN" -conf "$CONF_FILE" -exit 2>/dev/null || true
fi

# Print output to terminal
if [ -f "$OUT_LOG" ]; then
    cat "$OUT_LOG"
    rm -f "$OUT_LOG"
else
    echo "[TurboVs] No output log generated."
fi

# Cleanup
rm -f "$CONF_FILE" "$IN_TXT" "$TC_DIR/BIN/$DOS_EXE" 2>/dev/null || true
echo ""
echo "======================================================="
