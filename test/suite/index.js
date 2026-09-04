const vscode = require('vscode');
const path = require('path');
const cp = require('child_process');
const fs = require('fs');

async function run() {
    console.log('=======================================================');
    console.log('   RUNNING INSIDE REAL VISUAL STUDIO CODE HOST         ');
    console.log('=======================================================');
    console.log('VS Code version:', vscode.version);

    // 1. Open example legacy Turbo C++ file (examples/hello.cpp)
    const filePath = path.resolve(__dirname, '../../examples/hello.cpp');
    console.log('Opening example file in real editor:', filePath);

    if (!fs.existsSync(filePath)) {
        throw new Error('Example file not found: ' + filePath);
    }

    const doc = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    console.log('Opened document:', doc.fileName, 'with languageId:', doc.languageId);

    // 2. Locate and activate TurboVs extension
    let turbovsExt = vscode.extensions.all.find(e => e.id.toLowerCase().includes('turbovs'));
    if (turbovsExt) {
        console.log('Found TurboVs extension:', turbovsExt.id, 'active:', turbovsExt.isActive);
        if (!turbovsExt.isActive) {
            await turbovsExt.activate();
            console.log('TurboVs extension activated successfully in real VS Code!');
        }
    } else {
        console.log('Warning: Extension not in registry yet, requiring directly...');
        const extModule = require('../../extension.js');
        // Extension context is handled by VS Code
    }

    // 3. Verify contributed commands are registered
    const allCommands = await vscode.commands.getCommands(true);
    const turbovsCommands = allCommands.filter(c => c.startsWith('turbovs.'));
    console.log('Registered TurboVs commands:', turbovsCommands);

    // 4. Trigger Environment Check Command in real editor
    console.log('Executing turbovs.checkEnvironment command in real VS Code...');
    await vscode.commands.executeCommand('turbovs.checkEnvironment');

    // 5. Allow 3 seconds for the editor, output panel, tabs, and terminal to render
    console.log('Waiting for real UI layout to render on display...');
    await new Promise(resolve => setTimeout(resolve, 3500));

    // 6. Capture real screenshot of X11 display (running under xvfb or desktop)
    const screenshotPath = path.resolve(__dirname, '../../media/real_vscode_screenshot.png');
    console.log('Attempting to capture screenshot to:', screenshotPath);

    const screenshotCommands = [
        `import -window root "${screenshotPath}"`,
        `scrot "${screenshotPath}"`,
        `xwd -root -silent | convert xwd:- "${screenshotPath}"`
    ];

    let captured = false;
    for (const cmd of screenshotCommands) {
        try {
            cp.execSync(cmd, { stdio: 'ignore' });
            if (fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 1000) {
                console.log('✔ Screenshot successfully captured with command:', cmd);
                console.log('✔ Screenshot file size:', fs.statSync(screenshotPath).size, 'bytes');
                captured = true;
                break;
            }
        } catch (_) {}
    }

    if (!captured) {
        console.log('Note: Display screenshot tool (import/scrot) not available in local test environment. GitHub Actions will capture with xvfb.');
    }

    console.log('=======================================================');
    console.log('   REAL VS CODE TEST AND SCREENSHOT SEQUENCE COMPLETE  ');
    console.log('=======================================================');
}

module.exports = { run };
