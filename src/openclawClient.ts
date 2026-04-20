export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionChunk {
  choices: Array<{
    delta: {
      content?: string;
    };
  }>;
}

export interface OpenClawRequestOptions {
  agentId?: string;
  messageChannel?: string;
  sessionKey?: string;
  user?: string;
  instructions?: string;
  maxOutputTokens?: number;
  previousResponseId?: string;
}

export interface OpenClawUsage {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type OpenClawStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'status'; text: string; persist?: boolean }
  | { type: 'usage'; usage: OpenClawUsage }
  | { type: 'transport'; transport: 'responses' | 'chat-completions'; fallback?: boolean };

interface ParsedSseEvent {
  eventType?: string;
  data: string;
}

interface ResponsesInputItem {
  type: 'message';
  role: ChatMessage['role'];
  content: string;
}

class OpenClawHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errorType?: string
  ) {
    super(message);
    this.name = 'OpenClawHttpError';
  }
}

type JsonRecord = Record<string, unknown>;

export class OpenClawClient {
  constructor(
    private baseUrl: string = 'http://127.0.0.1:18789'
  ) {}

  private buildHeaders(token: string, options?: OpenClawRequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream, application/json',
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options?.agentId) {
      headers['x-openclaw-agent-id'] = options.agentId;
    }

    if (options?.messageChannel) {
      headers['x-openclaw-message-channel'] = options.messageChannel;
    }

    if (options?.sessionKey) {
      headers['x-openclaw-session-key'] = options.sessionKey;
    }

    return headers;
  }

  private buildResponsesRequestBody(messages: ChatMessage[], options?: OpenClawRequestOptions): JsonRecord {
    const body: JsonRecord = {
      model: 'openclaw/default',
      input: this.toResponsesInput(messages),
      stream: true,
    };

    if (options?.user) {
      body.user = options.user;
    }

    const instructions = options?.instructions?.trim();
    if (instructions) {
      body.instructions = instructions;
    }

    if (typeof options?.maxOutputTokens === 'number' && Number.isFinite(options.maxOutputTokens) && options.maxOutputTokens > 0) {
      body.max_output_tokens = Math.floor(options.maxOutputTokens);
    }

    const previousResponseId = options?.previousResponseId?.trim();
    if (previousResponseId) {
      body.previous_response_id = previousResponseId;
    }

    return body;
  }

  private toResponsesInput(messages: ChatMessage[]): ResponsesInputItem[] {
    return messages.map((message) => ({
      type: 'message',
      role: message.role,
      content: message.content,
    }));
  }

  private extractEvents(buffer: string): { events: string[]; remaining: string } {
    const events: string[] = [];
    let remaining = buffer;

    while (true) {
      const match = remaining.match(/\r?\n\r?\n/);
      if (!match || match.index === undefined) {
        break;
      }

      events.push(remaining.slice(0, match.index));
      remaining = remaining.slice(match.index + match[0].length);
    }

    return { events, remaining };
  }

  private parseSseEvent(eventText: string): ParsedSseEvent {
    let eventType: string | undefined;
    const dataLines: string[] = [];

    eventText.split(/\r?\n/).forEach((line) => {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
        return;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    });

    return {
      eventType,
      data: dataLines.join('\n').trim(),
    };
  }

  private async createHttpError(response: Response): Promise<OpenClawHttpError> {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    let errorType: string | undefined;

    try {
      const rawText = await response.text();
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText) as { error?: { message?: string; type?: string } };
          const errorMessage = parsed.error?.message?.trim();
          errorType = parsed.error?.type?.trim();
          if (errorMessage) {
            message = `HTTP ${response.status}: ${errorMessage}`;
          }
        } catch {
          message = `HTTP ${response.status}: ${rawText.trim()}`;
        }
      }
    } catch {
      return new OpenClawHttpError(response.status, message, errorType);
    }

    return new OpenClawHttpError(response.status, message, errorType);
  }

  private async streamSse(
    response: Response,
    onEvent: (event: ParsedSseEvent) => boolean | void
  ): Promise<void> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = this.extractEvents(buffer);
      buffer = remaining;

      for (const eventText of events) {
        const shouldStop = onEvent(this.parseSseEvent(eventText));
        if (shouldStop) {
          return;
        }
      }
    }

    const trailingEvent = buffer.trim();
    if (trailingEvent) {
      onEvent(this.parseSseEvent(trailingEvent));
    }
  }

  private extractString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private normalizeUsage(value: unknown): OpenClawUsage | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const usageRecord = value as Record<string, unknown>;
    const usage: OpenClawUsage = {};
    const inputTokens = usageRecord.input_tokens ?? usageRecord.inputTokens ?? usageRecord.prompt_tokens ?? usageRecord.promptTokens;
    const outputTokens = usageRecord.output_tokens ?? usageRecord.outputTokens ?? usageRecord.completion_tokens ?? usageRecord.completionTokens;
    const promptTokens = usageRecord.prompt_tokens ?? usageRecord.promptTokens;
    const completionTokens = usageRecord.completion_tokens ?? usageRecord.completionTokens;
    const totalTokens = usageRecord.total_tokens ?? usageRecord.totalTokens;

    if (typeof inputTokens === 'number') {
      usage.inputTokens = inputTokens;
    }

    if (typeof outputTokens === 'number') {
      usage.outputTokens = outputTokens;
    }

    if (typeof promptTokens === 'number') {
      usage.promptTokens = promptTokens;
    }

    if (typeof completionTokens === 'number') {
      usage.completionTokens = completionTokens;
    }

    if (typeof totalTokens === 'number') {
      usage.totalTokens = totalTokens;
    }

    return Object.keys(usage).length > 0 ? usage : undefined;
  }

  private extractUsage(payload: JsonRecord): OpenClawUsage | undefined {
    return this.normalizeUsage(payload.usage) ?? this.normalizeUsage((payload.response as JsonRecord | undefined)?.usage);
  }

  private sanitizeDisplayText(text: string): string {
    return text
      .replace(/<<<BEGIN_[A-Z0-9_]+>>>/g, '')
      .replace(/<<<END_[A-Z0-9_]+>>>/g, '')
      .replace(/^OpenClaw runtime context.*$/gim, '')
      .replace(/^This context is runtime-generated.*$/gim, '')
      .replace(/^\[Internal task completion event\]$/gim, '')
      .replace(/^source:\s+.*$/gim, '')
      .replace(/^session_key:\s+.*$/gim, '')
      .replace(/^session_id:\s+.*$/gim, '')
      .replace(/^Stats:\s+.*$/gim, '')
      .replace(/^Action:\s*$/gim, '')
      .replace(/^A completed subagent task.*$/gim, '')
      .replace(/^Keep this internal context private.*$/gim, '')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private summarizeInternalContext(text: string): string | undefined {
    const internalContextMatch = text.match(/<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\s*([\s\S]*?)\s*<<<END_OPENCLAW_INTERNAL_CONTEXT>>>/);
    const contextText = internalContextMatch?.[1];
    if (!contextText) {
      return undefined;
    }

    const task = contextText.match(/^task:\s*(.+)$/m)?.[1]?.trim();
    const status = contextText.match(/^status:\s*(.+)$/m)?.[1]?.trim();
    const childResult = contextText.match(/<<<BEGIN_UNTRUSTED_CHILD_RESULT>>>\s*([\s\S]*?)\s*<<<END_UNTRUSTED_CHILD_RESULT>>>/)?.[1];
    const parts: string[] = [];

    if (task && status) {
      parts.push(`Subtask \`${task}\` ${status}`);
    } else if (status) {
      parts.push(`Task ${status}`);
    }

    const cleanedChildResult = childResult ? this.sanitizeDisplayText(childResult) : '';
    if (cleanedChildResult) {
      parts.push(cleanedChildResult);
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  private collectTextCandidates(value: unknown, candidates: string[], depth: number): void {
    if (depth > 4 || candidates.length >= 12 || value === null || value === undefined) {
      return;
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        candidates.push(trimmedValue);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => this.collectTextCandidates(item, candidates, depth + 1));
      return;
    }

    if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) => this.collectTextCandidates(item, candidates, depth + 1));
    }
  }

  private extractNotableSummary(value: unknown): string | undefined {
    const candidates: string[] = [];
    this.collectTextCandidates(value, candidates, 0);

    for (const candidate of candidates) {
      const summarizedContext = this.summarizeInternalContext(candidate);
      if (summarizedContext) {
        return summarizedContext;
      }
    }

    for (const candidate of candidates) {
      const cleanedText = this.sanitizeDisplayText(candidate);
      if (cleanedText) {
        return cleanedText;
      }
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const task = this.extractString(record.task);
      const status = this.extractString(record.status);
      if (task && status) {
        return `Subtask \`${task}\` ${status}`;
      }
    }

    return undefined;
  }

  private extractResponsesTextDelta(payload: JsonRecord): string {
    const directDelta = payload.delta;
    if (typeof directDelta === 'string') {
      return directDelta;
    }

    if (directDelta && typeof directDelta === 'object') {
      const nestedText = this.extractString((directDelta as JsonRecord).text);
      if (nestedText) {
        return nestedText;
      }
    }

    return this.extractString(payload.text) || '';
  }

  private extractFailureMessage(payload: JsonRecord): string | undefined {
    return this.extractString((payload.error as JsonRecord | undefined)?.message)
      ?? this.extractString((payload.response as JsonRecord | undefined)?.status)
      ?? this.extractNotableSummary(payload);
  }

  private isResponsesUnsupportedBadRequest(error: OpenClawHttpError): boolean {
    if (error.status !== 400) {
      return false;
    }

    if (error.errorType && error.errorType !== 'invalid_request_error') {
      return false;
    }

    const message = error.message.toLowerCase();
    const fallbackPatterns = [
      /responses endpoint .*disabled/,
      /responses endpoint .*not enabled/,
      /\bv1\/responses\b.*not found/,
      /does not support .*responses/,
      /unsupported .*responses/,
      /unknown field .*input/,
      /unknown parameter .*input/,
      /unrecognized field .*input/,
      /invalid field .*input/,
      /missing .*messages/,
      /messages .*required/,
      /expected .*messages/
    ];

    return fallbackPatterns.some((pattern) => pattern.test(message));
  }

  private processChatCompletionEvent(
    event: ParsedSseEvent,
    onEvent: (streamEvent: OpenClawStreamEvent) => void
  ): boolean {
    const data = event.data;
    if (!data) {
      return false;
    }

    if (data === '[DONE]') {
      return true;
    }

    try {
      const parsed = JSON.parse(data) as ChatCompletionChunk;
      const content = parsed.choices?.[0]?.delta?.content || '';
      if (content) {
        onEvent({ type: 'text-delta', text: content });
      }
    } catch (error) {
      console.error('Failed to parse chat completion SSE data:', error, data);
    }

    return false;
  }

  private processResponsesEvent(
    event: ParsedSseEvent,
    onEvent: (streamEvent: OpenClawStreamEvent) => void
  ): boolean {
    const data = event.data;
    if (!data) {
      return false;
    }

    if (data === '[DONE]') {
      return true;
    }

    let payload: JsonRecord;
    try {
      payload = JSON.parse(data) as JsonRecord;
    } catch (error) {
      console.error('Failed to parse responses SSE data:', error, event.eventType, data);
      return false;
    }

    switch (event.eventType) {
      case 'response.created':
        onEvent({ type: 'transport', transport: 'responses' });
        return false;

      case 'response.in_progress':
      case 'response.output_item.added':
      case 'response.content_part.added':
      case 'response.output_text.done':
      case 'response.content_part.done':
        return false;

      case 'response.output_text.delta': {
        const text = this.extractResponsesTextDelta(payload);
        if (text) {
          onEvent({ type: 'text-delta', text });
        }
        return false;
      }

      case 'response.output_item.done': {
        const summary = this.extractNotableSummary(payload.item ?? payload);
        if (summary) {
          onEvent({ type: 'status', text: summary, persist: true });
        }
        return false;
      }

      case 'response.completed': {
        const summary = this.extractNotableSummary(payload.response ?? payload);
        if (summary) {
          onEvent({ type: 'status', text: summary, persist: true });
        }

        const usage = this.extractUsage(payload);
        if (usage) {
          onEvent({ type: 'usage', usage });
        }
        return false;
      }

      case 'response.failed': {
        const failureMessage = this.extractFailureMessage(payload) || 'OpenClaw response failed';
        throw new Error(failureMessage);
      }

      default:
        return false;
    }
  }

  private async streamResponses(
    messages: ChatMessage[],
    token: string,
    options: OpenClawRequestOptions | undefined,
    onEvent: (streamEvent: OpenClawStreamEvent) => void
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: this.buildHeaders(token, options),
      body: JSON.stringify(this.buildResponsesRequestBody(messages, options)),
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    await this.streamSse(response, (event) => this.processResponsesEvent(event, onEvent));
  }

  private async streamChatCompletion(
    body: { model: string; messages: ChatMessage[]; stream: true; user?: string },
    token: string,
    options: OpenClawRequestOptions | undefined,
    onEvent: (streamEvent: OpenClawStreamEvent) => void
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(token, options),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await this.createHttpError(response);
    }

    onEvent({ type: 'transport', transport: 'chat-completions', fallback: true });
    await this.streamSse(response, (event) => this.processChatCompletionEvent(event, onEvent));
  }

  private shouldFallbackToChatCompletions(error: Error): boolean {
    if (!(error instanceof OpenClawHttpError)) {
      return false;
    }

    if (error.status === 404 || error.status === 405 || error.status === 501) {
      return true;
    }

    return this.isResponsesUnsupportedBadRequest(error);
  }

  async sendMessageWithHistory(
    messages: ChatMessage[],
    token: string,
    onEvent: (streamEvent: OpenClawStreamEvent) => void,
    onError?: (error: Error) => void,
    options?: OpenClawRequestOptions
  ): Promise<void> {
    try {
      await this.streamResponses(messages, token, options, onEvent);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.shouldFallbackToChatCompletions(err)) {
        try {
          await this.streamChatCompletion({
            model: 'openclaw/default',
            messages,
            stream: true,
            user: options?.user,
          }, token, options, onEvent);
          return;
        } catch (fallbackError) {
          const normalizedFallbackError = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
          console.error('OpenClaw fallback API error:', normalizedFallbackError);
          if (onError) {
            onError(normalizedFallbackError);
          } else {
            throw normalizedFallbackError;
          }
          return;
        }
      }

      console.error('OpenClaw API error:', err);
      if (onError) {
        onError(err);
      } else {
        throw err;
      }
    }
  }

  async sendMessage(
    message: string,
    token: string,
    onEvent: (streamEvent: OpenClawStreamEvent) => void,
    onError?: (error: Error) => void,
    options?: OpenClawRequestOptions
  ): Promise<void> {
    await this.sendMessageWithHistory([{ role: 'user', content: message }], token, onEvent, onError, options);
  }

  async testConnection(token: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers,
      });
      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}
