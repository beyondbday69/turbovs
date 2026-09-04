@echo off
setlocal enabledelayedexpansion
title TurboVs - Complete All-in-One Global Installer

echo =======================================================
echo     TurboVs - Complete All-in-One Global Installer
echo =======================================================
echo.

:: ==========================================
:: 1. LOCATE VS CODE OR COMPATIBLE EDITOR
:: ==========================================
echo [1/4] Checking Visual Studio Code...
set "CODE_CMD="

where code >nul 2>&1
if %errorlevel% equ 0 (
    set "CODE_CMD=code"
    goto :found_code
)

if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
    goto :found_code
)

if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
    goto :found_code
)

if exist "%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd" (
    set "CODE_CMD=%ProgramFiles(x86)%\Microsoft VS Code\bin\code.cmd"
    goto :found_code
)

where codium >nul 2>&1
if %errorlevel% equ 0 (
    set "CODE_CMD=codium"
    goto :found_code
)
if exist "%LOCALAPPDATA%\Programs\VSCodium\bin\codium.cmd" (
    set "CODE_CMD=%LOCALAPPDATA%\Programs\VSCodium\bin\codium.cmd"
    goto :found_code
)

where cursor >nul 2>&1
if %errorlevel% equ 0 (
    set "CODE_CMD=cursor"
    goto :found_code
)
if exist "%LOCALAPPDATA%\Programs\cursor\bin\cursor.cmd" (
    set "CODE_CMD=%LOCALAPPDATA%\Programs\cursor\bin\cursor.cmd"
    goto :found_code
)

echo [ERROR] Visual Studio Code was not found!
echo Please download and install VS Code from: https://code.visualstudio.com/
echo.
pause
exit /b 1

:found_code
echo    - Found editor command: "!CODE_CMD!"
echo.

:: ==========================================
:: 2. INSTALL TURBOVS EXTENSION (.VSIX)
:: ==========================================
echo [2/4] Installing TurboVs VS Code extension...
set "SCRIPT_DIR=%~dp0"
set "VSIX_FILE="

for %%f in ("%SCRIPT_DIR%turbovs-*.vsix") do (
    set "VSIX_FILE=%%f"
    goto :run_vsix_install
)

for %%f in ("%SCRIPT_DIR%*.vsix") do (
    set "VSIX_FILE=%%f"
    goto :run_vsix_install
)

echo    - Local VSIX not found. Downloading latest TurboVs from GitHub...
set "DOWNLOAD_URL=https://github.com/beyondbday69/turbovs/releases/latest/download/turbovs-1.0.0.vsix"
set "VSIX_FILE=%SCRIPT_DIR%turbovs-1.0.0.vsix"

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('%DOWNLOAD_URL%', '%VSIX_FILE%')" >nul 2>&1
if not exist "%VSIX_FILE%" (
    echo [ERROR] Could not download turbovs-1.0.0.vsix from GitHub.
    echo Please download it manually from https://github.com/beyondbday69/turbovs/releases
    pause
    exit /b 1
)

:run_vsix_install
echo    - Installing: "%VSIX_FILE%"
"!CODE_CMD!" --install-extension "%VSIX_FILE%" --force >nul 2>&1
if %errorlevel% equ 0 (
    echo    - TurboVs extension installed successfully!
) else (
    echo    - Notice: VS Code install command returned code %errorlevel%. Continuing setup...
)
echo.

:: ==========================================
:: 3. CHECK & INSTALL DOSBOX DEPENDENCY
:: ==========================================
echo [3/4] Checking DOSBox dependency...
set "DOSBOX_FOUND=0"

where dosbox >nul 2>&1
if %errorlevel% equ 0 set "DOSBOX_FOUND=1"

if exist "%ProgramFiles(x86)%\DOSBox-0.74-3\DOSBox.exe" set "DOSBOX_FOUND=1"
if exist "%ProgramFiles%\DOSBox-0.74-3\DOSBox.exe" set "DOSBOX_FOUND=1"
if exist "C:\DOSBox-0.74-3\DOSBox.exe" set "DOSBOX_FOUND=1"
if exist "C:\DOSBox\dosbox.exe" set "DOSBOX_FOUND=1"

where dosbox-x >nul 2>&1
if %errorlevel% equ 0 set "DOSBOX_FOUND=1"

if "!DOSBOX_FOUND!"=="1" (
    echo    - DOSBox is already installed!
) else (
    echo    - DOSBox was NOT found on your system.
    echo    - Attempting automated installation via Windows Package Manager (winget)...
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        echo    - Running: winget install DOSBox.DOSBox ...
        winget install -e --id DOSBox.DOSBox --accept-package-agreements --accept-source-agreements
        if %errorlevel% equ 0 (
            echo    - DOSBox installed successfully via winget!
            set "DOSBOX_FOUND=1"
        )
    )
    if "!DOSBOX_FOUND!"=="0" (
        echo.
        echo    - Winget was unavailable or install failed.
        echo    - Opening official DOSBox download page in your browser...
        start https://www.dosbox.com/download.php?main=1
        echo    - Please run the downloaded DOSBox installer.
    )
)
echo.

:: ==========================================
:: 4. CHECK TURBO C++ COMPILER DIRECTORY
:: ==========================================
echo [4/4] Checking Turbo C++ directory (C:\TURBOC3)...
set "TC_FOUND=0"

if exist "C:\TURBOC3\BIN\TCC.EXE" set "TC_FOUND=1"
if exist "C:\TC\BIN\TCC.EXE" set "TC_FOUND=1"
if exist "%USERPROFILE%\turboc3\BIN\TCC.EXE" set "TC_FOUND=1"

if "!TC_FOUND!"=="1" (
    echo    - Turbo C++ installation found!
) else (
    echo    - Turbo C++ directory was NOT found at C:\TURBOC3.
    echo.
    echo    - You need the Turbo C++ 3.0 folder (containing BIN, INCLUDE, LIB).
    echo    - Standard location: C:\TURBOC3
    echo    - Download Turbo C++ from: https://github.com/vineetchoudhary/TurboCPP/releases
    echo.
    echo    - Once extracted to C:\TURBOC3, TurboVs will automatically detect it!
)
echo.

:: ==========================================
:: SUMMARY & QUICK START
:: ==========================================
echo =======================================================
echo                INSTALLATION SUMMARY
echo =======================================================
echo.
echo 1. TurboVs Extension:   INSTALLED GLOBALLY
if "!DOSBOX_FOUND!"=="1" (
    echo 2. DOSBox Emulator:     INSTALLED
) else (
    echo 2. DOSBox Emulator:     PLEASE INSTALL DOSBOX
)
if "!TC_FOUND!"=="1" (
    echo 3. Turbo C++ (C:\TURBOC3): FOUND
) else (
    echo 3. Turbo C++ (C:\TURBOC3): EXTRACT TO C:\TURBOC3
)
echo.
echo -------------------------------------------------------
echo How to run your first program:
echo 1. Open VS Code.
echo 2. Open any legacy C++ file (e.g. hello.cpp).
echo 3. Press Ctrl+F9 (or click the Play button in the top right).
echo -------------------------------------------------------
echo.
pause
exit /b 0
