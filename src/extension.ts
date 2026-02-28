import { execFile } from 'child_process';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "loadforge" is now active!');

	const disposable = vscode.commands.registerCommand('loadforge.helloWorld', () => {
		const path1 = 'demo.lf';
		const path2 = '.env';
		const binaryName = 'loadforge.exe';
		const binaryPath = vscode.extensions.getExtension('siit-na-kvadrat.loadforge')?.extensionPath + '\\bin\\' + binaryName;

		// execute the binary with the specified paths as arguments and capture the output
		// Note: print the output to the Output panel in VS Code
		const outputChannel = vscode.window.createOutputChannel('LoadForge Output');
		outputChannel.show();
		outputChannel.appendLine(`Executing binary: ${binaryPath}`);
		outputChannel.appendLine(`Arguments: ${path1}, ${path2}`);

		execFile(binaryPath, [path1, path2], (error, stdout, stderr) => {
			if (error) {
				outputChannel.appendLine(`Error executing binary: ${error}`);
			}
			if (stdout) {
				outputChannel.appendLine(`Output: ${stdout}`);
			}
			if (stderr) {
				outputChannel.appendLine(`Error output: ${stderr}`);
			}
		});

		context.subscriptions.push(disposable);
	});
}

export function deactivate() {}
