// Mock vscode module before loading extension
require('./mock-vscode.js');

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load extension functions
const ext = require('../extension.js');

console.log('--- RUNNING TURBO C++ RUNNER UNIT TESTS ---');

// Test 1: DOS 8.3 Filename validation
console.log('[Test 1] Testing isDos83Name()...');
assert.strictEqual(ext.isDos83Name('hello.cpp'), true, 'hello.cpp should be valid 8.3');
assert.strictEqual(ext.isDos83Name('HELLO.CPP'), true, 'HELLO.CPP should be valid 8.3');
assert.strictEqual(ext.isDos83Name('calc123.c'), true, 'calc123.c should be valid 8.3');
assert.strictEqual(ext.isDos83Name('my_prog.cpp'), true, 'my_prog.cpp should be valid 8.3');
assert.strictEqual(ext.isDos83Name('my program.cpp'), false, 'Spaces should not be valid 8.3');
assert.strictEqual(ext.isDos83Name('super_long_program_name.cpp'), false, 'Long names (>8 chars) should not be valid 8.3');
assert.strictEqual(ext.isDos83Name('hello.py'), false, 'Non-C/C++ extension should be invalid');
assert.strictEqual(ext.isDos83Name('hello.txt'), false, 'Non-C/C++ extension should be invalid');
console.log('  ✔ isDos83Name() passed all tests.');

// Test 2: Mount path formatting
console.log('[Test 2] Testing formatMountPath()...');
assert.strictEqual(ext.formatMountPath('/home/user/turboc3/'), '/home/user/turboc3');
assert.strictEqual(ext.formatMountPath('/home/user/turboc3///'), '/home/user/turboc3');
console.log('  ✔ formatMountPath() passed all tests.');

// Test 3: Turbo C++ Directory Validation with mock folders
console.log('[Test 3] Testing validateTurboCppDir()...');
const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-test-'));
const mockTcRoot = path.join(tempBase, 'TURBOC3');
fs.mkdirSync(path.join(mockTcRoot, 'BIN'), { recursive: true });
fs.mkdirSync(path.join(mockTcRoot, 'INCLUDE'), { recursive: true });
fs.mkdirSync(path.join(mockTcRoot, 'LIB'), { recursive: true });
fs.writeFileSync(path.join(mockTcRoot, 'BIN', 'TCC.EXE'), 'mock tcc binary');
fs.writeFileSync(path.join(mockTcRoot, 'BIN', 'TC.EXE'), 'mock tc binary');

const validRes = ext.validateTurboCppDir(mockTcRoot);
assert.strictEqual(validRes.valid, true, 'Valid mock TC dir should pass');
assert.strictEqual(validRes.hasTcc, true, 'Should find TCC.EXE');
assert.strictEqual(validRes.hasTc, true, 'Should find TC.EXE');

// Test if pointing to BIN directly correctly finds root
const binRes = ext.validateTurboCppDir(path.join(mockTcRoot, 'BIN'));
assert.strictEqual(binRes.valid, true, 'Pointing to BIN directly should resolve to root');
assert.strictEqual(binRes.rootPath, mockTcRoot);

// Test invalid directory missing LIB
const invalidTcRoot = path.join(tempBase, 'INVALID_TC');
fs.mkdirSync(path.join(invalidTcRoot, 'BIN'), { recursive: true });
fs.writeFileSync(path.join(invalidTcRoot, 'BIN', 'TCC.EXE'), 'mock tcc binary');
const invalidRes = ext.validateTurboCppDir(invalidTcRoot);
assert.strictEqual(invalidRes.valid, false, 'Missing LIB and INCLUDE should fail');

// Clean up mock dirs
fs.rmSync(tempBase, { recursive: true, force: true });
console.log('  ✔ validateTurboCppDir() passed all tests.');

// Test 4: Compiler Error Parsing regex logic
console.log('[Test 4] Testing compiler error parsing regex...');
const sampleOutput = `
Turbo C++ Version 3.00 Copyright (c) 1992 Borland International
HELLO.CPP:
Error HELLO.CPP 12: Statement missing ; in function main()
Error HELLO.CPP 14: Undefined symbol 'cout' in function main()
Warning HELLO.CPP 18: Parameter 'argc' is never used in function main()
`;

const errorRegex = /^(Error|Warning)\s+(.+?)\s+(\d+):\s*(.+)$/i;
const matches = [];
for (const line of sampleOutput.split(/\r?\n/)) {
    const m = line.match(errorRegex);
    if (m) {
        matches.push({
            type: m[1],
            file: m[2],
            line: parseInt(m[3], 10),
            msg: m[4]
        });
    }
}

assert.strictEqual(matches.length, 3, 'Should parse 3 issues (2 errors, 1 warning)');
assert.strictEqual(matches[0].type, 'Error');
assert.strictEqual(matches[0].line, 12);
assert.strictEqual(matches[0].msg, 'Statement missing ; in function main()');
assert.strictEqual(matches[1].type, 'Error');
assert.strictEqual(matches[1].line, 14);
assert.strictEqual(matches[2].type, 'Warning');
assert.strictEqual(matches[2].line, 18);
console.log('  ✔ Compiler error parsing regex passed all tests.');

// Test 5: inspectEnvironment returns structure
console.log('[Test 5] Testing inspectEnvironment()...');
const env = ext.inspectEnvironment();
assert(typeof env.dosbox === 'object', 'env.dosbox must be an object');
assert(typeof env.compiler === 'object', 'env.compiler must be an object');
console.log('  ✔ inspectEnvironment() passed.');

console.log('\n--- ALL UNIT TESTS PASSED SUCCESSFULLY! (5/5) ---');

// Test 6: getSetting fallback mechanism
console.log('[Test 6] Testing getSetting()...');
assert.strictEqual(ext.getSetting('unknownKey', 'defaultVal'), 'defaultVal');
console.log('  ✔ getSetting() fallback passed.');

// Test 7: escapeHtml and getIoWebviewHtml
console.log('[Test 7] Testing escapeHtml() and getIoWebviewHtml()...');
assert.strictEqual(ext.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(ext.escapeHtml('a & b "c" \'d\''), 'a &amp; b &quot;c&quot; &#039;d&#039;');
const html = ext.getIoWebviewHtml('10\n20', 'Result: 30');
assert(html.includes('TurboVs I/O'), 'Webview HTML must include TurboVs I/O title');
assert(html.includes('stdinInput'), 'Webview HTML must include stdinInput textarea');
assert(html.includes('stdoutOutput'), 'Webview HTML must include stdoutOutput');
assert(html.includes('Result: 30'), 'Webview HTML must contain initial output');
console.log('  ✔ getIoWebviewHtml() generated valid HTML.');

// Test 8: openIoPanel creates panel
console.log('[Test 8] Testing openIoPanel()...');
const panel = ext.openIoPanel({});
assert(panel && typeof panel.reveal === 'function', 'openIoPanel should return webview panel');
console.log('  ✔ openIoPanel() returned valid panel.');

// Test 9: detectScriptInputs() analyzing C/C++ source code
console.log('[Test 9] Testing detectScriptInputs()...');
const cppCode = `
#include <iostream.h>
#include <conio.h>
int main() {
    float a, b;
    char op;
    cout << "Enter first number: ";
    cin >> a;
    cout << "Enter operator (+, -, *, /): ";
    cin >> op;
    cout << "Enter second number: ";
    cin >> b;
    cout << "Press any key to exit...";
    getch();
    return 0;
}
`;
const detectedCpp = ext.detectScriptInputs(cppCode);
assert.strictEqual(detectedCpp.length, 4, 'Should detect 4 inputs (a, op, b, getch)');
assert.strictEqual(detectedCpp[0].variable, 'a');
assert.strictEqual(detectedCpp[0].label, 'Enter first number:');
assert.strictEqual(detectedCpp[1].variable, 'op');
assert.strictEqual(detectedCpp[1].label, 'Enter operator (+, -, *, /):');
assert.strictEqual(detectedCpp[2].variable, 'b');
assert.strictEqual(detectedCpp[2].label, 'Enter second number:');
assert.strictEqual(detectedCpp[3].type, 'getch');
assert.strictEqual(detectedCpp[3].label, 'Press any key to exit...');

// C Code with scanf
const cCode = `
#include <stdio.h>
int main() {
    int id;
    char name[50];
    printf("Enter Student ID: ");
    scanf("%d", &id);
    printf("Enter Student Name: ");
    scanf("%s", name);
    return 0;
}
`;
const detectedC = ext.detectScriptInputs(cCode);
assert.strictEqual(detectedC.length, 2, 'Should detect 2 inputs from scanf (id, name)');
assert.strictEqual(detectedC[0].variable, 'id');
assert.strictEqual(detectedC[0].label, 'Enter Student ID:');
assert.strictEqual(detectedC[1].variable, 'name');
assert.strictEqual(detectedC[1].label, 'Enter Student Name:');

// Empty script test
const noInputs = `int main() { printf("Hello World\\n"); return 0; }`;
assert.strictEqual(ext.detectScriptInputs(noInputs).length, 0, 'Script without cin/scanf should detect 0 inputs');
console.log('  ✔ detectScriptInputs() passed all tests.');

// Test 10: openInputPanel() creates dedicated separate input panel
console.log('[Test 10] Testing openInputPanel()...');
const inputPanel = ext.openInputPanel({});
assert(inputPanel && typeof inputPanel.reveal === 'function', 'openInputPanel should return webview panel');
console.log('  ✔ openInputPanel() returned valid panel.');

// Test 11: ensurePtyTerminal creates clean Pseudoterminal
console.log('[Test 11] Testing ensurePtyTerminal()...');
const term = ext.ensurePtyTerminal();
assert(term && term.name === 'TurboVs', 'ensurePtyTerminal should return terminal named TurboVs');
console.log('  ✔ ensurePtyTerminal() returned valid terminal.');

// Test 12: getIoWebviewHtml with detected inputs generates separate input fields
console.log('[Test 12] Testing getIoWebviewHtml with detected inputs...');
const htmlWithInputs = ext.getIoWebviewHtml('10\n+\n5\nq', 'Result: 15', detectedCpp, 'calc.cpp', 'form');
assert(htmlWithInputs.includes('Separate Input Fields'), 'Must include Separate Input Fields tab');
assert(htmlWithInputs.includes('calc.cpp'), 'Must include active file name badge');
assert(htmlWithInputs.includes('4 Inputs'), 'Must indicate 4 inputs detected');
assert(htmlWithInputs.includes('stdinInput'), 'Must include raw multiline textarea fallback');
assert(htmlWithInputs.includes('Result: 15'), 'Must include output');
console.log('  ✔ getIoWebviewHtml with separate inputs generated valid UI.');

console.log('\n--- ALL UNIT TESTS (12/12) PASSED SUCCESSFULLY! ---');
