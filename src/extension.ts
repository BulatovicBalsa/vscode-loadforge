import * as vscode from 'vscode';
import { runLoadTest, stopLoadTest } from './commands/run-load-test';
import { LoadforgePanel } from './loadforgePanel';

export function activate(context: vscode.ExtensionContext) {

	const panel = new LoadforgePanel();

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			LoadforgePanel.viewType,
			panel
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('loadforge.runLoadTest', async (explorerUri?: vscode.Uri) => {
			if (explorerUri) {
				runLoadTest(explorerUri.fsPath, panel);
				return;
			}
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const document = editor.document;
				runLoadTest(document.uri.fsPath, panel);
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
