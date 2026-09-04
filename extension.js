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
    const runCmd = vscode.commands.registerCommand('turbovs.run', () => runTurboCpp(context));
    const stopCmd = vscode.commands.registerCommand('turbovs.stop', () => stopTurboCpp());
    const openIdeCmd = vscode.commands.registerCommand('turbovs.openIde', () => openTurboCppIde(context));
    const checkEnvCmd = vscode.commands.registerCommand('turbovs.checkEnvironment', () => checkEnvironment());
    const configureCmd = vscode.commands.registerCommand('turbovs.configure', () => configureSettings());
    const quickMenuCmd = vscode.commands.registerCommand('turbovs.quickMenu', () => showQuickMenu(context));
    const openIoPanelCmd = vscode.commands.registerCommand('turbovs.openIoPanel', () => openIoPanel(context));
    const setInputCmd = vscode.commands.registerCommand('turbovs.setInput', () => setInputPrompt(context));

    // Backward compatibility aliases
    const legacyRunCmd = vscode.commands.registerCommand('turboCpp.run', () => runTurboCpp(context));
    const legacyStopCmd = vscode.commands.registerCommand('turboCpp.stop', () => stopTurboCpp());
    const legacyOpenIdeCmd = vscode.commands.registerCommand('turboCpp.openIde', () => openTurboCppIde(context));
    const legacyCheckEnvCmd = vscode.commands.registerCommand('turboCpp.checkEnvironment', () => checkEnvironment());
    const legacyConfigureCmd = vscode.commands.registerCommand('turboCpp.configure', () => configureSettings());

    context.subscriptions.push(
        runCmd, stopCmd, openIdeCmd, checkEnvCmd, configureCmd, quickMenuCmd,
        openIoPanelCmd, setInputCmd,
        legacyRunCmd, legacyStopCmd, legacyOpenIdeCmd, legacyCheckEnvCmd, legacyConfigureCmd
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
            label: '$(terminal-view) Open Input / Output Panel',
            description: 'Dedicated competitive programming panel for stdin and clean stdout',
            action: 'ioPanel'
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
        case 'ioPanel':
            vscode.commands.executeCommand('turbovs.openIoPanel');
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
 * Command: Open Dedicated Input / Output Webview Panel
 * @param {vscode.ExtensionContext} context
 */
function openIoPanel(context) {
    if (ioWebviewPanel) {
        ioWebviewPanel.reveal(vscode.ViewColumn.Beside);
        return ioWebviewPanel;
    }

    ioWebviewPanel = vscode.window.createWebviewPanel(
        'turbovsIoPanel',
        'TurboVs: Input / Output',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    // If currentCustomInput is not yet set, inspect active workspace for TC_IN.TXT or input.txt
    const editor = vscode.window.activeTextEditor;
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

    ioWebviewPanel.webview.html = getIoWebviewHtml(currentCustomInput, lastProgramOutput);

    ioWebviewPanel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'run':
                vscode.commands.executeCommand('turbovs.run');
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
 * Command: Set Program Input (stdin) via quick input box
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

    const input = await vscode.window.showInputBox({
        title: 'TurboVs: Set Program Input (stdin)',
        prompt: 'Enter inputs for cin >> or scanf (use \\n to separate lines for multiple prompts)',
        value: initialVal ? initialVal.replace(/\r?\n/g, '\\n') : '',
        placeHolder: 'e.g. 10\\n+\\n5'
    });

    if (input !== undefined) {
        const normalized = input.replace(/\\n/g, '\n');
        currentCustomInput = normalized;
        syncInputToDisk(normalized);

        if (ioWebviewPanel) {
            ioWebviewPanel.webview.postMessage({ command: 'setInput', text: normalized });
        }

        const choice = await vscode.window.showInformationMessage(
            'TurboVs: Program input saved. It will be piped on next run.',
            'Open I/O Panel',
            'Run Program'
        );
        if (choice === 'Open I/O Panel') {
            openIoPanel(context);
        } else if (choice === 'Run Program') {
            vscode.commands.executeCommand('turbovs.run');
        }
    }
}

/**
 * Generate HTML for the I/O webview panel
 */
function getIoWebviewHtml(initialInput, initialOutput) {
    const escapedInput = escapeHtml(initialInput || '');
    const hasOutput = initialOutput && initialOutput.trim().length > 0;
    const escapedOutput = hasOutput ? escapeHtml(initialOutput) : 'Program output will appear here after execution...';
    const outputClass = hasOutput ? 'output-box' : 'output-box empty';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TurboVs I/O</title>
<style>
  :root {
    --bg-color: var(--vscode-editor-background, #1e1e1e);
    --fg-color: var(--vscode-editor-foreground, #d4d4d4);
    --input-bg: var(--vscode-input-background, #252526);
    --input-fg: var(--vscode-input-foreground, #cccccc);
    --input-border: var(--vscode-input-border, #3c3c3c);
    --btn-bg: var(--vscode-button-background, #0e639c);
    --btn-fg: var(--vscode-button-foreground, #ffffff);
    --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
    --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
    --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
    --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
    --border-color: var(--vscode-panel-border, #333333);
    --badge-bg: var(--vscode-badge-background, #4d4d4d);
    --badge-fg: var(--vscode-badge-foreground, #ffffff);
    --font-mono: var(--vscode-editor-font-family, 'Courier New', Courier, monospace);
    --font-sans: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  }
  body {
    background-color: var(--bg-color);
    color: var(--fg-color);
    font-family: var(--font-sans);
    margin: 0;
    padding: 14px 16px;
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
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color);
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title {
    font-size: 15px;
    font-weight: 600;
  }
  .badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--badge-bg);
    color: var(--badge-fg);
    font-weight: 500;
  }
  .badge.running {
    background: #e5a50a;
    color: #111;
  }
  .badge.success {
    background: #2ea043;
    color: #fff;
  }
  .badge.error {
    background: #f85149;
    color: #fff;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  button {
    background-color: var(--btn-bg);
    color: var(--btn-fg);
    border: none;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 3px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  button:hover {
    background-color: var(--btn-hover);
  }
  button.secondary {
    background-color: var(--btn-sec-bg);
    color: var(--btn-sec-fg);
  }
  button.secondary:hover {
    background-color: var(--btn-sec-hover);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .panels-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }
  .section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    flex-shrink: 0;
  }
  .section-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--fg-color);
    opacity: 0.9;
  }
  .section-subtitle {
    font-size: 11px;
    opacity: 0.6;
  }
  textarea {
    flex: 1;
    width: 100%;
    background-color: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 10px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.4;
    resize: none;
    box-sizing: border-box;
    outline: none;
  }
  textarea:focus {
    border-color: var(--btn-bg);
  }
  .output-box {
    flex: 1;
    width: 100%;
    background-color: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 10px;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.4;
    overflow-y: auto;
    box-sizing: border-box;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
  .output-box.empty {
    opacity: 0.5;
    font-style: italic;
  }
  .time-badge {
    font-size: 11px;
    opacity: 0.7;
    margin-left: 6px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title-group">
      <span class="title">TurboVs I/O</span>
      <span id="statusBadge" class="badge">Ready</span>
      <span id="timeBadge" class="time-badge"></span>
    </div>
    <div class="actions">
      <button id="runBtn" title="Run Current Program (Ctrl+F9)">▶ Run Program</button>
      <button id="clearInputBtn" class="secondary" title="Clear stdin input">Clear Input</button>
      <button id="clearOutputBtn" class="secondary" title="Clear stdout output">Clear Output</button>
    </div>
  </div>

  <div class="panels-container">
    <div class="section">
      <div class="section-header">
        <span class="section-title">Input (stdin)</span>
        <span class="section-subtitle">Values piped to cin / scanf (one per line)</span>
      </div>
      <textarea id="stdinInput" placeholder="Enter input values here (one per line).&#10;Example:&#10;Alice&#10;25">${escapedInput}</textarea>
    </div>

    <div class="section">
      <div class="section-header">
        <span class="section-title">Output (stdout)</span>
        <button id="copyBtn" class="secondary" style="padding: 2px 8px; font-size: 11px;">Copy Output</button>
      </div>
      <div id="stdoutOutput" class="${outputClass}">${escapedOutput}</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const stdinInput = document.getElementById('stdinInput');
    const stdoutOutput = document.getElementById('stdoutOutput');
    const statusBadge = document.getElementById('statusBadge');
    const timeBadge = document.getElementById('timeBadge');
    const runBtn = document.getElementById('runBtn');
    const clearInputBtn = document.getElementById('clearInputBtn');
    const clearOutputBtn = document.getElementById('clearOutputBtn');
    const copyBtn = document.getElementById('copyBtn');

    // Handle Tab key in textarea
    stdinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = stdinInput.selectionStart;
        const end = stdinInput.selectionEnd;
        stdinInput.value = stdinInput.value.substring(0, start) + '    ' + stdinInput.value.substring(end);
        stdinInput.selectionStart = stdinInput.selectionEnd = start + 4;
        vscode.postMessage({ command: 'updateInput', text: stdinInput.value });
      }
    });

    // Notify extension when input changes
    stdinInput.addEventListener('input', () => {
      vscode.postMessage({ command: 'updateInput', text: stdinInput.value });
    });

    runBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'run' });
    });

    clearInputBtn.addEventListener('click', () => {
      stdinInput.value = '';
      vscode.postMessage({ command: 'clearInput' });
    });

    clearOutputBtn.addEventListener('click', () => {
      stdoutOutput.textContent = 'Program output will appear here after execution...';
      stdoutOutput.classList.add('empty');
      statusBadge.textContent = 'Ready';
      statusBadge.className = 'badge';
      timeBadge.textContent = '';
      vscode.postMessage({ command: 'clearOutput' });
    });

    copyBtn.addEventListener('click', () => {
      const text = stdoutOutput.classList.contains('empty') ? '' : stdoutOutput.textContent;
      vscode.postMessage({ command: 'copyOutput', text });
    });

    // Handle incoming messages from extension
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'setInput') {
        stdinInput.value = msg.text || '';
      } else if (msg.command === 'setRunning') {
        runBtn.disabled = true;
        statusBadge.textContent = 'Running...';
        statusBadge.className = 'badge running';
        timeBadge.textContent = '';
      } else if (msg.command === 'setOutput') {
        runBtn.disabled = false;
        const text = msg.text || '';
        stdoutOutput.textContent = text;
        if (text.trim().length > 0) {
          stdoutOutput.classList.remove('empty');
        } else {
          stdoutOutput.textContent = '(Program produced no output)';
        }
        if (msg.status === 'error') {
          statusBadge.textContent = 'Compilation Failed';
          statusBadge.className = 'badge error';
        } else {
          statusBadge.textContent = 'Success';
          statusBadge.className = 'badge success';
        }
        if (msg.duration) {
          timeBadge.textContent = '⚡ ' + msg.duration + 's';
        }
      }
    });
  </script>
</body>
</html>`;
}

/**
 * Main command: Run active C/C++ program in Turbo C++ via DOSBox
 * @param {vscode.ExtensionContext} context
 */
async function runTurboCpp(context) {
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

    // 4. Handle DOS 8.3 filename compatibility
    const originalFileName = path.basename(filePath);
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

    // 5. Memory model flag
    let memoryModelSetting = getSetting('memoryModel', 'default');
    let memoryModelFlag = '';
    if (memoryModelSetting.includes('-m')) {
        const match = memoryModelSetting.match(/-m[a-z]/i);
        if (match) memoryModelFlag = match[0];
    }

    // 6. Generate custom DOSBox configuration
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
            fileName: originalFileName
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

    // 7. Setup VS Code Integrated Terminal
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

    if (getSetting('autoClearTerminal', true)) {
        terminal.sendText(process.platform === 'win32' ? 'cls' : 'clear');
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
        launchCmd = `${dosboxExec} >nul 2>&1 & if exist "${hostOutLog}" type "${hostOutLog}"`;
    } else {
        const hasXvfb = cp.spawnSync('which', ['xvfb-run']).status === 0;
        const prefix = hasXvfb ? 'xvfb-run -a ' : '';
        launchCmd = `SDL_AUDIODRIVER=dummy ALSA_CARD=none ${prefix}${dosboxExec} >/dev/null 2>&1; if [ -f "${hostOutLog}" ]; then cat "${hostOutLog}"; fi`;
    }

    // 9. Update state & status bar
    isProgramRunning = true;
    updateStatusBar();

    // 10. Execute in terminal
    terminal.sendText(launchCmd);

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
                if (ioWebviewPanel) {
                    ioWebviewPanel.webview.postMessage({
                        command: 'setOutput',
                        text: `[TurboVs] Execution timed out after ${timeoutSec} seconds. (Infinite loop or waiting for input?)`,
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
    // 1. Send Ctrl+C to terminal
    const terminal = vscode.window.terminals.find(t => t.name === 'TurboVs');
    if (terminal) {
        terminal.sendText('\x03'); // Send SIGINT
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
    setInputPrompt,
    getIoWebviewHtml,
    escapeHtml
};
