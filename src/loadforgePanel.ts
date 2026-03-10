import * as vscode from 'vscode';
import Convert from 'ansi-to-html'; 

export class LoadforgePanel implements vscode.WebviewViewProvider {
  clear() {
    if (!this.view) return;

    this.view.webview.postMessage({ type: "clear" });
  }

  public static readonly viewType = "loadforge-output";

  private view?: vscode.WebviewView;
  private convert = new Convert({ newline: true, escapeXML: true });

  resolveWebviewView(
    webviewView: vscode.WebviewView
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.getHtml();
  }

  append(text: string) {
    if (!this.view) return;

    this.clear();
    const normalized = text.replace(/\r\n/g, '\n');
    const html = this.convert.toHtml(normalized);

    this.view.webview.postMessage({ type: "append", html });
  }

  private getHtml(): string {
    return `
    <html>
        <body style="color:#ddd;font-family:monospace">
            <div id="out" style="white-space: pre-wrap;"></div>

            <script>
                const out = document.getElementById("out");

                window.addEventListener("message", event => {
                    if (event.data.type === "append") {
                        const div = document.createElement("div");
                        div.innerHTML = event.data.html;
                        out.appendChild(div);
                        window.scrollTo(0, document.body.scrollHeight);
                    }
                    if (event.data.type === "clear") {
                        out.innerHTML = "";
                    }
                });
            </script>
        </body>
    </html>
    `;
  }
}