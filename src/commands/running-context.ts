import * as vscode from 'vscode';

let isRunning = false;

export function updateIsRunningState(running: boolean) {
    isRunning = running;
    vscode.commands.executeCommand('setContext', 'loadforge.isRunning', isRunning);
    vscode.window.showInformationMessage(`Load test is now ${isRunning ? 'running' : 'stopped'}.`);
}