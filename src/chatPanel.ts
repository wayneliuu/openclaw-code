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
        case 'ready':
          this.sendWorkspaceInfo();
          await this.sendFileList();
          break;
        case 'openFile':
          await this.handleOpenFile(message.filePath, message.startLine, message.endLine);
          break;
        case 'searchInProject':
          await this.searchInProject(message.query);
          break;
      }
    });
  }

  private sendWorkspaceInfo() {
    if (!this.view) {
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      // 只在没有工作区时显示错误
      this.view.webview.postMessage({
        type: 'error',
        data: 'No workspace folder opened'
      });
    }
    // 正常情况下不发送任何消息，保持简洁
  }

  private async sendFileList() {
    if (!this.view) {
      return;
    }

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return;
      }

      // 获取项目文件列表，排除 node_modules 等
      const files = await vscode.workspace.findFiles(
        '**/*',
        '{**/node_modules/**,**/out/**,**/.git/**,**/dist/**,**/.vscode/**}'
      );

      const relativePaths = files.map(uri => 
        vscode.workspace.asRelativePath(uri)
      );

      this.view.webview.postMessage({
        type: 'fileList',
        files: relativePaths
      });
    } catch (error) {
      console.error('Failed to get file list:', error);
    }
  }

  private async handleOpenFile(filePath: string, startLine?: number, endLine?: number) {
    try {
      // 解析文件路径（可能是相对路径或绝对路径）
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let fileUri: vscode.Uri;
      
      if (path.isAbsolute(filePath)) {
        fileUri = vscode.Uri.file(filePath);
      } else if (workspaceFolder) {
        fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
      } else {
        throw new Error('Cannot resolve file path: no workspace folder');
      }
      
      // 打开文档
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document);
      
      // 跳转到指定行
      if (startLine !== undefined) {
        const line = startLine - 1; // 转为 0-based
        const endLineNum = endLine ? endLine - 1 : line;
        const range = new vscode.Range(line, 0, endLineNum, document.lineAt(Math.min(endLineNum, document.lineCount - 1)).text.length);
        
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to open file: ${errorMessage}`);
    }
  }

  private async searchInProject(query: string) {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
      return;
    }

    const files = await vscode.workspace.findFiles(
      '**/*',
      '{**/node_modules/**,**/out/**,**/.git/**,**/dist/**,**/.vscode/**}'
    );

    const lowerQuery = trimmedQuery.toLowerCase();
    let matchedUri: vscode.Uri | undefined;
    let matchedRange: vscode.Range | undefined;

    for (const file of files) {
      const document = await vscode.workspace.openTextDocument(file);
      const content = document.getText();
      const matchIndex = content.toLowerCase().indexOf(lowerQuery);

      if (matchIndex === -1) {
        continue;
      }

      const start = document.positionAt(matchIndex);
      const end = document.positionAt(matchIndex + trimmedQuery.length);
      matchedUri = file;
      matchedRange = new vscode.Range(start, end);
      break;
    }

    if (!matchedUri || !matchedRange) {
      vscode.window.showInformationMessage(`No project result found for: ${trimmedQuery}`);
      return;
    }

    const document = await vscode.workspace.openTextDocument(matchedUri);
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(matchedRange.start, matchedRange.end);
    editor.revealRange(matchedRange, vscode.TextEditorRevealType.InCenter);
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
