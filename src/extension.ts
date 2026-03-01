import * as vscode from 'vscode';
import { runLoadTest } from './commands/run-load-test';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "loadforge" is now active!');

	context.subscriptions.push(
		vscode.commands.registerCommand('loadforge.runLoadTest', async (explorerUri?: vscode.Uri) => {
			if (explorerUri) {
				runLoadTest(explorerUri.fsPath);
				return;
			}
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const document = editor.document;
				runLoadTest(document.uri.fsPath);
				return;
			}
		}
	));
}

export function deactivate() {
}
