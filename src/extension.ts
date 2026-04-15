import * as vscode from 'vscode';
import { ChatPanelProvider } from './chatPanel';

let chatProvider: ChatPanelProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenClaw Code extension is now active');

  chatProvider = new ChatPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'occ.chatView',
      chatProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('occ.openChat', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.occ-sidebar');
      await vscode.commands.executeCommand('occ.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('occ.clearChat', () => {
      chatProvider.clearChat();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('occ.insertSelectedCode', async () => {
      const editor = vscode.window.activeTextEditor;
      
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }
      
      if (editor.selection.isEmpty) {
        vscode.window.showWarningMessage('Please select some code first');
        return;
      }
      
      const selection = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      
      // 获取文件路径（相对于工作区）
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      
      // 获取行号（转为 1-based）
      const startLine = editor.selection.start.line + 1;
      const endLine = editor.selection.end.line + 1;
      
      await vscode.commands.executeCommand('workbench.view.extension.occ-sidebar');
      await vscode.commands.executeCommand('occ.chatView.focus');
      
      // 等待 webview 完全加载
      await new Promise(resolve => setTimeout(resolve, 100));
      
      chatProvider.insertCodeToInput(selection, language, filePath, startLine, endLine);
    })
  );
}

export function deactivate() {}
