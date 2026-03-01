import * as vscode from 'vscode';
import { runLoadTest, stopLoadTest } from './commands/run-load-test';

export function activate(context: vscode.ExtensionContext) {

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

	context.subscriptions.push(
		vscode.commands.registerCommand('loadforge.stopLoadTest', () => {
			stopLoadTest();
		})
	);

}

export function deactivate() {
}
