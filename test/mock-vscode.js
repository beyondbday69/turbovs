// Lightweight mock for vscode module during tests
const mockVscode = {
    window: {
        terminals: [],
        createTerminal: () => ({ sendText: () => {}, show: () => {} }),
        createStatusBarItem: () => ({ show: () => {}, text: '', tooltip: '' }),
        createOutputChannel: () => ({ appendLine: () => {}, clear: () => {}, show: () => {} }),
        showInformationMessage: async () => {},
        showWarningMessage: async () => {},
        showErrorMessage: async () => {},
        showQuickPick: async () => null,
        showOpenDialog: async () => null,
        showInputBox: async () => '',
        createWebviewPanel: () => ({
            webview: {
                html: '',
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
        file: (str) => ({ fsPath: str, toString: () => str })
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
