const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        console.log('--- Launching Real VS Code with @vscode/test-electron ---');
        const extensionDevelopmentPath = path.resolve(__dirname, '../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const testWorkspace = path.resolve(__dirname, '../examples');

        // Launch real VS Code with custom window size
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                testWorkspace,
                '--disable-gpu',
                '--disable-telemetry',
                '--disable-updates',
                '--window-size=1280,800'
            ]
        });

        console.log('--- Real VS Code execution finished successfully ---');
    } catch (err) {
        console.error('Failed to run real VS Code:', err);
        process.exit(1);
    }
}

main();
