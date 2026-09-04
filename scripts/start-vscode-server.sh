#!/usr/bin/env bash
set -e

WORKSPACE_DIR="${1:-$(pwd)/examples}"
PORT="${PORT:-8080}"
VNC_PORT="${VNC_PORT:-6080}"

echo "======================================================="
echo "   TurboVs Cloud VS Code Server Launcher              "
echo "   Workspace: $WORKSPACE_DIR"
echo "======================================================="

# 1. Start Virtual X11 Display
echo "[1/6] Starting Virtual Display (Xvfb :0)..."
if ! pgrep -x "Xvfb" >/dev/null; then
    Xvfb :0 -screen 0 1280x800x24 &
    sleep 1
fi
export DISPLAY=:0

# 2. Start Window Manager & VNC Server
echo "[2/6] Starting Window Manager & VNC Screen (Port $VNC_PORT)..."
if command -v openbox >/dev/null 2>&1; then
    openbox &
elif command -v fluxbox >/dev/null 2>&1; then
    fluxbox &
fi

if command -v x11vnc >/dev/null 2>&1; then
    x11vnc -display :0 -forever -nopw -shared -rfbport 5900 -bg -quiet 2>/dev/null || true
fi

NOVNC_DIR=""
for dir in /usr/share/novnc /usr/share/novnc/utils /opt/novnc; do
    if [ -d "$dir" ] && [ -f "$dir/vnc.html" -o -f "$dir/index.html" ]; then
        NOVNC_DIR="$dir"
        break
    fi
done

if command -v websockify >/dev/null 2>&1 && [ -n "$NOVNC_DIR" ]; then
    websockify --web "$NOVNC_DIR" "$VNC_PORT" localhost:5900 >/dev/null 2>&1 &
fi

# 3. Configure VS Code / code-server User Settings
echo "[3/6] Configuring VS Code Server settings..."
USER_SETTINGS_DIR="$HOME/.local/share/code-server/User"
mkdir -p "$USER_SETTINGS_DIR"
cat << JSON_SETTINGS > "$USER_SETTINGS_DIR/settings.json"
{
    "turbovs.dosboxPath": "/usr/bin/dosbox",
    "turbovs.compilerPath": "$HOME/turboc3",
    "turbovs.autoClearTerminal": true,
    "turbovs.closeOnExit": true,
    "workbench.colorTheme": "Default Dark Modern",
    "workbench.startupEditor": "readme",
    "terminal.integrated.defaultProfile.linux": "bash",
    "window.menuBarVisibility": "classic",
    "security.workspace.trust.enabled": false
}
JSON_SETTINGS

mkdir -p "$HOME/.config/code-server"
cat << CONFIG_YAML > "$HOME/.config/code-server/config.yaml"
bind-addr: 0.0.0.0:$PORT
auth: none
cert: false
disable-telemetry: true
CONFIG_YAML

# 4. Install TurboVs extension into code-server
echo "[4/6] Installing TurboVs extension..."
VSIX_FILE=$(find "$(pwd)" -maxdepth 2 -name "turbovs-*.vsix" -print -quit)
if [ -n "$VSIX_FILE" ] && command -v code-server >/dev/null 2>&1; then
    code-server --install-extension "$VSIX_FILE" --force || true
fi

# 5. Start Cloudflare Tunnels (Zero-configuration public HTTPS access)
echo "[5/6] Establishing Secure Public Tunnels..."
rm -f /tmp/code_tunnel.log /tmp/vnc_tunnel.log

if command -v cloudflared >/dev/null 2>&1; then
    cloudflared tunnel --url "http://127.0.0.1:$PORT" > /tmp/code_tunnel.log 2>&1 &
    cloudflared tunnel --url "http://127.0.0.1:$VNC_PORT" > /tmp/vnc_tunnel.log 2>&1 &
fi

# Wait for tunnel URLs
CODE_URL=""
VNC_URL=""

for i in {1..30}; do
    if [ -f /tmp/code_tunnel.log ] && grep -q -E "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/code_tunnel.log; then
        CODE_URL=$(grep -o -E "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/code_tunnel.log | head -n 1)
        break
    fi
    sleep 1
done

if [ -f /tmp/vnc_tunnel.log ]; then
    VNC_URL=$(grep -o -E "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/vnc_tunnel.log | head -n 1 || true)
fi

echo ""
echo "======================================================="
echo "   TURBOVS CLOUD VS CODE SERVER IS READY!             "
echo "======================================================="
echo ""
if [ -n "$CODE_URL" ]; then
    echo "  🌐 VS Code Web Editor:  $CODE_URL"
else
    echo "  🌐 Local VS Code URL:   http://localhost:$PORT"
fi

if [ -n "$VNC_URL" ]; then
    echo "  🖥️  DOSBox CRT Display:  $VNC_URL/vnc.html?autoconnect=true"
fi
echo ""
echo "  📁 Workspace Folder:    $WORKSPACE_DIR"
echo "  ⚡ Turbo C++ Compiler:  $HOME/turboc3"
echo "  🕹️  DOSBox Emulator:     /usr/bin/dosbox"
echo "======================================================="
echo ""

# Write to GitHub Actions Step Summary if in CI
if [ -n "$GITHUB_STEP_SUMMARY" ]; then
    cat << MD_SUMMARY >> "$GITHUB_STEP_SUMMARY"
## 🚀 TurboVs Cloud VS Code Server is Online!

You can test and run Turbo C++ programs directly in your browser:

### 🔗 Access Links:
- **[👉 Open VS Code Web Editor]($CODE_URL)** — Full Visual Studio Code with the TurboVs extension pre-installed!
$([ -n "$VNC_URL" ] && echo "- **[🖥️ Open DOSBox GUI Display]($VNC_URL/vnc.html?autoconnect=true)** — Live view of DOSBox CRT screen & graphics.")

### 📝 Pre-Loaded Examples:
- \`hello.cpp\` — Classic Turbo C++ with \`<iostream.h>\`, \`<conio.h>\`, \`clrscr()\`, \`cin >>\`, \`getch()\`
- \`calculator.cpp\` — Retro interactive calculator
- \`fibonacci.c\` — Classic C series generator
- \`matrix_calc.cpp\` — 2D array matrix operations
- \`student_db.cpp\` — OOP with classes and student report cards
- \`graphics_demo.cpp\` — VGA BGI graphics with \`<graphics.h>\`
- \`text_animation.cpp\` — Classic DOS text animation with \`gotoxy()\` and colors

### ⌨️ How to Run:
1. Click on any file (e.g. \`hello.cpp\`).
2. Press **\`Ctrl+F9\`** or click the **Play** button in the top right.
3. The TurboVs integrated terminal will compile with genuine \`TCC.EXE\` and run!
MD_SUMMARY
fi

# 6. Launch code-server in foreground
echo "[6/6] Launching code-server..."
exec code-server --bind-addr "0.0.0.0:$PORT" --auth none --disable-telemetry "$WORKSPACE_DIR"
