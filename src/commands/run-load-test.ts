import * as vscode from 'vscode';

let terminal: vscode.Terminal | null = null;

function getBinaryPath(): string {
    const binaryName = process.platform === 'win32' ? 'loadforge.exe' : 'loadforge';
    const binaryPathLinux = vscode.extensions.getExtension('siit-na-kvadrat.loadforge')?.extensionPath + '/bin/' + binaryName;
    const binaryPathWindows = vscode.extensions.getExtension('siit-na-kvadrat.loadforge')?.extensionPath + '\\bin\\' + binaryName;
    return process.platform === 'win32' ? binaryPathWindows : binaryPathLinux;
}

function generateCommand(binaryPath: string, args: string[]) {
    if (process.platform === 'win32') {
        const cmd = `& "${binaryPath}" ${args.map(a => `"${a}"`).join(" ")}`;
        return cmd;
    }
    return `${binaryPath} ${args.map(a => `"${a}"`).join(" ")}`;
}

async function collectEnvironmentFilePaths(): Promise<string[]> {
    const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a folder in VS Code.');
        return [];
    }
    const searchPattern = new vscode.RelativePattern(rootPath, '**/*.env');
    const files = await vscode.workspace.findFiles(searchPattern);
    return files.map(file => file.fsPath);
}

async function promptForEnvironmentFile(envFilePaths: string[]): Promise<string | undefined> {
    if (envFilePaths.length === 0) {
        vscode.window.showErrorMessage('No .env files found in the workspace.');
        return undefined;
    }

    if (envFilePaths.length === 1) {
        return envFilePaths[0];
    }

    const envFileOptions = envFilePaths.map(path => ({ label: vscode.workspace.asRelativePath(path), description: path }));
    const selectedEnvFile = vscode.window.showQuickPick(envFileOptions, {
        placeHolder: 'Select an environment file to use for the load test',
        canPickMany: false
    });
    const result = await selectedEnvFile;

    if (result) {
        // Find the full path corresponding to the selected label
        const fullPath = envFilePaths.find(path => vscode.workspace.asRelativePath(path) === result.label);
        return fullPath;
    }
    return undefined;
}

function _runLoadTest(lfFilePath: string, envFilePath: string | undefined) {
    const args = [lfFilePath];
    if (envFilePath) {
        args.push(envFilePath);
    }

    const binaryPath = getBinaryPath();
    invokeBinaryExecution(binaryPath, args);
}

function invokeBinaryExecution(binaryPath: string, args: string[]) {
    // find terminal with name "LoadForge" or create a new one with debug icon
    terminal = vscode.window.terminals.find(t => t.name === 'LoadForge') || vscode.window.createTerminal({ name: 'LoadForge', iconPath: new vscode.ThemeIcon('beaker') });
    terminal.show();
    const cmd = generateCommand(binaryPath, args);
    terminal.sendText(cmd);
}

export async function runLoadTest(lfFilePath: string) {
    const envFilePaths = await collectEnvironmentFilePaths();
    const selectedEnvFile = await promptForEnvironmentFile(envFilePaths);
    _runLoadTest(lfFilePath, selectedEnvFile);
}

export function stopLoadTest() {
    terminal?.sendText('\x03'); // Send Ctrl+C to stop the process
}