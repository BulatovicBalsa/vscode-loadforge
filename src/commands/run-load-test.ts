import * as vscode from 'vscode';
import { updateIsRunningState } from './running-context';
import { LoadforgePanel } from '../loadforgePanel';
import { spawn, spawnSync } from 'child_process';
import { getLoadforgeBinaryPath } from '../runtime-manager';

let proc: ReturnType<typeof spawn> | undefined;
let panel: LoadforgePanel;
let stopTimer: NodeJS.Timeout | undefined;

type LoadforgeInfo = {
    env: boolean;
    userlist: boolean;
    name?: string;
};

function clearStopTimer() {
    if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = undefined;
    }
}

async function collectFilePaths(extension: string): Promise<string[]> {
    const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a folder in VS Code.');
        return [];
    }
    const searchPattern = new vscode.RelativePattern(rootPath, `**/*.${extension}`);
    const files = await vscode.workspace.findFiles(searchPattern);
    return files.map(file => file.fsPath);
}

async function pickFile(filePaths: string[], extension: string): Promise<string | undefined> {
    if (filePaths.length === 0) {
        vscode.window.showErrorMessage(`No .${extension} files found in the workspace.`);
        return undefined;
    }

    if (filePaths.length === 1) {
        return filePaths[0];
    }

    const fileOptions = filePaths.map(path => ({ label: vscode.workspace.asRelativePath(path), description: path }));
    const selectedFile = vscode.window.showQuickPick(fileOptions, {
        placeHolder: `Select an .${extension} file to use for the load test`,
        canPickMany: false
    });
    const result = await selectedFile;

    if (result) {
        const fullPath = filePaths.find(path => vscode.workspace.asRelativePath(path) === result.label);
        return fullPath;
    }
    return undefined;
}

function _runLoadTest(lfFilePath: string, envFilePath: string | undefined, ulfFilePath: string | undefined) {
    void executeLoadTest(lfFilePath, envFilePath, ulfFilePath);
}

async function executeLoadTest(lfFilePath: string, envFilePath: string | undefined, ulfFilePath: string | undefined) {
    try {
        const args = [lfFilePath];
        if (envFilePath) {
            args.push(envFilePath);
        }

        if (ulfFilePath) {
            args.push(ulfFilePath);
        }

        // Enable backend stdin control command (STOP\n).
        args.push('--control-stdin');

        const binaryPath = await getLoadforgeBinaryPath();
        invokeBinaryExecution(binaryPath, args);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start LoadForge: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function invokeBinaryExecution(binaryPath: string, args: string[]) {
    updateIsRunningState(true);
    clearStopTimer();

    proc = spawn(binaryPath, args, {
        env: { ...process.env, FORCE_COLOR: '1', CLICOLOR: '1', TERM: 'xterm-256color' },
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.stdout?.setEncoding('utf8');
    proc.stderr?.setEncoding('utf8');

    proc.stdout?.on('data', (s) => panel.append(s));
    proc.stderr?.on('data', (s) => panel.append(s));

    proc.on('close', () => {
        clearStopTimer();
        updateIsRunningState(false);
        proc = undefined;
    });

    proc.on('error', (err) => {
        clearStopTimer();
        panel.append(`\n\x1b[31m[spawn error]\x1b[0m ${String(err)}\n`);
        updateIsRunningState(false);
        proc = undefined;
    });
}

function parseLoadforgeInfo(raw: string): LoadforgeInfo | undefined {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return undefined;
        }

        const info = parsed as Partial<LoadforgeInfo>;
        if (typeof info.env !== 'boolean' || typeof info.userlist !== 'boolean') {
            return undefined;
        }

        if (info.name !== undefined && typeof info.name !== 'string') {
            return undefined;
        }

        return {
            env: info.env,
            userlist: info.userlist,
            name: info.name
        };
    } catch {
        return undefined;
    }
}

export async function runLoadTest(lfFilePath: string, loadforgePanel: LoadforgePanel) {
    panel = loadforgePanel;
    panel.clear();
    await vscode.commands.executeCommand(
        "workbench.view.extension.loadforge-panel"
    );

    const loadforgeInfo = await getLoadforgeInfoAsync(lfFilePath);
    if (!loadforgeInfo) {
        return;
    }

    let selectedEnvFile = undefined;
    if (loadforgeInfo.env) {
        const envFilePaths = await collectFilePaths('env');
        selectedEnvFile = await pickFile(envFilePaths, 'env');
    }

    let selectedUlfFile = undefined;
    if (loadforgeInfo.userlist) {
        const ulfFilePaths = await collectFilePaths('ulf');
        selectedUlfFile = await pickFile(ulfFilePaths, 'ulf');
    }

    _runLoadTest(lfFilePath, selectedEnvFile, selectedUlfFile);
}

async function getLoadforgeInfoAsync(lfFilePath: string): Promise<LoadforgeInfo | undefined> {
    const binaryPath = await getLoadforgeBinaryPath();
    const args = [lfFilePath, '--info'];
    const result = spawnSync(binaryPath, args, { encoding: 'utf8' });
    if (result.status !== 0) {
        vscode.window.showErrorMessage(`Failed to read LoadForge test info: ${result.error?.message || result.stderr || 'Unknown error'}`);
        return undefined;
    }

    const info = parseLoadforgeInfo(result.stdout.trim());
    if (!info) {
        vscode.window.showErrorMessage('Failed to parse LoadForge test info.');
        return undefined;
    }

    return info;
}

export function stopLoadTest() {
    if (!proc) {
        return;
    }

    const p = proc;
    let gracefulRequested = false;

    // First try cooperative stop via stdin control message.
    try {
        if (p.stdin && !p.stdin.destroyed) {
            p.stdin.write('STOP\n');
            gracefulRequested = true;
        }
    } catch {
        // no-op, fallback below
    }

    // POSIX fallback if stdin write is unavailable.
    if (!gracefulRequested && process.platform !== 'win32') {
        try {
            p.kill('SIGINT');
            gracefulRequested = true;
        } catch {
            // no-op, hard-kill fallback below
        }
    }

    clearStopTimer();
    stopTimer = setTimeout(() => {
        if (p.exitCode !== null) {
            return;
        }

        if (process.platform === 'win32') {
            if (typeof p.pid === 'number') {
                spawn('taskkill', ['/pid', String(p.pid), '/f', '/t']);
            }
        } else {
            try {
                p.kill('SIGKILL');
            } catch {
                // no-op
            }
        }
    }, 7000);
}
