// Lightweight mock for vscode module during tests
const mockVscode = {
    window: {
        terminals: [],
        createTerminal: (options) => {
            const t = {
                name: typeof options === 'string' ? options : (options && options.name ? options.name : 'Terminal'),
                sendText: () => {},
                show: () => {},
                dispose: () => {}
            };
            mockVscode.window.terminals.push(t);
            return t;
        },
        createStatusBarItem: () => ({ show: () => {}, text: '', tooltip: '' }),
        createOutputChannel: () => ({ appendLine: () => {}, clear: () => {}, show: () => {} }),
        showInformationMessage: async () => {},
        showWarningMessage: async () => {},
        showErrorMessage: async () => {},
        showQuickPick: async () => null,
        showOpenDialog: async () => null,
        showInputBox: async () => '',
        createInputBox: () => ({
            title: '',
            step: 1,
            totalSteps: 1,
            prompt: '',
            placeholder: '',
            value: '',
            ignoreFocusOut: true,
            show: () => {},
            hide: () => {},
            dispose: () => {},
            onDidAccept: () => ({ dispose: () => {} }),
            onDidHide: () => ({ dispose: () => {} })
        }),
        createWebviewPanel: () => ({
            webview: {
                html: '',
                cspSource: 'https://*.vscode-cdn.net',
                asWebviewUri: (uri) => uri,
                postMessage: () => {},
                onDidReceiveMessage: () => ({ dispose: () => {} })
            },
            reveal: () => {},
            onDidDispose: () => ({ dispose: () => {} }),
            dispose: () => {}
        })
    },
    ViewColumn: { Beside: -2, One: 1, Two: 2 },
    env: {
        openExternal: async () => {},
        clipboard: {
            writeText: async () => {},
            readText: async () => ''
        }
    },
    workspace: {
        getConfiguration: () => ({
            get: (key, def) => def,
            update: async () => {}
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} })
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: async () => {}
    },
    languages: {
        createDiagnosticCollection: () => ({
            set: () => {},
            clear: () => {},
            dispose: () => {}
        })
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    ThemeColor: class { constructor(id) { this.id = id; } },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    Diagnostic: class {
        constructor(range, message, severity) {
            this.range = range;
            this.message = message;
            this.severity = severity;
        }
    },
    Range: class {
        constructor(startLine, startCol, endLine, endCol) {
            this.start = { line: startLine, character: startCol };
            this.end = { line: endLine, character: endCol };
        }
    },
    Uri: {
        parse: (str) => ({ fsPath: str, toString: () => str }),
        file: (str) => ({ fsPath: str, toString: () => str }),
        joinPath: (base, ...segments) => {
            const p = require('path');
            const joined = p.join(base.fsPath || base.toString(), ...segments);
            return { fsPath: joined, toString: () => joined };
        }
    },
    EventEmitter: class {
        constructor() {
            this.event = (listener) => { this.listener = listener; return { dispose: () => {} }; };
        }
        fire(data) {
            if (this.listener) this.listener(data);
        }
    }
};

const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function(modPath) {
    if (modPath === 'vscode') {
        return mockVscode;
    }
    return origRequire.apply(this, arguments);
};

module.exports = mockVscode;
