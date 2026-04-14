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
      await vscode.commands.executeCommand('occ.chatView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('occ.clearChat', () => {
      chatProvider.clearChat();
    })
  );
}

export function deactivate() {}
