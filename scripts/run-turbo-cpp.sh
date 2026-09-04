#!/usr/bin/env bash
set -e

SOURCE_FILE="${1:-examples/hello.cpp}"
INPUT_ARG="${2:-}"

if [ ! -f "$SOURCE_FILE" ]; then
    echo "Error: Source file not found: $SOURCE_FILE"
    exit 1
fi

SOURCE_ABS=$(cd "$(dirname "$SOURCE_FILE")" && pwd)/$(basename "$SOURCE_FILE")
WORKSPACE_DIR=$(dirname "$SOURCE_ABS")
FILE_NAME=$(basename "$SOURCE_ABS")
BASE_NAME="${FILE_NAME%.*}"
EXT_NAME="${FILE_NAME##*.}"
EXT_UPPER=$(echo "$EXT_NAME" | tr '[:lower:]' '[:upper:]')

IS_TEMP_ALIAS=0
if [ ${#BASE_NAME} -le 8 ] && [[ "$BASE_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
    DOS_FILE="$(echo "$BASE_NAME" | tr '[:lower:]' '[:upper:]').$EXT_UPPER"
    DOS_EXE="$(echo "$BASE_NAME" | tr '[:lower:]' '[:upper:]').EXE"
else
    IS_TEMP_ALIAS=1
    DOS_FILE="TC_RUN.$EXT_UPPER"
    DOS_EXE="TC_RUN.EXE"
    cp "$SOURCE_ABS" "$WORKSPACE_DIR/$DOS_FILE"
fi

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
BUILD_LOG="$WORKSPACE_DIR/TC_BUILD.LOG"
IN_TXT="$WORKSPACE_DIR/TC_IN.TXT"

rm -f "$OUT_LOG" "$BUILD_LOG" "$WORKSPACE_DIR/$DOS_EXE" "$TC_DIR/BIN/$DOS_EXE"

# Handle input (stdin)
if [ -n "$INPUT_ARG" ]; then
    if [ -f "$INPUT_ARG" ]; then
        cp "$INPUT_ARG" "$IN_TXT"
    else
        printf "%b\r\n" "$INPUT_ARG" > "$IN_TXT"
    fi
elif [ ! -t 0 ]; then
    # Read from piped stdin if available
    cat > "$IN_TXT"
elif [ -f "$WORKSPACE_DIR/input.txt" ]; then
    cp "$WORKSPACE_DIR/input.txt" "$IN_TXT"
elif [ ! -f "$IN_TXT" ]; then
    printf "\r\n" > "$IN_TXT"
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
TCC -IC:\INCLUDE -LC:\LIB -IC:\TC\INCLUDE -LC:\TC\LIB d:\\$DOS_FILE > d:\TC_BUILD.LOG
if errorlevel 1 goto error
$DOS_EXE > d:\TC_OUT.LOG < d:\TC_IN.TXT
goto done
:error
echo [TurboVs] Compilation Failed! > d:\TC_OUT.LOG
type d:\TC_BUILD.LOG >> d:\TC_OUT.LOG
:done
exit
CONF

# Run under xvfb-run if available, with -exit flag and all noise redirected to /dev/null
if command -v xvfb-run >/dev/null 2>&1; then
    SDL_AUDIODRIVER=dummy ALSA_CARD=none xvfb-run -a "$DOSBOX_BIN" -conf "$CONF_FILE" -exit >/dev/null 2>&1 || true
else
    SDL_AUDIODRIVER=dummy ALSA_CARD=none "$DOSBOX_BIN" -conf "$CONF_FILE" -exit >/dev/null 2>&1 || true
fi

# Print pure output to terminal
if [ -f "$OUT_LOG" ]; then
    cat "$OUT_LOG"
    rm -f "$OUT_LOG"
else
    echo "[TurboVs] No output log generated."
fi

# Cleanup
rm -f "$CONF_FILE" "$BUILD_LOG" "$TC_DIR/BIN/$DOS_EXE" "$WORKSPACE_DIR/$DOS_EXE" 2>/dev/null || true
if [ $IS_TEMP_ALIAS -eq 1 ]; then
    rm -f "$WORKSPACE_DIR/$DOS_FILE" 2>/dev/null || true
fi
