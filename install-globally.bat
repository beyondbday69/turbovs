@echo off
setlocal enabledelayedexpansion
title TurboVs - Global Extension Installer for VS Code

echo =======================================================
echo         TurboVs - Global VS Code Installer
echo =======================================================
echo.

:: 1. Locate VS Code or compatible editor
set "CODE_CMD="

where code >nul 2>&1
if %errorlevel% equ 0 (
    set "CODE_CMD=code"
    goto :find_vsix
)

if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
    goto :find_vsix
)

if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
    goto :find_vsix
)

if exist "%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd"
    goto :find_vsix
)

:: Check for VSCodium
where codium >nul 2>&1
if %errorlevel% equ 0 (
    set "CODE_CMD=codium"
    goto :find_vsix
)
if exist "%LOCALAPPDATA%\Programs\VSCodium\bin\codium.cmd" (
    set "CODE_CMD=%LOCALAPPDATA%\Programs\VSCodium\bin\codium.cmd"
    goto :find_vsix
)

:: Check for Cursor
where cursor >nul 2>&1
if %errorlevel% equ 0 (
    set "CODE_CMD=cursor"
    goto :find_vsix
)
if exist "%LOCALAPPDATA%\Programs\cursor\bin\cursor.cmd" (
    set "CODE_CMD=%LOCALAPPDATA%\Programs\cursor\bin\cursor.cmd"
    goto :find_vsix
)

echo [ERROR] Visual Studio Code was not found on your system!
echo Please ensure Visual Studio Code is installed and added to PATH.
echo Download VS Code from: https://code.visualstudio.com/
echo.
pause
exit /b 1

:find_vsix
echo [1/3] Found editor command: "!CODE_CMD!"
echo.

:: 2. Locate .vsix file in script directory or subdirectories
set "SCRIPT_DIR=%~dp0"
set "VSIX_FILE="

for %%f in ("%SCRIPT_DIR%turbovs-*.vsix") do (
    set "VSIX_FILE=%%f"
    goto :install_now
)

for %%f in ("%SCRIPT_DIR%*.vsix") do (
    set "VSIX_FILE=%%f"
    goto :install_now
)

:: If not found locally, attempt to download latest release from GitHub
echo [2/3] Local VSIX not found. Attempting to download from GitHub...
set "DOWNLOAD_URL=https://github.com/beyondbday69/turbovs/releases/latest/download/turbovs-1.0.0.vsix"
set "VSIX_FILE=%SCRIPT_DIR%turbovs-1.0.0.vsix"

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%DOWNLOAD_URL%', '%VSIX_FILE%')" >nul 2>&1
if exist "%VSIX_FILE%" (
    echo [2/3] Downloaded turbovs-1.0.0.vsix successfully.
    goto :install_now
)

echo [ERROR] Could not locate or download turbovs VSIX package.
echo Please place turbovs-1.0.0.vsix in this folder and try again.
echo.
pause
exit /b 1

:install_now
echo [2/3] Installing package: "%VSIX_FILE%"
echo.

"!CODE_CMD!" --install-extension "%VSIX_FILE%" --force
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Installation failed! Please check if VS Code is running and try again.
    echo.
    pause
    exit /b %errorlevel%
)

echo.
echo =======================================================
echo   [3/3] SUCCESS: TurboVs is now installed globally!
echo =======================================================
echo.
echo Quick Start Guide:
echo 1. Open Visual Studio Code.
echo 2. Open any legacy Turbo C++ file (.cpp or .c).
echo 3. Click the [Play] button in the editor tab or press Ctrl+F9.
echo 4. Run 'TurboVs: Configure Settings' to verify your DOSBox path.
echo.
echo Enjoy retro programming with Turbo C++ in modern VS Code!
echo.
pause
exit /b 0
