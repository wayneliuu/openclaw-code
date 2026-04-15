import * as vscode from 'vscode';
import * as path from 'path';
import { OpenClawClient } from './openclawClient';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private client: OpenClawClient;
  private conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    const config = vscode.workspace.getConfiguration('occ');
    const gatewayUrl = config.get<string>('gatewayUrl', 'http://127.0.0.1:18789');
    this.client = new OpenClawClient(gatewayUrl);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'out', 'webview')
      ]
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.handleSendMessage(message.text);
          break;
        case 'clearChat':
          webviewView.webview.postMessage({ type: 'clearChat' });
          break;
      }
    });
  }

  private async handleSendMessage(text: string) {
    if (!this.view) {
      return;
    }

    const config = vscode.workspace.getConfiguration('occ');
    const token = config.get<string>('gatewayToken', '');

    let fullMessage = text;

    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      const selection = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      fullMessage = `${text}\n\n\`\`\`${language}\n${selection}\n\`\`\``;
    }

    // 添加用户消息到历史
    this.conversationHistory.push({ role: 'user', content: fullMessage });

    this.view.webview.postMessage({ type: 'startResponse' });

    let assistantMessage = '';

    try {
      await this.client.sendMessageWithHistory(
        this.conversationHistory,
        token,
        (chunk: string) => {
          assistantMessage += chunk;
          this.view?.webview.postMessage({ type: 'chunk', data: chunk });
        },
        (error: Error) => {
          this.view?.webview.postMessage({ 
            type: 'error', 
            data: error.message 
          });
          vscode.window.showErrorMessage(`OpenClaw error: ${error.message}`);
        }
      );

      // 添加助手回复到历史
      if (assistantMessage) {
        this.conversationHistory.push({ role: 'assistant', content: assistantMessage });
      }

      this.view.webview.postMessage({ type: 'endResponse' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.view.webview.postMessage({ 
        type: 'error', 
        data: errorMessage 
      });
      vscode.window.showErrorMessage(`OpenClaw error: ${errorMessage}`);
    }
  }

  public clearChat() {
    this.conversationHistory = [];
    this.view?.webview.postMessage({ type: 'clearChat' });
  }

  public insertCodeToInput(code: string, language: string, filePath?: string, startLine?: number, endLine?: number) {
    if (!this.view) {
      vscode.window.showErrorMessage('Chat view is not available');
      return;
    }
    
    this.view.webview.postMessage({ 
      type: 'insertCode', 
      code: code,
      language: language,
      filePath: filePath,
      startLine: startLine,
      endLine: endLine
    });
  }

  private getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'style.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
  <link href="${styleUri}" rel="stylesheet">
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <title>OpenClaw Chat</title>
</head>
<body>
  <div id="chat-container">
    <div id="messages"></div>
    <div id="input-container">
      <div id="input-wrapper">
        <textarea id="input" placeholder="Ask OpenClaw... (Enter to send, Shift+Enter for new line, drag code here)" rows="3"></textarea>
        <button id="send" class="send-icon" title="Send message">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 16 12 8"></polyline>
            <polyline points="8 12 12 8 16 12"></polyline>
          </svg>
        </button>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
