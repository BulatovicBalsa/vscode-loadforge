import * as vscode from 'vscode';
import { runLoadTest, stopLoadTest } from './commands/run-load-test';
import { LoadforgePanel } from './loadforgePanel';
import { checkForRuntimeUpdatesOnStartup, initializeRuntimeManager, updateLoadforgeRuntime } from './runtime-manager';

export function activate(context: vscode.ExtensionContext) {
	initializeRuntimeManager(context);

	const panel = new LoadforgePanel();

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			LoadforgePanel.viewType,
			panel
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('loadforge.runLoadTest', async (explorerUri?: vscode.Uri) => {
			// save all lf files before running the test
			await vscode.workspace.saveAll(false);
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

	context.subscriptions.push(
		vscode.commands.registerCommand('loadforge.updateRuntime', async () => {
			await updateLoadforgeRuntime({ interactive: true });
		})
	);

	checkForRuntimeUpdatesOnStartup();

}

export function deactivate() {
}
