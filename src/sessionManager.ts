import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type SessionTitleState = 'pending_auto' | 'auto' | 'manual';

export interface Session {
  id: string;
  name: string;
  titleState?: SessionTitleState;
  messages: ChatMessage[];
  createdAt: number;
  lastUsedAt: number;
}

interface SessionStorage {
  sessions: Session[];
  activeSessionId: string;
}

export class SessionManager {
  private storage: SessionStorage;
  private workspacePath: string;
  private storageFilePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
    this.storageFilePath = path.join(workspacePath, '.openclaw', 'sessions.json');
    this.storage = this.loadFromFile();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private normalizeSessionName(name?: string): string | undefined {
    const normalizedName = name?.trim();
    return normalizedName ? normalizedName : undefined;
  }

  private buildPendingSessionName(): string {
    const baseName = 'New Chat';
    const existingNames = new Set(this.storage.sessions.map(session => session.name));

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let index = 2;
    while (existingNames.has(`${baseName} ${index}`)) {
      index += 1;
    }

    return `${baseName} ${index}`;
  }

  private extractAutoTitle(content: string): string | undefined {
    const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, ' ');
    const lines = withoutCodeBlocks
      .split('\n')
      .map(line => line.replace(/`/g, ' ').trim())
      .map(line => line.replace(/^From\s+.+:$/, '').trim())
      .map(line => line.replace(/\s+/g, ' '))
      .map(line => line.replace(/^[#>*\-\d.\])\s]+/, '').trim())
      .filter(line => line.length > 0);

    const candidate = lines.find(line => /[A-Za-z0-9\u4e00-\u9fff]/.test(line));
    if (!candidate) {
      return undefined;
    }

    const chars = Array.from(candidate);
    if (chars.length <= 24) {
      return candidate;
    }

    return `${chars.slice(0, 24).join('')}…`;
  }

  private maybeApplyAutoTitle(session: Session): boolean {
    if (session.titleState !== 'pending_auto') {
      return false;
    }

    const firstUserMessage = session.messages.find(message => message.role === 'user');
    if (!firstUserMessage) {
      return false;
    }

    const nextTitle = this.extractAutoTitle(firstUserMessage.content);
    session.titleState = 'auto';

    if (!nextTitle || nextTitle === session.name) {
      return false;
    }

    session.name = nextTitle;
    return true;
  }

  private normalizeStorage(storage: SessionStorage): SessionStorage {
    if (!storage.sessions || storage.sessions.length === 0) {
      const defaultSession = this.createDefaultSession();
      return {
        sessions: [defaultSession],
        activeSessionId: defaultSession.id
      };
    }

    const hasActiveSession = storage.sessions.some(session => session.id === storage.activeSessionId);
    if (!hasActiveSession) {
      storage.activeSessionId = storage.sessions[0].id;
    }

    return storage;
  }

  private loadFromFile(): SessionStorage {
    try {
      const dirPath = path.dirname(this.storageFilePath);
      
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      if (fs.existsSync(this.storageFilePath)) {
        const data = fs.readFileSync(this.storageFilePath, 'utf-8');
        const storage = JSON.parse(data) as SessionStorage;
        
        if (storage.sessions && storage.sessions.length > 0) {
          return this.normalizeStorage(storage);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }

    const defaultSession = this.createDefaultSession();
    return {
      sessions: [defaultSession],
      activeSessionId: defaultSession.id
    };
  }

  private saveToFile(): void {
    try {
      const dirPath = path.dirname(this.storageFilePath);
      
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(
        this.storageFilePath,
        JSON.stringify(this.storage, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save sessions:', error);
      vscode.window.showErrorMessage(`Failed to save session: ${error}`);
    }
  }

  private createDefaultSession(): Session {
    return {
      id: this.generateId(),
      name: 'New Chat',
      titleState: 'pending_auto',
      messages: [],
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };
  }

  public createSession(name?: string): Session {
    const normalizedName = this.normalizeSessionName(name);
    const newSession: Session = {
      id: this.generateId(),
      name: normalizedName || this.buildPendingSessionName(),
      titleState: normalizedName ? 'manual' : 'pending_auto',
      messages: [],
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    this.storage.sessions.push(newSession);
    this.storage.activeSessionId = newSession.id;
    this.saveToFile();

    return newSession;
  }

  public getSession(id: string): Session | undefined {
    return this.storage.sessions.find(s => s.id === id);
  }

  public getActiveSession(): Session | undefined {
    const session = this.getSession(this.storage.activeSessionId);
    if (session) {
      session.lastUsedAt = Date.now();
      this.saveToFile();
    }
    return session;
  }

  public getAllSessions(): Session[] {
    return [...this.storage.sessions].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  public switchSession(id: string): Session | undefined {
    const session = this.getSession(id);
    if (session) {
      this.storage.activeSessionId = id;
      session.lastUsedAt = Date.now();
      this.saveToFile();
      return session;
    }
    return undefined;
  }

  public deleteSession(id: string): boolean {
    if (this.storage.sessions.length <= 1) {
      vscode.window.showWarningMessage('Cannot delete the last session');
      return false;
    }

    const index = this.storage.sessions.findIndex(s => s.id === id);
    if (index === -1) {
      return false;
    }

    this.storage.sessions.splice(index, 1);

    if (this.storage.activeSessionId === id) {
      const nextActiveSession = [...this.storage.sessions].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0];
      this.storage.activeSessionId = nextActiveSession.id;
      nextActiveSession.lastUsedAt = Date.now();
    }

    this.saveToFile();
    return true;
  }

  public updateSessionMessages(id: string, messages: ChatMessage[]): boolean {
    const session = this.getSession(id);
    if (session) {
      session.messages = messages;
      const titleChanged = this.maybeApplyAutoTitle(session);
      session.lastUsedAt = Date.now();
      this.saveToFile();
      return titleChanged;
    }

    return false;
  }

  public renameSession(id: string, newName: string): boolean {
    const session = this.getSession(id);
    const normalizedName = this.normalizeSessionName(newName);
    if (session && normalizedName) {
      session.name = normalizedName;
      session.titleState = 'manual';
      this.saveToFile();
      return true;
    }
    return false;
  }

  public clearSessionMessages(id: string): void {
    const session = this.getSession(id);
    if (session) {
      session.messages = [];
      this.saveToFile();
    }
  }

  public getActiveSessionId(): string {
    return this.storage.activeSessionId;
  }
}
