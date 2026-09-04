const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

/**
 * Global state & disposables
 */
let statusBarItem;
let diagnosticCollection;
let isProgramRunning = false;
let activeTempFiles = [];
let ioWebviewPanel = null;
let currentCustomInput = '';
let lastProgramOutput = '';
let executionStartTime = 0;
let activeProcess = null;
let globalExtensionContext = null;

/**
 * Helper to get configuration with turbovs primary and turboCpp fallback
 */
function getSetting(key, defaultValue) {
    const configTurbovs = vscode.workspace.getConfiguration('turbovs');
    const valTurbovs = configTurbovs.get(key);
    if (valTurbovs !== undefined && valTurbovs !== '') {
        return valTurbovs;
    }
    const configLegacy = vscode.workspace.getConfiguration('turboCpp');
    const valLegacy = configLegacy.get(key);
    if (valLegacy !== undefined && valLegacy !== '') {
        return valLegacy;
    }
    return defaultValue;
}

/**
 * Helper to update configuration
 */
async function updateSetting(key, value) {
    const config = vscode.workspace.getConfiguration('turbovs');
    await config.update(key, value, vscode.ConfigurationTarget.Global);
}

/**
 * Extension activation
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    globalExtensionContext = context;
    // 1. Create Diagnostics Collection for compiler error reporting
    diagnosticCollection = vscode.languages.createDiagnosticCollection('turbovs');
    context.subscriptions.push(diagnosticCollection);

    // 2. Create Status Bar Item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    statusBarItem.command = 'turbovs.quickMenu';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();
    statusBarItem.show();

    // 3. Register Primary Commands (turbovs.*)
    const runCmd = vscode.commands.registerCommand('turbovs.run', (options) => runTurboCpp(context, options));
    const stopCmd = vscode.commands.registerCommand('turbovs.stop', () => stopTurboCpp());
    const openIdeCmd = vscode.commands.registerCommand('turbovs.openIde', () => openTurboCppIde(context));
    const checkEnvCmd = vscode.commands.registerCommand('turbovs.checkEnvironment', () => checkEnvironment());
    const configureCmd = vscode.commands.registerCommand('turbovs.configure', () => configureSettings());
    const quickMenuCmd = vscode.commands.registerCommand('turbovs.quickMenu', () => showQuickMenu(context));
    const openInputPanelCmd = vscode.commands.registerCommand('turbovs.openInputPanel', () => openInputPanel(context));
    const checkScriptInputsCmd = vscode.commands.registerCommand('turbovs.checkScriptInputs', () => checkScriptInputsPrompt(context));
    const openIoPanelCmd = vscode.commands.registerCommand('turbovs.openIoPanel', () => openIoPanel(context));
    const setInputCmd = vscode.commands.registerCommand('turbovs.setInput', () => setInputPrompt(context));

    // Backward compatibility aliases
    const legacyRunCmd = vscode.commands.registerCommand('turboCpp.run', (options) => runTurboCpp(context, options));
    const legacyStopCmd = vscode.commands.registerCommand('turboCpp.stop', () => stopTurboCpp());
    const legacyOpenIdeCmd = vscode.commands.registerCommand('turboCpp.openIde', () => openTurboCppIde(context));
    const legacyCheckEnvCmd = vscode.commands.registerCommand('turboCpp.checkEnvironment', () => checkEnvironment());
    const legacyConfigureCmd = vscode.commands.registerCommand('turboCpp.configure', () => configureSettings());

    context.subscriptions.push(
        runCmd, stopCmd, openIdeCmd, checkEnvCmd, configureCmd, quickMenuCmd,
        openInputPanelCmd, checkScriptInputsCmd, openIoPanelCmd, setInputCmd,
        legacyRunCmd, legacyStopCmd, legacyOpenIdeCmd, legacyCheckEnvCmd, legacyConfigureCmd
    );

    // Listen to active editor changes to live-update input panel if open
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && ioWebviewPanel) {
                refreshIoPanel(editor);
            }
        })
    );

    // 4. Listen to configuration changes to update status bar
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('turbovs') || e.affectsConfiguration('turboCpp')) {
                updateStatusBar();
            }
        })
    );

    // 5. Clean up temporary files on deactivation
    context.subscriptions.push({
        dispose: () => {
            cleanupTempFiles();
        }
    });
}

/**
 * Extension deactivation
 */
function deactivate() {
    cleanupTempFiles();
    if (diagnosticCollection) {
        diagnosticCollection.clear();
    }
}

/**
 * Quick menu shown when user clicks the status bar item
 */
async function showQuickMenu(context) {
    const env = inspectEnvironment();
    const isReady = env.dosbox.valid && env.compiler.valid;

    const items = [
        {
            label: '$(play) Run Current Program',
            description: 'Compile and run the active C/C++ file in DOSBox (Ctrl+F9)',
            action: 'run'
        },
        {
            label: '$(list-ordered) Open Input Panel (Separate Input Fields)',
            description: 'Inspect script inputs and provide values in separate boxes',
            action: 'inputPanel'
        },
        {
            label: '$(terminal-view) Open Input / Output Panel',
            description: 'Dedicated competitive programming panel for stdin and clean stdout',
            action: 'ioPanel'
        },
        {
            label: '$(search) Check Script Inputs',
            description: 'Count and list all cin, scanf, and getch inputs in this script',
            action: 'checkInputs'
        },
        {
            label: '$(edit) Set Program Input (stdin)',
            description: 'Enter input values for cin >> or scanf before running',
            action: 'setInput'
        },
        {
            label: '$(window) Open Turbo C++ IDE',
            description: 'Launch the classic Borland TC.EXE interface',
            action: 'ide'
        },
        {
            label: '$(debug-stop) Stop Running Program',
            description: 'Kill the active DOSBox session',
            action: 'stop'
        },
        {
            label: '$(check) Check Environment Status',
            description: `DOSBox: ${env.dosbox.valid ? 'Found' : 'Missing'} | Turbo C++: ${env.compiler.valid ? 'Found' : 'Missing'}`,
            action: 'check'
        },
        {
            label: '$(gear) Configure Settings',
            description: 'Set DOSBox path, compiler path, and runner options',
            action: 'configure'
        }
    ];

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: `TurboVs — ${isReady ? 'Environment Ready' : 'Setup Required'}`
    });

    if (!selection) {
        return;
    }

    switch (selection.action) {
        case 'run':
            vscode.commands.executeCommand('turbovs.run');
            break;
        case 'inputPanel':
            vscode.commands.executeCommand('turbovs.openInputPanel');
            break;
        case 'ioPanel':
            vscode.commands.executeCommand('turbovs.openIoPanel');
            break;
        case 'checkInputs':
            vscode.commands.executeCommand('turbovs.checkScriptInputs');
            break;
        case 'setInput':
            vscode.commands.executeCommand('turbovs.setInput');
            break;
        case 'ide':
            vscode.commands.executeCommand('turbovs.openIde');
            break;
        case 'stop':
            vscode.commands.executeCommand('turbovs.stop');
            break;
        case 'check':
            vscode.commands.executeCommand('turbovs.checkEnvironment');
            break;
        case 'configure':
            vscode.commands.executeCommand('turbovs.configure');
            break;
    }
}

/**
 * Update Status Bar indicator
 */
function updateStatusBar() {
    if (isProgramRunning) {
        statusBarItem.text = '$(sync~spin) TurboVs: Running...';
        statusBarItem.tooltip = 'Turbo C++ program is currently running in DOSBox. Click to manage.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        return;
    }

    const env = inspectEnvironment();
    if (env.dosbox.valid && env.compiler.valid) {
        statusBarItem.text = '$(terminal) TurboVs: Ready';
        statusBarItem.tooltip = `TurboVs is ready.\nCompiler: ${env.compiler.rootPath}\nDOSBox: ${env.dosbox.path}\nClick to open quick menu.`;
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = '$(warning) TurboVs: Setup Needed';
        const missing = [];
        if (!env.dosbox.valid) missing.push('DOSBox');
        if (!env.compiler.valid) missing.push('Turbo C++');
        statusBarItem.tooltip = `Missing: ${missing.join(', ')}. Click to configure.`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
}

/**
 * Find or auto-detect DOSBox / DOSBox-X executable
 */
function resolveDosboxPath() {
    const configuredPath = (getSetting('dosboxPath', '') || '').trim();

    // 1. If configured explicitly by user, verify it
    if (configuredPath) {
        const expanded = expandHomeDir(configuredPath);
        if (fs.existsSync(expanded)) {
            return { path: expanded, valid: true, autoDetected: false };
        }
        return { path: expanded, valid: false, autoDetected: false, error: `Configured DOSBox path does not exist: ${expanded}` };
    }

    // 2. Auto-detect from system locations based on platform
    const platform = process.platform;
    const candidates = [];

    if (platform === 'win32') {
        const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const localAppData = process.env.LOCALAPPDATA || '';

        candidates.push(
            path.join(progFilesX86, 'DOSBox-0.74-3', 'DOSBox.exe'),
            path.join(progFiles, 'DOSBox-0.74-3', 'DOSBox.exe'),
            path.join(progFilesX86, 'DOSBox-0.74', 'DOSBox.exe'),
            path.join(progFiles, 'DOSBox-0.74', 'DOSBox.exe'),
            'C:\\DOSBox-0.74-3\\DOSBox.exe',
            'C:\\DOSBox\\dosbox.exe',
            'C:\\dosbox-x\\dosbox-x.exe',
            path.join(progFiles, 'DOSBox-X', 'dosbox-x.exe'),
            path.join(progFilesX86, 'DOSBox-X', 'dosbox-x.exe')
        );
        if (localAppData) {
            candidates.push(path.join(localAppData, 'Programs', 'dosbox-x', 'dosbox-x.exe'));
        }
    } else if (platform === 'darwin') {
        candidates.push(
            '/Applications/DOSBox.app/Contents/MacOS/DOSBox',
            '/Applications/DOSBox-X.app/Contents/MacOS/dosbox-x',
            '/opt/homebrew/bin/dosbox',
            '/opt/homebrew/bin/dosbox-x',
            '/usr/local/bin/dosbox',
            '/usr/local/bin/dosbox-x'
        );
    } else {
        // Linux & BSD
        candidates.push(
            '/usr/bin/dosbox',
            '/usr/bin/dosbox-x',
            '/usr/local/bin/dosbox',
            '/usr/local/bin/dosbox-x',
            '/snap/bin/dosbox',
            '/snap/bin/dosbox-x',
            '/var/lib/flatpak/exports/bin/com.dosbox.DOSBox',
            '/var/lib/flatpak/exports/bin/com.dosbox_x.DOSBox-X'
        );
    }

    for (const cand of candidates) {
        if (cand && fs.existsSync(cand)) {
            return { path: cand, valid: true, autoDetected: true };
        }
    }

    // 3. Try checking PATH via system command
    try {
        const cmd = platform === 'win32' ? 'where' : 'which';
        for (const binary of ['dosbox', 'dosbox-x']) {
            try {
                const out = cp.execSync(`${cmd} ${binary}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
                const firstLine = out.split(/\r?\n/)[0].trim();
                if (firstLine && fs.existsSync(firstLine)) {
                    return { path: firstLine, valid: true, autoDetected: true };
                }
            } catch (_) {}
        }
    } catch (_) {}

    return { path: null, valid: false, autoDetected: false, error: 'DOSBox or DOSBox-X could not be found on your system.' };
}

/**
 * Find and validate Turbo C++ installation folder
 */
function resolveTurboCppPath() {
    const configuredPath = (getSetting('compilerPath', '') || '').trim();

    if (configuredPath) {
        const expanded = expandHomeDir(configuredPath);
        const resolved = validateTurboCppDir(expanded);
        if (resolved.valid) {
            return { ...resolved, autoDetected: false };
        }
        return { rootPath: expanded, valid: false, autoDetected: false, error: resolved.error };
    }

    // Auto-detect common Turbo C++ install locations
    const platform = process.platform;
    const candidates = [];

    if (platform === 'win32') {
        candidates.push(
            'C:\\TURBOC3',
            'C:\\TurboC3',
            'C:\\TC',
            'C:\\TC30',
            'C:\\BORLANDC',
            'D:\\TURBOC3',
            'D:\\TC'
        );
    } else {
        const home = os.homedir();
        candidates.push(
            path.join(home, 'turboc3'),
            path.join(home, '.turboc3'),
            path.join(home, 'TC'),
            path.join(home, 'tc'),
            path.join(home, 'TurboC3'),
            path.join(home, 'dosbox', 'turboc3'),
            path.join(home, 'dosbox', 'TC'),
            '/opt/turboc3',
            '/opt/tc',
            '/usr/local/turboc3',
            '/usr/local/tc'
        );
    }

    for (const cand of candidates) {
        if (cand && fs.existsSync(cand)) {
            const resolved = validateTurboCppDir(cand);
            if (resolved.valid) {
                return { ...resolved, autoDetected: true };
            }
        }
    }

    return {
        rootPath: null,
        valid: false,
        autoDetected: false,
        error: 'Turbo C++ directory not found. Please set "turbovs.compilerPath" in settings.'
    };
}

/**
 * Validates a candidate directory for Turbo C++ structure (BIN, INCLUDE, LIB)
 */
function validateTurboCppDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return { valid: false, error: `Directory does not exist: ${dirPath}` };
    }

    // Check if the directory itself is BIN (e.g. user selected C:\TURBOC3\BIN)
    const baseName = path.basename(dirPath).toLowerCase();
    let rootPath = dirPath;
    if (baseName === 'bin') {
        const parent = path.dirname(dirPath);
        if (checkSubdirs(parent)) {
            rootPath = parent;
        }
    }

    const check = checkSubdirs(rootPath);
    if (check.ok) {
        return {
            valid: true,
            rootPath: rootPath,
            binDir: check.binDir,
            includeDir: check.includeDir,
            libDir: check.libDir,
            hasTcc: check.hasTcc,
            hasTc: check.hasTc
        };
    }

    return {
        valid: false,
        error: `Directory "${dirPath}" is missing required Turbo C++ folders (BIN, INCLUDE, LIB).`
    };
}

/**
 * Checks for bin, include, lib (case-insensitively for Linux/macOS)
 */
function checkSubdirs(targetDir) {
    if (!fs.existsSync(targetDir)) return { ok: false };
    try {
        const entries = fs.readdirSync(targetDir);
        const findEntry = (name) => entries.find(e => e.toLowerCase() === name.toLowerCase());

        const binName = findEntry('bin');
        const incName = findEntry('include');
        const libName = findEntry('lib');

        if (!binName || !incName || !libName) {
            return { ok: false };
        }

        const binPath = path.join(targetDir, binName);
        const binFiles = fs.readdirSync(binPath);
        const hasTcc = binFiles.some(f => f.toLowerCase() === 'tcc.exe');
        const hasTc = binFiles.some(f => f.toLowerCase() === 'tc.exe');

        return {
            ok: hasTcc || hasTc,
            binDir: binPath,
            includeDir: path.join(targetDir, incName),
            libDir: path.join(targetDir, libName),
            hasTcc,
            hasTc
        };
    } catch (_) {
        return { ok: false };
    }
}

/**
 * Expand ~ to user home directory
 */
function expandHomeDir(filePath) {
    if (!filePath) return filePath;
    if (filePath.startsWith('~')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}

/**
 * Inspect overall environment state
 */
function inspectEnvironment() {
    const dosbox = resolveDosboxPath();
    const compiler = resolveTurboCppPath();
    return { dosbox, compiler };
}

/**
 * Check Environment Status command
 */
async function checkEnvironment() {
    const env = inspectEnvironment();

    const channel = vscode.window.createOutputChannel('TurboVs Environment');
    channel.clear();
    channel.appendLine('=======================================================');
    channel.appendLine('                  TurboVs Environment');
    channel.appendLine('=======================================================');
    channel.appendLine(`OS:                ${process.platform} (${process.arch})`);
    channel.appendLine(`Node.js:           ${process.version}`);
    channel.appendLine('');
    channel.appendLine('--- [1] DOSBox Status ---');
    if (env.dosbox.valid) {
        channel.appendLine(`Status:            READY`);
        channel.appendLine(`Path:              ${env.dosbox.path}`);
        channel.appendLine(`Auto-Detected:     ${env.dosbox.autoDetected}`);
    } else {
        channel.appendLine(`Status:            NOT FOUND / INVALID`);
        channel.appendLine(`Error:             ${env.dosbox.error}`);
        channel.appendLine(`Configured Path:   ${getSetting('dosboxPath', '') || '(empty)'}`);
    }
    channel.appendLine('');
    channel.appendLine('--- [2] Turbo C++ Compiler Status ---');
    if (env.compiler.valid) {
        channel.appendLine(`Status:            READY`);
        channel.appendLine(`Root Path:         ${env.compiler.rootPath}`);
        channel.appendLine(`BIN Directory:     ${env.compiler.binDir}`);
        channel.appendLine(`INCLUDE Directory: ${env.compiler.includeDir}`);
        channel.appendLine(`LIB Directory:     ${env.compiler.libDir}`);
        channel.appendLine(`TCC.EXE Present:   ${env.compiler.hasTcc}`);
        channel.appendLine(`TC.EXE Present:    ${env.compiler.hasTc}`);
        channel.appendLine(`Auto-Detected:     ${env.compiler.autoDetected}`);
    } else {
        channel.appendLine(`Status:            NOT FOUND / INVALID`);
        channel.appendLine(`Error:             ${env.compiler.error}`);
        channel.appendLine(`Configured Path:   ${getSetting('compilerPath', '') || '(empty)'}`);
    }
    channel.appendLine('');
    channel.appendLine('--- [3] Configuration Settings ---');
    channel.appendLine(`Auto-Clear Term:   ${getSetting('autoClearTerminal', true)}`);
    channel.appendLine(`Close on Exit:     ${getSetting('closeOnExit', true)}`);
    channel.appendLine(`Window Resolution: ${getSetting('windowResolution', '1024x768')}`);
    channel.appendLine(`Memory Model:      ${getSetting('memoryModel', 'default')}`);
    channel.appendLine(`Custom Workspace:  ${getSetting('workspacePath', '') || '(default: file directory)'}`);
    channel.appendLine('=======================================================');
    channel.show();

    if (env.dosbox.valid && env.compiler.valid) {
        vscode.window.showInformationMessage('TurboVs environment is fully configured and ready!');
    } else {
        vscode.window.showErrorMessage(
            'TurboVs environment is incomplete. Please configure missing components.',
            'Configure Settings',
            'Download Help'
        ).then(choice => {
            if (choice === 'Configure Settings') {
                configureSettings();
            } else if (choice === 'Download Help') {
                vscode.env.openExternal(vscode.Uri.parse('https://www.dosbox.com/download.php?main=1'));
            }
        });
    }
}

/**
 * Configure Settings interactive command
 */
async function configureSettings() {
    const options = [
        {
            label: '$(file) Set DOSBox Executable Path',
            description: 'Browse or type the full path to DOSBox or DOSBox-X',
            action: 'dosbox'
        },
        {
            label: '$(folder) Set Turbo C++ Directory',
            description: 'Select the Turbo C++ root directory (containing BIN, INCLUDE, LIB)',
            action: 'compiler'
        },
        {
            label: '$(root-folder) Set Custom Workspace Directory',
            description: 'Select custom folder to mount as DOS drive D:',
            action: 'workspace'
        },
        {
            label: '$(gear) Open Extension Settings UI',
            description: 'Configure all TurboVs settings in VS Code Preferences',
            action: 'settings'
        }
    ];

    const pick = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select a setting to configure'
    });

    if (!pick) return;

    if (pick.action === 'dosbox') {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select DOSBox Executable',
            filters: process.platform === 'win32' ? { 'Executable': ['exe'] } : undefined
        });
        if (uris && uris.length > 0) {
            await updateSetting('dosboxPath', uris[0].fsPath);
            vscode.window.showInformationMessage(`DOSBox path set to: ${uris[0].fsPath}`);
            updateStatusBar();
        }
    } else if (pick.action === 'compiler') {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Turbo C++ Directory'
        });
        if (uris && uris.length > 0) {
            await updateSetting('compilerPath', uris[0].fsPath);
            vscode.window.showInformationMessage(`Turbo C++ directory set to: ${uris[0].fsPath}`);
            updateStatusBar();
        }
    } else if (pick.action === 'workspace') {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Workspace Directory'
        });
        if (uris && uris.length > 0) {
            await updateSetting('workspacePath', uris[0].fsPath);
            vscode.window.showInformationMessage(`Workspace path set to: ${uris[0].fsPath}`);
        }
    } else if (pick.action === 'settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'turbovs');
    }
}

/**
 * Format path appropriately for DOSBox mount command
 */
function formatMountPath(rawPath) {
    if (process.platform === 'win32') {
        return rawPath.replace(/[/\\]+$/, '');
    } else {
        return rawPath.replace(/\/+$/, '');
    }
}

/**
 * Check if a filename is valid DOS 8.3 format (up to 8 chars alphanumeric/underscore, .cpp or .c)
 */
function isDos83Name(fileName) {
    const ext = path.extname(fileName).toUpperCase();
    const base = path.basename(fileName, path.extname(fileName));
    if (ext !== '.CPP' && ext !== '.C') return false;
    if (base.length === 0 || base.length > 8) return false;
    return /^[A-Z0-9_]+$/i.test(base);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Detects inputs requested in a C/C++ source file (cin, scanf, gets, getch)
 * and extracts prompt labels from previous output statements.
 */
function detectScriptInputs(rawCode) {
    if (!rawCode) return [];
    const lines = rawCode.split(/\r?\n/);
    const inputs = [];

    function extractRecentPrompt(currentIndex) {
        for (let j = currentIndex - 1; j >= Math.max(0, currentIndex - 6); j--) {
            const l = lines[j].trim();
            const strMatches = [...l.matchAll(/["\x27]([^"\x27]+)["\x27]/g)];
            if (strMatches.length > 0) {
                const parts = [];
                for (const m of strMatches) {
                    const s = m[1].replace(/\\n/g, '').trim();
                    if (s && !/^[=\-*#|_\s]+$/.test(s) && !s.toLowerCase().includes('copyright')) {
                        parts.push(s);
                    }
                }
                if (parts.length > 0) {
                    return parts.join(' ');
                }
            }
        }
        return '';
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const commentIdx = line.indexOf('//');
        if (commentIdx !== -1) line = line.substring(0, commentIdx);
        line = line.trim();
        if (!line) continue;

        // 1. cin >> var1 >> var2;
        if (line.match(/\bcin\s*>>/)) {
            const tokens = line.split('>>').slice(1);
            for (let token of tokens) {
                token = token.replace(/;.*$/, '').trim();
                if (token) {
                    const prompt = extractRecentPrompt(i) || (`Enter ${token}:`);
                    inputs.push({
                        type: 'cin',
                        variable: token,
                        label: prompt,
                        line: i + 1,
                        placeholder: `Value for ${token}`
                    });
                }
            }
        }
        // 2. scanf("...", &var);
        else if (line.match(/\bscanf\s*\(/)) {
            const m = line.match(/\bscanf\s*\(\s*["\x27]([^"\x27]+)["\x27]\s*,\s*([^)]+)\)/);
            if (m) {
                const vars = m[2].split(',').map(v => v.replace(/[&\s]/g, ''));
                for (let v of vars) {
                    if (v) {
                        const prompt = extractRecentPrompt(i) || (`Enter ${v}:`);
                        inputs.push({
                            type: 'scanf',
                            variable: v,
                            label: prompt,
                            line: i + 1,
                            placeholder: `Value for ${v}`
                        });
                    }
                }
            }
        }
        // 3. cin.getline(...) / gets(...)
        else if (line.match(/\b(?:cin\.getline|cin\.get|gets|fgets)\s*\(\s*([^,)]+)/)) {
            const m = line.match(/\b(?:cin\.getline|cin\.get|gets|fgets)\s*\(\s*([^,)]+)/);
            const varName = m[1].trim();
            const prompt = extractRecentPrompt(i) || (`Enter ${varName}:`);
            inputs.push({
                type: 'line',
                variable: varName,
                label: prompt,
                line: i + 1,
                placeholder: `String line for ${varName}`
            });
        }
        // 4. getch() / getche() / getchar()
        else if (line.match(/\b(getch|getche|getchar)\s*\(\s*\)/)) {
            const prompt = extractRecentPrompt(i) || 'Press any key to exit...';
            inputs.push({
                type: 'getch',
                variable: 'key',
                label: prompt,
                line: i + 1,
                placeholder: '\\n (Enter key)',
                defaultValue: '\\n'
            });
        }
    }

    return inputs;
}

/**
 * Dedicated output channel and pseudoterminal for noise-free output
 */
let ptyTerminal = null;
let ptyWriteEmitter = null;
let outputChannel = null;

function getOutputChannel() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('TurboVs Output');
    }
    return outputChannel;
}

function ensurePtyTerminal() {
    const existing = vscode.window.terminals.find(t => t.name === 'TurboVs');
    if (existing && ptyWriteEmitter) {
        return existing;
    }

    ptyWriteEmitter = new vscode.EventEmitter();
    const pty = {
        onDidWrite: ptyWriteEmitter.event,
        open: () => {},
        close: () => {
            ptyTerminal = null;
            ptyWriteEmitter = null;
        },
        handleInput: (data) => {
            if (data === '\x03') { // Ctrl+C
                stopTurboCpp();
            }
        }
    };

    ptyTerminal = vscode.window.createTerminal({
        name: 'TurboVs',
        iconPath: new vscode.ThemeIcon('terminal'),
        pty
    });

    return ptyTerminal;
}

/**
 * Syncs input text to TC_IN.TXT in current workspace directory
 */
function syncInputToDisk(text) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try {
        let workspaceHostDir = (getSetting('workspacePath', '') || '').trim();
        if (workspaceHostDir) {
            workspaceHostDir = expandHomeDir(workspaceHostDir);
        } else {
            workspaceHostDir = path.dirname(editor.document.fileName);
        }
        if (fs.existsSync(workspaceHostDir)) {
            const hostInTxt = path.join(workspaceHostDir, 'TC_IN.TXT');
            const dosContent = text ? text.replace(/\r?\n/g, '\r\n') + '\r\n' : '\r\n';
            fs.writeFileSync(hostInTxt, dosContent, 'utf8');
        }
    } catch (_) {}
}

/**
 * Refresh inputs in the I/O webview if open
 */
function refreshIoPanel(editor) {
    if (!ioWebviewPanel || !editor) return;
    const doc = editor.document;
    const code = doc.getText();
    const detected = detectScriptInputs(code);
    const fileName = path.basename(doc.fileName);
    ioWebviewPanel.webview.postMessage({
        command: 'updateScriptContext',
        fileName,
        detected
    });
}

/**
 * Command: Open Dedicated Input Panel (Separate Input Fields)
 * @param {vscode.ExtensionContext} context
 */
function openInputPanel(context) {
    return openIoPanel(context, 'form');
}

/**
 * Command: Open Dedicated Input / Output Webview Panel
 * @param {vscode.ExtensionContext} context
 * @param {'form'|'raw'} preferredTab
 */
function openIoPanel(context, preferredTab = 'form') {
    const editor = vscode.window.activeTextEditor;
    const code = editor ? editor.document.getText() : '';
    const activeFileName = editor ? path.basename(editor.document.fileName) : 'active_program.cpp';
    const detectedInputs = detectScriptInputs(code);

    if (ioWebviewPanel) {
        ioWebviewPanel.reveal(vscode.ViewColumn.Beside);
        ioWebviewPanel.webview.postMessage({
            command: 'updateScriptContext',
            fileName: activeFileName,
            detected: detectedInputs,
            activeTab: preferredTab
        });
        return ioWebviewPanel;
    }

    const effectiveContext = context || globalExtensionContext;
    const extPath = (effectiveContext && effectiveContext.extensionPath) ? effectiveContext.extensionPath : __dirname;
    const localResourceRoots = [];
    if (effectiveContext && effectiveContext.extensionUri && typeof vscode.Uri.joinPath === 'function') {
        try {
            localResourceRoots.push(vscode.Uri.joinPath(effectiveContext.extensionUri, 'media'));
        } catch (_) {}
    }
    localResourceRoots.push(vscode.Uri.file(path.join(extPath, 'media')));

    ioWebviewPanel = vscode.window.createWebviewPanel(
        'turbovsIoPanel',
        'TurboVs: Input / Output',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots
        }
    );

    // If currentCustomInput is not yet set, inspect active workspace for TC_IN.TXT or input.txt
    if (!currentCustomInput && editor) {
        const dir = path.dirname(editor.document.fileName);
        const inTxt = path.join(dir, 'TC_IN.TXT');
        const inputTxt = path.join(dir, 'input.txt');
        if (fs.existsSync(inTxt)) {
            try {
                const val = fs.readFileSync(inTxt, 'utf8').trim();
                if (val) currentCustomInput = val;
            } catch (_) {}
        } else if (fs.existsSync(inputTxt)) {
            try {
                const val = fs.readFileSync(inputTxt, 'utf8').trim();
                if (val) currentCustomInput = val;
            } catch (_) {}
        }
    }

    ioWebviewPanel.webview.html = getIoWebviewHtml(
        currentCustomInput,
        lastProgramOutput,
        detectedInputs,
        activeFileName,
        preferredTab,
        ioWebviewPanel.webview,
        effectiveContext
    );

    ioWebviewPanel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'run':
                vscode.commands.executeCommand('turbovs.run', { skipPrompt: true });
                break;
            case 'updateInput':
                currentCustomInput = message.text || '';
                syncInputToDisk(currentCustomInput);
                break;
            case 'clearInput':
                currentCustomInput = '';
                syncInputToDisk('');
                break;
            case 'clearOutput':
                lastProgramOutput = '';
                break;
            case 'copyOutput':
                if (message.text) {
                    await vscode.env.clipboard.writeText(message.text);
                    vscode.window.showInformationMessage('TurboVs: Output copied to clipboard.');
                }
                break;
        }
    });

    ioWebviewPanel.onDidDispose(() => {
        ioWebviewPanel = null;
    });

    return ioWebviewPanel;
}

/**
 * Command: Check how many inputs are in the active script
 * @param {vscode.ExtensionContext} context
 */
async function checkScriptInputsPrompt(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('TurboVs: Please open a C/C++ file to analyze its inputs.');
        return;
    }

    const doc = editor.document;
    const fileName = path.basename(doc.fileName);
    const code = doc.getText();
    const detected = detectScriptInputs(code);

    if (detected.length === 0) {
        const choice = await vscode.window.showInformationMessage(
            `TurboVs: No stdin inputs (cin/scanf/getch) detected in "${fileName}". Program can run without input.`,
            'Run Program',
            'Open Input Panel'
        );
        if (choice === 'Run Program') vscode.commands.executeCommand('turbovs.run', { skipPrompt: true });
        if (choice === 'Open Input Panel') openInputPanel(context);
        return;
    }

    const summary = detected.map((d, i) => `${i + 1}. [${d.type}] ${d.variable}: "${d.label}"`).join('\n');
    const choice = await vscode.window.showInformationMessage(
        `TurboVs: Detected ${detected.length} input(s) in "${fileName}":\n${summary}`,
        'Open Input Panel',
        'Run Program'
    );

    if (choice === 'Open Input Panel') {
        openInputPanel(context);
    } else if (choice === 'Run Program') {
        vscode.commands.executeCommand('turbovs.run', { skipPrompt: true });
    }
}

/**
 * Interactive multi-step input box using VS Code native InputBox UI component
 */
async function promptMultiStepInputs(detectedInputs, initialVal = '', activeFileName = 'Program') {
    return new Promise((resolve) => {
        const initialLines = initialVal ? initialVal.split(/\r?\n/) : [];
        const results = [];

        function showStep(index) {
            if (index >= detectedInputs.length) {
                resolve(results.join('\n'));
                return;
            }

            const item = detectedInputs[index];
            const inputBox = vscode.window.createInputBox();
            inputBox.title = `TurboVs Input: ${activeFileName}`;
            inputBox.step = index + 1;
            inputBox.totalSteps = detectedInputs.length;
            inputBox.prompt = item.label || `Enter value for ${item.variable} (${item.type || 'cin'}):`;
            inputBox.placeholder = item.placeholder || `Value for ${item.variable}`;
            inputBox.value = initialLines[index] !== undefined ? initialLines[index] : (item.defaultValue || '');
            inputBox.ignoreFocusOut = true;

            inputBox.onDidAccept(() => {
                results.push(inputBox.value);
                inputBox.dispose();
                showStep(index + 1);
            });

            inputBox.onDidHide(() => {
                inputBox.dispose();
                if (results.length < detectedInputs.length) {
                    resolve(null);
                }
            });

            inputBox.show();
        }

        showStep(0);
    });
}

/**
 * Command: Set Program Input (stdin) via quick input box or multi-step prompt
 * @param {vscode.ExtensionContext} context
 */
async function setInputPrompt(context) {
    const editor = vscode.window.activeTextEditor;
    let initialVal = currentCustomInput;
    if (!initialVal && editor) {
        const dir = path.dirname(editor.document.fileName);
        const inTxt = path.join(dir, 'TC_IN.TXT');
        const inputTxt = path.join(dir, 'input.txt');
        if (fs.existsSync(inTxt)) {
            try { initialVal = fs.readFileSync(inTxt, 'utf8').trim(); } catch (_) {}
        } else if (fs.existsSync(inputTxt)) {
            try { initialVal = fs.readFileSync(inputTxt, 'utf8').trim(); } catch (_) {}
        }
    }

    const doc = editor ? editor.document : null;
    const activeFileName = doc ? path.basename(doc.fileName) : 'active_program.cpp';
    const detectedInputs = doc ? detectScriptInputs(doc.getText()) : [];

    let finalInput = undefined;

    if (detectedInputs.length > 1) {
        const varList = detectedInputs.map(d => d.variable).join(', ');
        const pick = await vscode.window.showQuickPick([
            {
                label: `$(list-ordered) Step-by-Step Native Inputs (${detectedInputs.length} detected)`,
                description: `Variables: ${varList}`,
                action: 'multistep'
            },
            {
                label: '$(layout-panel) Open Dedicated I/O Panel (Webview UI)',
                description: 'Interactive page with separate input fields & live output',
                action: 'panel'
            },
            {
                label: '$(edit) Single Line Input (Raw \\n separated)',
                description: 'Enter raw multiline inputs separated by \\n',
                action: 'single'
            }
        ], {
            placeHolder: `Select input method for ${activeFileName} (${detectedInputs.length} inputs detected)`
        });

        if (!pick) return;

        if (pick.action === 'panel') {
            openInputPanel(context);
            return;
        } else if (pick.action === 'multistep') {
            finalInput = await promptMultiStepInputs(detectedInputs, initialVal, activeFileName);
        } else {
            finalInput = await vscode.window.showInputBox({
                title: `TurboVs: Set Program Input (${activeFileName})`,
                prompt: 'Enter inputs for cin >> or scanf (use \\n to separate lines for multiple prompts)',
                value: initialVal ? initialVal.replace(/\r?\n/g, '\\n') : '',
                placeHolder: 'e.g. 10\\n+\\n5'
            });
            if (finalInput !== undefined) {
                finalInput = finalInput.replace(/\\n/g, '\n');
            }
        }
    } else {
        const promptText = detectedInputs.length === 1
            ? (detectedInputs[0].label || `Enter input for ${detectedInputs[0].variable}:`)
            : 'Enter inputs for cin >> or scanf (use \\n to separate lines for multiple prompts)';
        const input = await vscode.window.showInputBox({
            title: `TurboVs: Set Program Input (${activeFileName})`,
            prompt: promptText,
            value: initialVal ? initialVal.replace(/\r?\n/g, '\\n') : '',
            placeHolder: detectedInputs.length === 1 ? (detectedInputs[0].placeholder || 'Value') : 'e.g. 10\\n+\\n5'
        });
        if (input !== undefined) {
            finalInput = input.replace(/\\n/g, '\n');
        }
    }

    if (finalInput !== undefined && finalInput !== null) {
        currentCustomInput = finalInput;
        syncInputToDisk(finalInput);

        if (ioWebviewPanel) {
            ioWebviewPanel.webview.postMessage({ command: 'setInput', text: finalInput });
        }

        const choice = await vscode.window.showInformationMessage(
            'TurboVs: Program input saved. It will be piped on next run.',
            'Open Input Panel',
            'Run Program'
        );
        if (choice === 'Open Input Panel') {
            openInputPanel(context);
        } else if (choice === 'Run Program') {
            vscode.commands.executeCommand('turbovs.run', { skipPrompt: true });
        }
    }
}

/**
 * Generate HTML for the I/O webview panel with separate input fields per detected input
 */
/**
 * Generate HTML for the I/O webview panel with official VS Code UI Components
 */
function getIoWebviewHtml(initialInput, initialOutput, detectedInputs = [], activeFileName = 'Program', initialTab = 'form', webview = null, context = null) {
    const escapedFileName = escapeHtml(activeFileName);
    const hasOutput = initialOutput && initialOutput.trim().length > 0;
    const escapedOutput = hasOutput ? escapeHtml(initialOutput) : 'Program output will appear here after execution...';
    const outputClass = hasOutput ? 'output-box' : 'output-box empty';
    const jsonDetected = JSON.stringify(detectedInputs || []);
    const escapedInitialInput = escapeHtml(initialInput || '');
    const activeTabId = initialTab === 'raw' ? 'tab-raw' : 'tab-form';

    let toolkitUri = '';
    let codiconUri = '';
    const effectiveContext = context || globalExtensionContext;
    const extPath = (effectiveContext && effectiveContext.extensionPath) ? effectiveContext.extensionPath : __dirname;

    if (webview && typeof webview.asWebviewUri === 'function') {
        if (effectiveContext && effectiveContext.extensionUri && typeof vscode.Uri.joinPath === 'function') {
            try {
                toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(effectiveContext.extensionUri, 'media', 'toolkit.min.js'));
                codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(effectiveContext.extensionUri, 'media', 'codicon.css'));
            } catch (_) {}
        }
        if (!toolkitUri) {
            try {
                toolkitUri = webview.asWebviewUri(vscode.Uri.file(path.join(extPath, 'media', 'toolkit.min.js')));
                codiconUri = webview.asWebviewUri(vscode.Uri.file(path.join(extPath, 'media', 'codicon.css')));
            } catch (_) {}
        }
    }

    const cspSource = (webview && webview.cspSource) ? webview.cspSource : '*';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
<title>TurboVs I/O - Input &amp; Output</title>
${codiconUri ? `<link rel="stylesheet" href="${codiconUri}">` : ''}
${toolkitUri ? `<script type="module" src="${toolkitUri}"></script>` : ''}
<style>
  :root {
    --bg-color: var(--vscode-editor-background, #1e1e1e);
    --fg-color: var(--vscode-editor-foreground, #d4d4d4);
    --input-bg: var(--vscode-input-background, #252526);
    --input-fg: var(--vscode-input-foreground, #cccccc);
    --input-border: var(--vscode-input-border, #3c3c3c);
    --card-bg: var(--vscode-editorWidget-background, #252526);
    --card-border: var(--vscode-editorWidget-border, #333333);
    --font-mono: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
    --font-sans: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  }
  body {
    background-color: var(--bg-color);
    color: var(--fg-color);
    font-family: var(--font-sans);
    margin: 0;
    padding: 12px 16px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #333333);
    margin-bottom: 6px;
    flex-shrink: 0;
    gap: 12px;
    flex-wrap: wrap;
  }
  .title-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .logo-title {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.3px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--fg-color);
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  vscode-panels {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-bottom: 6px;
  }
  vscode-panel-tab {
    font-size: 12px;
    cursor: pointer;
    user-select: none;
  }
  vscode-panel-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 8px 0 4px 0;
    box-sizing: border-box;
  }
  .fields-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 6px;
    min-height: 0;
  }
  .input-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 4px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .input-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .input-card-title {
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--fg-color);
  }
  .input-card-prompt {
    font-size: 12px;
    color: var(--fg-color);
    opacity: 0.9;
  }
  .remove-field-btn {
    cursor: pointer;
  }
  .add-field-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    flex-shrink: 0;
  }
  .preview-bar {
    font-size: 11px;
    color: var(--fg-color);
    opacity: 0.7;
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 360px;
  }
  .raw-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  vscode-text-area, .rawTextarea {
    flex: 1;
    width: 100%;
    font-family: var(--font-mono);
    min-height: 120px;
    box-sizing: border-box;
  }
  vscode-divider {
    margin: 6px 0;
    flex-shrink: 0;
  }
  .output-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 4px;
    padding: 8px 10px;
  }
  .output-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    flex-shrink: 0;
  }
  .output-title {
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--fg-color);
  }
  .output-box {
    flex: 1;
    width: 100%;
    background-color: #0d1117;
    color: #58a6ff;
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 10px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.45;
    overflow-y: auto;
    box-sizing: border-box;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
    margin: 0;
  }
  .output-box.empty {
    color: #8b949e;
    font-style: italic;
  }
  .time-badge {
    font-size: 11px;
    color: #3fb950;
    font-weight: 600;
  }
  /* Fallback and helper styling */
  vscode-text-field {
    display: block;
    width: 100%;
  }
  vscode-button, vscode-badge, vscode-text-field, vscode-text-area, vscode-panels, vscode-panel-tab, vscode-panel-view, vscode-divider {
    box-sizing: border-box;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title-group">
      <span class="logo-title"><span class="codicon codicon-zap"></span> TurboVs I/O</span>
      <vscode-badge id="fileBadge"><span class="codicon codicon-file-code"></span> ${escapedFileName}</vscode-badge>
      <vscode-badge id="countBadge"><span class="codicon codicon-symbol-parameter"></span> ${detectedInputs.length} Inputs Detected</vscode-badge>
      <vscode-badge id="statusBadge">Ready</vscode-badge>
      <span id="timeBadge" class="time-badge"></span>
    </div>
    <div class="actions">
      <vscode-button id="runBtn" appearance="primary" title="Run Current Program (Ctrl+F9)"><span class="codicon codicon-play"></span> Run Program</vscode-button>
      <vscode-button id="clearAllBtn" appearance="secondary" title="Clear all inputs and outputs"><span class="codicon codicon-clear-all"></span> Clear All</vscode-button>
    </div>
  </div>

  <vscode-panels id="ioPanels" activeid="${activeTabId}">
    <vscode-panel-tab id="tab-form">Separate Input Fields (<span id="tabCount">${detectedInputs.length}</span>)</vscode-panel-tab>
    <vscode-panel-tab id="tab-raw">Raw Multiline Stdin</vscode-panel-tab>

    <!-- Mode 1: Separate Fields for Each Detected Input -->
    <vscode-panel-view id="view-form">
      <div id="fieldsScroll" class="fields-scroll"></div>
      <div class="add-field-row">
        <vscode-button id="addFieldBtn" appearance="secondary"><span class="codicon codicon-add"></span> Add Input Field</vscode-button>
        <span id="previewBar" class="preview-bar"></span>
      </div>
    </vscode-panel-view>

    <!-- Mode 2: Raw Multiline Textarea -->
    <vscode-panel-view id="view-raw">
      <div class="raw-wrapper">
        <vscode-text-area id="stdinInput" class="rawTextarea" rows="8" resize="vertical" placeholder="Enter input values here (one per line)...">${escapedInitialInput}</vscode-text-area>
      </div>
    </vscode-panel-view>
  </vscode-panels>

  <vscode-divider></vscode-divider>

  <div class="output-panel">
    <div class="output-header">
      <span class="output-title"><span class="codicon codicon-terminal"></span> Program Output (Pure Stdout)</span>
      <vscode-button id="copyBtn" appearance="secondary"><span class="codicon codicon-copy"></span> Copy Output</vscode-button>
    </div>
    <pre id="stdoutOutput" class="${outputClass}">${escapedOutput}</pre>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function escapeHtmlClient(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    let detectedInputs = ${jsonDetected};
    let currentInputs = [];

    const fileBadge = document.getElementById('fileBadge');
    const countBadge = document.getElementById('countBadge');
    const statusBadge = document.getElementById('statusBadge');
    const timeBadge = document.getElementById('timeBadge');
    const runBtn = document.getElementById('runBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const tabForm = document.getElementById('tab-form');
    const tabRaw = document.getElementById('tab-raw');
    const ioPanels = document.getElementById('ioPanels');
    const fieldsScroll = document.getElementById('fieldsScroll');
    const addFieldBtn = document.getElementById('addFieldBtn');
    const previewBar = document.getElementById('previewBar');
    const rawTextarea = document.getElementById('stdinInput');
    const stdoutOutput = document.getElementById('stdoutOutput');
    const copyBtn = document.getElementById('copyBtn');
    const tabCount = document.getElementById('tabCount');

    function initFieldsFromData() {
      const initialRaw = rawTextarea ? rawTextarea.value : '';
      const rawLines = initialRaw.split(/\\r?\\n/).filter((_, idx, arr) => idx < arr.length - 1 || _ !== '');

      currentInputs = [];
      if (detectedInputs && detectedInputs.length > 0) {
        detectedInputs.forEach((det, idx) => {
          const val = rawLines[idx] !== undefined ? rawLines[idx] : (det.defaultValue || '');
          currentInputs.push({
            type: det.type,
            variable: det.variable,
            label: det.label,
            placeholder: det.placeholder || ('Value for ' + det.variable),
            value: val
          });
        });
        for (let i = detectedInputs.length; i < rawLines.length; i++) {
          currentInputs.push({
            type: 'extra',
            variable: 'input_' + (i + 1),
            label: 'Extra Input #' + (i + 1),
            placeholder: 'Value',
            value: rawLines[i]
          });
        }
      } else if (rawLines.length > 0) {
        rawLines.forEach((l, idx) => {
          currentInputs.push({
            type: 'input',
            variable: 'in_' + (idx + 1),
            label: 'Input #' + (idx + 1),
            placeholder: 'Value',
            value: l
          });
        });
      } else {
        currentInputs.push({
          type: 'input',
          variable: 'in_1',
          label: 'Input #1',
          placeholder: 'Value for input',
          value: ''
        });
      }
      renderFields();
    }

    function renderFields() {
      if (!fieldsScroll) return;
      fieldsScroll.innerHTML = '';
      if (tabCount) tabCount.textContent = currentInputs.length;
      if (countBadge) countBadge.innerHTML = '<span class="codicon codicon-symbol-parameter"></span> ' + currentInputs.length + ' Inputs Configured';

      currentInputs.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'input-card';

        const cardHeader = document.createElement('div');
        cardHeader.className = 'input-card-header';

        const title = document.createElement('span');
        title.className = 'input-card-title';
        const typeLabel = escapeHtmlClient(item.type || 'cin');
        const varLabel = item.variable ? (' >> ' + escapeHtmlClient(item.variable)) : '';
        title.innerHTML = '<span class="codicon codicon-symbol-variable"></span> Input #' + (index + 1) + ' &nbsp;<vscode-badge>' + typeLabel + varLabel + '</vscode-badge>';

        const removeBtn = document.createElement('vscode-button');
        removeBtn.setAttribute('appearance', 'icon');
        removeBtn.setAttribute('aria-label', 'Remove field');
        removeBtn.className = 'remove-field-btn';
        removeBtn.innerHTML = '<span class="codicon codicon-close"></span>';
        removeBtn.title = 'Remove field';
        removeBtn.addEventListener('click', () => {
          currentInputs.splice(index, 1);
          renderFields();
          syncRawFromFields();
        });

        cardHeader.appendChild(title);
        cardHeader.appendChild(removeBtn);

        const promptLabel = document.createElement('label');
        promptLabel.className = 'input-card-prompt';
        promptLabel.textContent = item.label || ('Enter input #' + (index + 1) + ':');

        const inputEl = document.createElement('vscode-text-field');
        inputEl.className = 'input-field';
        inputEl.setAttribute('placeholder', item.placeholder || 'Enter value');
        inputEl.value = item.value || '';
        inputEl.setAttribute('value', item.value || '');
        inputEl.addEventListener('input', (e) => {
          item.value = e.target.value;
          syncRawFromFields();
        });

        card.appendChild(cardHeader);
        card.appendChild(promptLabel);
        card.appendChild(inputEl);

        fieldsScroll.appendChild(card);
      });

      updatePreview();
    }

    function syncRawFromFields() {
      const combined = currentInputs.map(i => i.value).join('\\n');
      if (rawTextarea) rawTextarea.value = combined;
      updatePreview();
      vscode.postMessage({ command: 'updateInput', text: combined });
    }

    function syncFieldsFromRaw() {
      if (!rawTextarea) return;
      const lines = rawTextarea.value.split(/\\r?\\n/);
      currentInputs = lines.map((line, idx) => {
        const existing = currentInputs[idx];
        return {
          type: existing ? existing.type : 'input',
          variable: existing ? existing.variable : ('in_' + (idx + 1)),
          label: existing ? existing.label : ('Input #' + (idx + 1)),
          placeholder: 'Value',
          value: line
        };
      });
      renderFields();
      vscode.postMessage({ command: 'updateInput', text: rawTextarea.value });
    }

    function updatePreview() {
      if (!previewBar) return;
      const tokens = currentInputs.map(i => i.value !== '' ? i.value : '(empty)');
      previewBar.textContent = 'Piped: [ ' + tokens.join(' ] ↵ [ ') + ' ]';
    }

    if (addFieldBtn) {
      addFieldBtn.addEventListener('click', () => {
        const nextIdx = currentInputs.length + 1;
        currentInputs.push({
          type: 'custom',
          variable: 'in_' + nextIdx,
          label: 'Custom Input #' + nextIdx,
          placeholder: 'Value',
          value: ''
        });
        renderFields();
        syncRawFromFields();
      });
    }

    if (ioPanels) {
      ioPanels.addEventListener('change', (e) => {
        const activeId = (e.target && e.target.activeid) || ioPanels.getAttribute('activeid');
        if (activeId === 'tab-raw') {
          syncRawFromFields();
        } else if (activeId === 'tab-form') {
          syncFieldsFromRaw();
        }
      });
    }

    if (tabForm) {
      tabForm.addEventListener('click', () => {
        setTimeout(syncFieldsFromRaw, 20);
      });
    }
    if (tabRaw) {
      tabRaw.addEventListener('click', () => {
        setTimeout(syncRawFromFields, 20);
      });
    }

    if (rawTextarea) {
      rawTextarea.addEventListener('input', () => {
        updatePreview();
        vscode.postMessage({ command: 'updateInput', text: rawTextarea.value });
      });
      rawTextarea.addEventListener('change', () => {
        updatePreview();
        vscode.postMessage({ command: 'updateInput', text: rawTextarea.value });
      });
    }

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'run' });
      });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        currentInputs = [];
        if (rawTextarea) rawTextarea.value = '';
        renderFields();
        if (stdoutOutput) {
          stdoutOutput.textContent = 'Program output will appear here after execution...';
          stdoutOutput.classList.add('empty');
        }
        if (statusBadge) {
          statusBadge.textContent = 'Ready';
        }
        if (timeBadge) timeBadge.textContent = '';
        vscode.postMessage({ command: 'clearInput' });
        vscode.postMessage({ command: 'clearOutput' });
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = (stdoutOutput && !stdoutOutput.classList.contains('empty')) ? stdoutOutput.textContent : '';
        vscode.postMessage({ command: 'copyOutput', text });
      });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'updateScriptContext') {
        if (msg.fileName && fileBadge) {
          fileBadge.innerHTML = '<span class="codicon codicon-file-code"></span> ' + escapeHtmlClient(msg.fileName);
        }
        if (msg.detected) {
          detectedInputs = msg.detected;
          initFieldsFromData();
        }
        if (msg.activeTab && ioPanels) {
          const targetId = msg.activeTab === 'raw' ? 'tab-raw' : 'tab-form';
          ioPanels.setAttribute('activeid', targetId);
          if (ioPanels.activeid !== undefined) ioPanels.activeid = targetId;
        }
      } else if (msg.command === 'setInput') {
        if (rawTextarea) rawTextarea.value = msg.text || '';
        syncFieldsFromRaw();
      } else if (msg.command === 'setRunning') {
        if (runBtn) runBtn.disabled = true;
        if (statusBadge) statusBadge.textContent = 'Running...';
        if (timeBadge) timeBadge.textContent = '';
      } else if (msg.command === 'setOutput') {
        if (runBtn) runBtn.disabled = false;
        const text = msg.text || '';
        if (stdoutOutput) {
          stdoutOutput.textContent = text;
          if (text.trim().length > 0) {
            stdoutOutput.classList.remove('empty');
          } else {
            stdoutOutput.textContent = '(Program produced no output)';
          }
        }
        if (statusBadge) {
          if (msg.status === 'error') {
            statusBadge.textContent = 'Compilation Failed';
          } else {
            statusBadge.textContent = 'Success';
          }
        }
        if (msg.duration && timeBadge) {
          timeBadge.textContent = '⚡ ' + msg.duration + 's';
        }
      }
    });

    initFieldsFromData();
  </script>
</body>
</html>`;
}

/**
 * Determines whether to auto-prompt the user for input before running
 */
function shouldPromptForInput(detectedInputs, options = {}, autoPromptSetting = true) {
    if (!autoPromptSetting) return false;
    if (options && options.skipPrompt) return false;
    return Array.isArray(detectedInputs) && detectedInputs.length > 0;
}

/**
 * Normalizes and formats user input string for DOS stdin
 */
function formatUserInputString(userInput, detectedInputs = []) {
    if (!userInput) return '';
    let formatted = userInput.replace(/\\n/g, '\n');
    const hasLineInput = Array.isArray(detectedInputs) && detectedInputs.some(d => d.type === 'line');
    if (detectedInputs && detectedInputs.length > 1 && !formatted.includes('\n') && !hasLineInput && formatted.trim()) {
        const tokens = formatted.trim().split(/\s+/);
        if (tokens.length > 1) {
            formatted = tokens.join('\n');
        }
    }
    return formatted;
}

/**
 * Main command: Run active C/C++ program in Turbo C++ via DOSBox
 * @param {vscode.ExtensionContext} context
 * @param {{ skipPrompt?: boolean }} [options]
 */
async function runTurboCpp(context, options = {}) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active file open. Please open a .cpp or .c file to run with TurboVs.');
        return;
    }

    const document = editor.document;
    const filePath = document.fileName;
    const fileExt = path.extname(filePath).toLowerCase();

    if (!['.cpp', '.c', '.cxx', '.cc'].includes(fileExt)) {
        vscode.window.showWarningMessage(`File "${path.basename(filePath)}" is not a C/C++ source file.`);
        return;
    }

    // 1. Save document if dirty
    if (document.isDirty) {
        await document.save();
    }

    // 2. Validate environment
    const env = inspectEnvironment();
    if (!env.dosbox.valid) {
        const choice = await vscode.window.showErrorMessage(
            `Cannot run: ${env.dosbox.error || 'DOSBox is not configured or found.'}`,
            'Configure Settings',
            'Download DOSBox'
        );
        if (choice === 'Configure Settings') configureSettings();
        if (choice === 'Download DOSBox') vscode.env.openExternal(vscode.Uri.parse('https://www.dosbox.com/download.php?main=1'));
        return;
    }

    if (!env.compiler.valid) {
        const choice = await vscode.window.showErrorMessage(
            `Cannot run: ${env.compiler.error || 'Turbo C++ installation not found.'}`,
            'Configure Settings'
        );
        if (choice === 'Configure Settings') configureSettings();
        return;
    }

    // 3. Determine workspace directory to mount as DOS drive D:
    let workspaceHostDir = (getSetting('workspacePath', '') || '').trim();
    if (workspaceHostDir) {
        workspaceHostDir = expandHomeDir(workspaceHostDir);
        if (!fs.existsSync(workspaceHostDir)) {
            vscode.window.showErrorMessage(`Configured workspacePath does not exist: ${workspaceHostDir}`);
            return;
        }
    } else {
        workspaceHostDir = path.dirname(filePath);
    }

    const originalFileName = path.basename(filePath);

    // 4. Automatically prompt user with VS Code Input UI when input is needed
    const scriptCode = document.getText();
    const detectedInputs = detectScriptInputs(scriptCode);
    const autoPromptSetting = getSetting('autoPromptInput', true);

    if (shouldPromptForInput(detectedInputs, options, autoPromptSetting)) {
        let initialVal = currentCustomInput;
        if (!initialVal) {
            const candidateIn = path.join(workspaceHostDir, 'TC_IN.TXT');
            const candidateInput = path.join(workspaceHostDir, 'input.txt');
            if (fs.existsSync(candidateIn)) {
                try { initialVal = fs.readFileSync(candidateIn, 'utf8').trim(); } catch (_) {}
            } else if (fs.existsSync(candidateInput)) {
                try { initialVal = fs.readFileSync(candidateInput, 'utf8').trim(); } catch (_) {}
            }
        }

        let promptMsg = '';
        let placeholderMsg = '';
        if (detectedInputs.length === 1) {
            const d = detectedInputs[0];
            promptMsg = d.label ? `${d.label} [variable: ${d.variable}]` : `Enter value for ${d.variable}:`;
            placeholderMsg = d.placeholder || `Value for ${d.variable}`;
        } else {
            const varNames = detectedInputs.map(d => d.variable).join(', ');
            promptMsg = `Program needs ${detectedInputs.length} inputs (${varNames}). Use space or \\n between values:`;
            const sampleExamples = detectedInputs.map((d, i) => d.placeholder ? d.placeholder.replace('Value for ', '') : `val${i + 1}`).slice(0, 3).join(' ');
            placeholderMsg = `e.g. ${sampleExamples || '10 + 5'}`;
        }

        const userInput = await vscode.window.showInputBox({
            title: `TurboVs: Input for ${originalFileName}`,
            prompt: promptMsg,
            value: initialVal ? initialVal.replace(/\r?\n/g, '\\n') : '',
            placeHolder: placeholderMsg,
            ignoreFocusOut: true
        });

        // User pressed Escape / cancelled the input box
        if (userInput === undefined) {
            vscode.window.showInformationMessage('TurboVs: Run cancelled.');
            return;
        }

        const formattedInput = formatUserInputString(userInput, detectedInputs);
        currentCustomInput = formattedInput;
        syncInputToDisk(formattedInput);

        if (ioWebviewPanel) {
            ioWebviewPanel.webview.postMessage({ command: 'setInput', text: formattedInput });
        }
    }

    // 5. Handle DOS 8.3 filename compatibility
    let targetDosFileName = originalFileName;
    let isTempAlias = false;
    let tempAliasPath = null;

    if (isDos83Name(originalFileName)) {
        targetDosFileName = originalFileName.toUpperCase();
    } else {
        // Name contains spaces or is longer than 8 characters.
        // Create an 8.3 compliant copy: "TC_RUN.CPP"
        isTempAlias = true;
        const safeExt = fileExt === '.c' ? '.C' : '.CPP';
        targetDosFileName = `TC_RUN${safeExt}`;
        tempAliasPath = path.join(workspaceHostDir, targetDosFileName);

        try {
            fs.copyFileSync(filePath, tempAliasPath);
            activeTempFiles.push(tempAliasPath);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to create DOS 8.3 temporary source copy: ${err.message}`);
            return;
        }
    }

    const targetDosBase = path.basename(targetDosFileName, path.extname(targetDosFileName));
    const targetDosExe = `${targetDosBase}.EXE`;
    const hostErrLog = path.join(workspaceHostDir, 'TC_ERR.LOG');

    // Remove old error log and old executable if present
    try {
        if (fs.existsSync(hostErrLog)) fs.unlinkSync(hostErrLog);
        const hostExePath = path.join(workspaceHostDir, targetDosExe);
        if (fs.existsSync(hostExePath)) fs.unlinkSync(hostExePath);
    } catch (_) {}

    // 6. Memory model flag
    let memoryModelSetting = getSetting('memoryModel', 'default');
    let memoryModelFlag = '';
    if (memoryModelSetting.includes('-m')) {
        const match = memoryModelSetting.match(/-m[a-z]/i);
        if (match) memoryModelFlag = match[0];
    }

    // 7. Generate custom DOSBox configuration
    const closeOnExit = getSetting('closeOnExit', true);
    const windowResolution = getSetting('windowResolution', '1024x768');
    const isFullscreen = windowResolution === 'fullscreen';
    const resolution = isFullscreen ? 'original' : windowResolution;
    const disableAudio = getSetting('disableAudio', true);

    const compilerMount = formatMountPath(env.compiler.rootPath);
    const workspaceMount = formatMountPath(workspaceHostDir);

    executionStartTime = Date.now();

    // Determine input to pass to stdin
    let inputVal = currentCustomInput;
    if (!inputVal) {
        const candidateIn = path.join(workspaceHostDir, 'TC_IN.TXT');
        const candidateInput = path.join(workspaceHostDir, 'input.txt');
        if (fs.existsSync(candidateIn)) {
            try {
                const text = fs.readFileSync(candidateIn, 'utf8').trim();
                if (text) inputVal = text;
            } catch (_) {}
        }
        if (!inputVal && fs.existsSync(candidateInput)) {
            try {
                const text = fs.readFileSync(candidateInput, 'utf8').trim();
                if (text) inputVal = text;
            } catch (_) {}
        }
        if (!inputVal) {
            inputVal = getSetting('defaultInput', '');
        }
        // If still no input configured, but script has detected inputs, generate safe default values so program doesn't hang
        if (!inputVal && detectedInputs.length > 0) {
            inputVal = detectedInputs.map(item => item.defaultValue || '0').join('\n');
            currentCustomInput = inputVal;
        }
    }

    const hostInTxt = path.join(workspaceHostDir, 'TC_IN.TXT');
    const hostOutLog = path.join(workspaceHostDir, 'TC_OUT.LOG');
    const hostBuildLog = path.join(workspaceHostDir, 'TC_BUILD.LOG');
    try {
        const dosInput = (inputVal || '').replace(/\r?\n/g, '\r\n') + '\r\n';
        fs.writeFileSync(hostInTxt, dosInput, 'utf8');
        activeTempFiles.push(hostInTxt);
        if (fs.existsSync(hostOutLog)) fs.unlinkSync(hostOutLog);
        if (fs.existsSync(hostBuildLog)) fs.unlinkSync(hostBuildLog);
    } catch (_) {}

    if (ioWebviewPanel) {
        ioWebviewPanel.webview.postMessage({
            command: 'setRunning',
            running: true,
            fileName: originalFileName,
            detected: detectedInputs
        });
    }

    const confContent = `
[sdl]
fullscreen=false
fulldouble=false
windowresolution=${resolution}
output=surface
autolock=true

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

[dos]
xms=true
ems=true
umb=true

[autoexec]
@echo off
mount c "${compilerMount}"
mount d "${workspaceMount}"
c:
cd BIN
TCC -IC:\\INCLUDE -LC:\\LIB -IC:\\TC\\INCLUDE -LC:\\TC\\LIB ${memoryModelFlag} D:\\${targetDosFileName} > D:\\TC_BUILD.LOG
if errorlevel 1 goto error
${targetDosBase}.EXE > D:\\TC_OUT.LOG < D:\\TC_IN.TXT
goto done
:error
echo [TurboVs] Compilation Failed! > D:\\TC_OUT.LOG
type D:\\TC_BUILD.LOG >> D:\\TC_OUT.LOG
:done
exit
`.trim();

    const tempConfPath = path.join(os.tmpdir(), `dosbox_turbovs_${Date.now()}.conf`);
    try {
        fs.writeFileSync(tempConfPath, confContent, 'utf8');
        activeTempFiles.push(tempConfPath);
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to write TurboVs runner configuration: ${err.message}`);
        return;
    }

    // 7. Setup VS Code Integrated Terminal using Pseudoterminal (only pure script output, zero bash/cmd noise)
    const terminal = ensurePtyTerminal();
    if (getSetting('autoClearTerminal', true) && ptyWriteEmitter) {
        ptyWriteEmitter.fire('\x1b[2J\x1b[0;0H');
    }
    terminal.show(true);

    // 8. Build launch command line with all DOSBox banners silenced (> /dev/null 2>&1)
    const extraArgs = (getSetting('dosboxArgs', '') || '').trim();
    let dosboxExec = `"${env.dosbox.path}" -conf "${tempConfPath}" -exit`;
    if (extraArgs) {
        dosboxExec += ` ${extraArgs}`;
    }

    let launchCmd = '';
    if (process.platform === 'win32') {
        launchCmd = `${dosboxExec} >nul 2>&1`;
    } else {
        const hasXvfb = cp.spawnSync('which', ['xvfb-run']).status === 0;
        const prefix = hasXvfb ? 'xvfb-run -a ' : '';
        launchCmd = `SDL_AUDIODRIVER=dummy ALSA_CARD=none ${prefix}${dosboxExec} >/dev/null 2>&1`;
    }

    // 9. Update state & status bar
    isProgramRunning = true;
    updateStatusBar();

    // 10. Execute in background process so terminal is not cluttered with bash commands
    const execTimeoutSec = getSetting('executionTimeout', 15);
    activeProcess = cp.exec(launchCmd, {
        env: {
            ...process.env,
            SDL_AUDIODRIVER: 'dummy',
            ALSA_CARD: 'none',
            DISPLAY: process.env.DISPLAY || ':0'
        },
        timeout: (execTimeoutSec + 5) * 1000,
        windowsHide: true
    }, (err) => {
        activeProcess = null;
    });

    // 11. Monitor compilation logs & update Diagnostics in VS Code editor
    monitorCompilation(workspaceHostDir, document, isTempAlias ? targetDosFileName : originalFileName, context);
}

/**
 * Periodically monitor error log to report diagnostics and output to VS Code
 */
function monitorCompilation(workspaceDir, document, compiledName, context) {
    const logFile = path.join(workspaceDir, 'TC_OUT.LOG');
    let attempts = 0;
    const timeoutSec = getSetting('executionTimeout', 15);
    const maxAttempts = Math.ceil((timeoutSec * 1000) / 300);
    let handled = false;

    const timer = setInterval(() => {
        attempts++;

        if (fs.existsSync(logFile)) {
            try {
                const content = fs.readFileSync(logFile, 'utf8');
                if (content.length > 0) {
                    clearInterval(timer);
                    handled = true;
                    const elapsedMs = Date.now() - executionStartTime;
                    const elapsedSec = (elapsedMs / 1000).toFixed(2);
                    lastProgramOutput = content;
                    const isError = content.includes('[TurboVs] Compilation Failed!');

                    // Format clean output for terminal (\r\n)
                    const termContent = content.replace(/\r?\n/g, '\r\n');
                    if (ptyWriteEmitter) {
                        ptyWriteEmitter.fire(termContent + (termContent.endsWith('\r\n') ? '' : '\r\n'));
                    } else if (ptyTerminal && typeof ptyTerminal.sendText === 'function') {
                        ptyTerminal.sendText(content);
                    }

                    // Output to OutputChannel
                    const outChan = getOutputChannel();
                    outChan.clear();
                    outChan.append(content);

                    // Output to Webview Panel
                    if (ioWebviewPanel) {
                        ioWebviewPanel.webview.postMessage({
                            command: 'setOutput',
                            text: content,
                            status: isError ? 'error' : 'success',
                            duration: elapsedSec,
                            fileName: compiledName
                        });
                    }

                    parseCompilerOutput(content, document, compiledName);
                    return;
                }
            } catch (_) {}
        }

        if (attempts >= maxAttempts) {
            clearInterval(timer);
            if (!handled) {
                diagnosticCollection.set(document.uri, []);
                const timeoutMsg = `[TurboVs] Execution timed out after ${timeoutSec} seconds. (Infinite loop or waiting for input?)`;
                if (ptyWriteEmitter) {
                    ptyWriteEmitter.fire(`\r\n${timeoutMsg}\r\n`);
                }
                const outChan = getOutputChannel();
                outChan.appendLine(timeoutMsg);
                if (ioWebviewPanel) {
                    ioWebviewPanel.webview.postMessage({
                        command: 'setOutput',
                        text: timeoutMsg,
                        status: 'error',
                        duration: `${timeoutSec}.00`,
                        fileName: compiledName
                    });
                }
            }
            isProgramRunning = false;
            updateStatusBar();
        }
    }, 300);
}

/**
 * Parse Turbo C++ compiler output lines and generate VS Code diagnostics
 */
function parseCompilerOutput(logContent, document, compiledName) {
    const diagnostics = [];
    const lines = logContent.split(/\r?\n/);
    const errorRegex = /^(Error|Warning)\s+(.+?)\s+(\d+):\s*(.+)$/i;

    let errorCount = 0;
    let warningCount = 0;

    for (const line of lines) {
        const match = line.match(errorRegex);
        if (match) {
            const severityStr = match[1].toLowerCase();
            const lineNum = parseInt(match[3], 10) - 1; // 0-based
            const message = match[4].trim();

            const severity = severityStr === 'warning'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Error;

            if (severity === vscode.DiagnosticSeverity.Error) errorCount++;
            else warningCount++;

            const safeLine = Math.max(0, Math.min(lineNum, document.lineCount - 1));
            const range = document.lineAt(safeLine).range;

            const diag = new vscode.Diagnostic(range, `[TurboVs] ${message}`, severity);
            diag.source = 'TurboVs (TCC)';
            diagnostics.push(diag);
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);

    if (errorCount > 0) {
        vscode.window.showErrorMessage(`TurboVs: Build failed with ${errorCount} error(s) and ${warningCount} warning(s). Check editor lines or terminal.`);
    } else if (warningCount > 0) {
        vscode.window.showWarningMessage(`TurboVs: Build succeeded with ${warningCount} warning(s).`);
    } else {
        diagnosticCollection.set(document.uri, []);
    }

    isProgramRunning = false;
    updateStatusBar();
}

/**
 * Command: Open active file directly inside classic Turbo C++ IDE (TC.EXE)
 * @param {vscode.ExtensionContext} context
 */
async function openTurboCppIde(context) {
    const editor = vscode.window.activeTextEditor;
    let originalFileName = '';
    let workspaceHostDir = '';

    if (editor) {
        if (editor.document.isDirty) {
            await editor.document.save();
        }
        originalFileName = path.basename(editor.document.fileName);
        workspaceHostDir = path.dirname(editor.document.fileName);
    }

    const env = inspectEnvironment();
    if (!env.dosbox.valid) {
        vscode.window.showErrorMessage(`DOSBox not found: ${env.dosbox.error}`);
        return;
    }
    if (!env.compiler.valid) {
        vscode.window.showErrorMessage(`Turbo C++ directory not found: ${env.compiler.error}`);
        return;
    }

    if (!workspaceHostDir) {
        workspaceHostDir = (getSetting('workspacePath', '') || '').trim();
        if (workspaceHostDir) {
            workspaceHostDir = expandHomeDir(workspaceHostDir);
        } else {
            workspaceHostDir = os.homedir();
        }
    }

    const compilerMount = formatMountPath(env.compiler.rootPath);
    const workspaceMount = formatMountPath(workspaceHostDir);

    let tcArgs = '';
    if (originalFileName && isDos83Name(originalFileName)) {
        tcArgs = `D:\\${originalFileName.toUpperCase()}`;
    }

    const confContent = `
[sdl]
fullscreen=false
windowresolution=1024x768
output=surface
autolock=true

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
mount c "${compilerMount}"
mount d "${workspaceMount}"
c:
set PATH=C:\\BIN;%PATH%
d:
cls
echo Starting Turbo C++ IDE via TurboVs...
tc.exe ${tcArgs}
exit
`.trim();

    const tempConfPath = path.join(os.tmpdir(), `dosbox_turbovs_ide_${Date.now()}.conf`);
    try {
        fs.writeFileSync(tempConfPath, confContent, 'utf8');
        activeTempFiles.push(tempConfPath);
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to create IDE runner config: ${err.message}`);
        return;
    }

    let terminal = vscode.window.terminals.find(t => t.name === 'TurboVs');
    if (!terminal) {
        terminal = vscode.window.createTerminal({
            name: 'TurboVs',
            iconPath: new vscode.ThemeIcon('terminal'),
            env: {
                DISPLAY: process.env.DISPLAY || ':0',
                SDL_AUDIODRIVER: 'dummy',
                ALSA_CARD: 'none'
            }
        });
    }
    terminal.show(true);
    terminal.sendText(`echo "[TurboVs] Launching Turbo C++ IDE in DOSBox..."`);

    let launchCmd = `"${env.dosbox.path}" -conf "${tempConfPath}"`;
    if (process.platform === 'win32') {
        launchCmd = `${launchCmd} 2>nul`;
    } else {
        const displayEnv = process.env.DISPLAY || ':0';
        launchCmd = `SDL_AUDIODRIVER=dummy ALSA_CARD=none DISPLAY="${displayEnv}" ${launchCmd} 2>/dev/null`;
    }
    terminal.sendText(launchCmd);
}

/**
 * Command: Stop Turbo C++ / DOSBox process
 */
async function stopTurboCpp() {
    if (activeProcess) {
        try {
            activeProcess.kill('SIGKILL');
        } catch (_) {}
        activeProcess = null;
    }

    // 1. Send Ctrl+C or stop notification to terminal
    const terminal = vscode.window.terminals.find(t => t.name === 'TurboVs');
    if (terminal && !ptyWriteEmitter) {
        terminal.sendText('\x03'); // Send SIGINT
    }
    if (ptyWriteEmitter) {
        ptyWriteEmitter.fire('\r\n[TurboVs] Execution stopped.\r\n');
    }

    // 2. Kill DOSBox process
    const isWin = process.platform === 'win32';
    try {
        if (isWin) {
            cp.execSync('taskkill /F /IM dosbox.exe /IM dosbox-x.exe', { stdio: 'ignore' });
        } else {
            cp.execSync('killall -9 dosbox dosbox-x 2>/dev/null || pkill -9 -f dosbox || true', { stdio: 'ignore', shell: true });
        }
        vscode.window.showInformationMessage('TurboVs: DOSBox process stopped.');
    } catch (_) {
        vscode.window.showInformationMessage('TurboVs: Sent termination signal.');
    }

    isProgramRunning = false;
    updateStatusBar();
}

/**
 * Clean up all registered temporary runner files
 */
function cleanupTempFiles() {
    for (const file of activeTempFiles) {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (_) {}
    }
    activeTempFiles = [];
}

module.exports = {
    activate,
    deactivate,
    inspectEnvironment,
    resolveDosboxPath,
    resolveTurboCppPath,
    validateTurboCppDir,
    isDos83Name,
    formatMountPath,
    parseCompilerOutput,
    getSetting,
    openIoPanel,
    openInputPanel,
    checkScriptInputsPrompt,
    detectScriptInputs,
    setInputPrompt,
    getIoWebviewHtml,
    escapeHtml,
    ensurePtyTerminal,
    runTurboCpp,
    shouldPromptForInput,
    formatUserInputString
};
