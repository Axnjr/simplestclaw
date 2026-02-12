import type {
  ChatSendParams,
  ConnectChallenge,
  ConnectParams,
  ConnectionState,
  GatewayConfig,
  GatewayEvent,
  GatewayEventHandlers,
  GatewayRequest,
  GatewayResponse,
  Message,
  StreamingChunk,
  ToolCall,
} from './types';

const PROTOCOL_VERSION = 3;
const DEFAULT_RECONNECT_DELAY = 3000;

/**
 * OpenClaw Gateway WebSocket Client
 *
 * Usage:
 * ```ts
 * const client = createOpenClawClient({
 *   url: 'ws://localhost:18789',
 *   token: 'optional-token',
 * });
 *
 * client.on('message', (msg) => console.log(msg));
 * await client.connect();
 * await client.sendMessage('Hello!');
 * ```
 */
export class OpenClawClient {
  private ws: WebSocket | null = null;
  private config: Required<GatewayConfig>;
  private handlers: GatewayEventHandlers = {};
  private state: ConnectionState = 'disconnected';
  private requestId = 0;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private sessionKey = 'agent:main:main'; // Default session key

  // Track pending chat messages by runId
  private pendingChats = new Map<
    string,
    {
      content: string;
      gotFinal: boolean; // Whether we received chat 'final' event
      resolve: (message: Message) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(config: GatewayConfig) {
    this.config = {
      url: config.url,
      token: config.token ?? '',
      clientId: config.clientId ?? 'simplestclaw-web',
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY,
    };
  }

  /** Register event handlers */
  on<K extends keyof GatewayEventHandlers>(
    event: K,
    handler: NonNullable<GatewayEventHandlers[K]>
  ): this {
    this.handlers[event] = handler as GatewayEventHandlers[K];
    return this;
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return this.state;
  }

  /** Connect to the Gateway */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          // Wait for connect.challenge event
        };

        this.ws.onmessage = async (event) => {
          try {
            const dataStr = typeof event.data === 'string' ? event.data : event.data.toString();
            const data = JSON.parse(dataStr);
            await this.handleMessage(data, resolve);
          } catch (err) {
            console.error('[openclaw-client] Failed to parse message:', err);
          }
        };

        this.ws.onerror = (event) => {
          const error = new Error('WebSocket error');
          this.handlers.onError?.(error);
          if (this.state === 'connecting') {
            reject(error);
          }
        };

        this.ws.onclose = (event) => {
          this.stopTickTimer();
          this.stopHealthCheck();
          this.setState('disconnected');
          this.handlers.onDisconnect?.(event.reason);

          if (this.config.autoReconnect && this.state !== 'error') {
            this.scheduleReconnect();
          }
        };
      } catch (err) {
        this.setState('error');
        reject(err);
      }
    });
  }

  /** Disconnect from the Gateway */
  disconnect(): void {
    this.config.autoReconnect = false;
    this.stopTickTimer();
    this.stopHealthCheck();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /** Send a chat message and stream the response */
  async sendMessage(message: string, onChunk?: (chunk: StreamingChunk) => void): Promise<Message> {
    // Generate unique idempotency key for this request
    const idempotencyKey = `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const params = {
      sessionKey: this.sessionKey,
      idempotencyKey,
      message,
    };

    // Send the request and get the runId
    const response = (await this.request('chat.send', params)) as { runId: string; status: string };
    const runId = response.runId;

    // Wait for streaming events to complete.
    // The gateway sends two parallel event streams:
    //   1. 'agent' events: lifecycle start/end + assistant text (primary content delivery)
    //   2. 'chat' events: delta/final state transitions (may arrive before text is ready)
    // We resolve when BOTH content has been received AND a completion signal arrives.
    return new Promise((resolve, reject) => {
      this.pendingChats.set(runId, {
        content: '',
        gotFinal: false,
        resolve: (msg) => {
          this.pendingChats.delete(runId);
          resolve(msg);
        },
        reject: (err) => {
          this.pendingChats.delete(runId);
          reject(err);
        },
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        if (this.pendingChats.has(runId)) {
          console.error(
            `[openclaw-client] Chat streaming timed out for runId=${runId}. ws.readyState=${this.ws?.readyState} state=${this.state}`
          );
          this.pendingChats.delete(runId);
          reject(new Error('Chat response timed out'));
        }
      }, 120000);
    });
  }

  /** Send a request and wait for response */
  private async request<T = Record<string, unknown>>(method: string, params?: T): Promise<unknown> {
    if (!this.ws || this.state !== 'connected') {
      throw new Error('Not connected to Gateway');
    }

    // Critical: Check actual WebSocket readyState to detect silently closed connections
    const readyState = this.ws.readyState;
    if (readyState !== WebSocket.OPEN) {
      console.error(
        `[openclaw-client] WebSocket not OPEN! readyState=${readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED), state=${this.state}`
      );
      // Force state update and trigger reconnection
      this.setState('disconnected');
      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }
      throw new Error(
        `WebSocket is not open (readyState=${readyState}). Connection may have dropped silently. Reconnecting...`
      );
    }

    const id = this.nextRequestId();
    const request: GatewayRequest = {
      type: 'req',
      id,
      method,
      params: params as unknown as Record<string, unknown>,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.ws?.send(JSON.stringify(request));
      } catch (sendErr) {
        console.error('[openclaw-client] ws.send() threw:', sendErr);
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to send ${method}: ${sendErr}`));
        return;
      }

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private async handleMessage(
    data: GatewayResponse | GatewayEvent,
    connectResolve?: (value: undefined) => void
  ): Promise<void> {
    if (data.type === 'event') {
      await this.handleEvent(data, connectResolve);
    } else if (data.type === 'res') {
      this.handleResponse(data);
    }
  }

  private async handleEvent(
    event: GatewayEvent,
    connectResolve?: (value: undefined) => void
  ): Promise<void> {
    switch (event.event) {
      case 'connect.challenge':
        await this.sendConnectRequest(event.payload as ConnectChallenge, connectResolve);
        break;
      case 'chat':
        this.handleChatStreamEvent(event.payload as Record<string, unknown>);
        break;
      case 'agent':
        this.handleAgentEvent(event.payload as Record<string, unknown>);
        break;
      case 'chat.message':
        this.handlers.onMessage?.(event.payload as Message);
        break;
      case 'tool.call.started':
      case 'tool.call.completed':
        this.handlers.onToolCall?.(event.payload as ToolCall);
        break;
      case 'tick':
        // Gateway tick event -- no action needed, our tick timer handles keepalive
        break;
      default:
        break;
    }
  }

  /** Handle agent events from the gateway (primary content delivery) */
  private handleAgentEvent(payload: Record<string, unknown>): void {
    const runId = payload.runId as string | undefined;
    const stream = payload.stream as string | undefined;
    const data = payload.data as Record<string, unknown> | undefined;

    if (!runId || !data) return;

    const pending = this.pendingChats.get(runId);
    if (!pending) return;

    if (stream === 'assistant') {
      // The gateway delivers actual text content through agent assistant events.
      // This always arrives before the corresponding agent lifecycle 'end'.
      const text = (data.text as string) || '';
      if (text) {
        pending.content = text;
        // If we already received 'chat final' but were waiting for content, resolve now
        if (pending.gotFinal) {
          this.resolveChat(pending, runId);
        }
      }
    }
    // Note: We intentionally ignore agent lifecycle events for finalization.
    // The gateway runs multiple agent phases (planning, execution, etc.) and
    // lifecycle 'end' events fire for each phase, not just the final one.
  }

  /** Handle streaming chat events from the gateway */
  private handleChatStreamEvent(payload: Record<string, unknown>): void {
    const runId = payload.runId as string | undefined;
    const state = payload.state as string | undefined;

    if (!runId) return;

    const pending = this.pendingChats.get(runId);
    if (!pending) return;

    const messageText = this.extractMessageText(payload);
    this.processChatState(state, pending, runId, messageText, payload);
  }

  /** Extract text content from chat message payload */
  private extractMessageText(payload: Record<string, unknown>): string {
    const message = payload.message as { role?: string; content?: unknown[] } | undefined;

    if (!message?.content || !Array.isArray(message.content)) {
      return '';
    }

    const firstContent = message.content[0] as { type?: string; text?: string } | undefined;
    return firstContent?.text ?? '';
  }

  /** Process chat state transitions (delta, final, error) */
  private processChatState(
    state: string | undefined,
    pending: {
      content: string;
      gotFinal: boolean;
      resolve: (msg: Message) => void;
      reject: (err: Error) => void;
    },
    runId: string,
    messageText: string,
    payload: Record<string, unknown>
  ): void {
    switch (state) {
      case 'delta':
        if (messageText) {
          pending.content = messageText;
          // If we somehow got final before delta (shouldn't happen, but be safe)
          if (pending.gotFinal) {
            this.resolveChat(pending, runId);
          }
        }
        break;
      case 'final':
        if (messageText) {
          pending.content = messageText;
        }
        pending.gotFinal = true;
        if (pending.content.length > 0) {
          // We have content + final signal -- resolve immediately
          this.resolveChat(pending, runId);
        }
        // Otherwise: content hasn't arrived yet (common with the gateway).
        // The 'agent assistant' event or a 'chat delta' will deliver it and
        // check gotFinal to resolve at that point. The 120s timeout is the
        // ultimate fallback if content never arrives.
        break;
      case 'error':
        this.handleChatError(pending, payload);
        break;
      default:
        break;
    }
  }

  /** Resolve a completed chat message */
  private resolveChat(
    pending: {
      content: string;
      resolve: (msg: Message) => void;
      reject: (err: Error) => void;
    },
    runId: string
  ): void {
    // Guard against double-resolve (both streams may trigger tryFinalize)
    if (!this.pendingChats.has(runId)) return;

    const assistantMessage: Message = {
      id: `msg-${runId}`,
      role: 'assistant',
      content: pending.content || '(No response)',
      timestamp: Date.now(),
    };

    this.handlers.onMessage?.(assistantMessage);
    pending.resolve(assistantMessage);
  }

  /** Handle chat error state */
  private handleChatError(
    pending: { content: string; resolve: (msg: Message) => void; reject: (err: Error) => void },
    payload: Record<string, unknown>
  ): void {
    const errorPayload = payload.error as { message?: string } | undefined;
    const errorMsg = errorPayload?.message ?? 'Chat failed';
    pending.reject(new Error(errorMsg));
  }

  private handleResponse(response: GatewayResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    this.pendingRequests.delete(response.id);

    if (response.ok) {
      pending.resolve(response.payload);
    } else {
      pending.reject(new Error(response.error?.message ?? 'Request failed'));
    }
  }

  private async sendConnectRequest(
    challenge: ConnectChallenge,
    connectResolve?: (value: undefined) => void
  ): Promise<void> {
    // Guard clause - ensures WebSocket is initialized before proceeding
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    // Capture in local variable for type narrowing and closure safety
    const ws = this.ws;
    const id = this.nextRequestId();

    const params: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'gateway-client', // Must be a valid client ID from openclaw schema
        version: '0.1.0',
        platform: typeof window !== 'undefined' ? 'web' : 'node',
        mode: 'ui', // Must be a valid mode from openclaw schema
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      locale: 'en-US',
      userAgent: `simplestclaw/${this.config.clientId}`,
    };

    if (this.config.token) {
      params.auth = { token: this.config.token };
    }

    const request: GatewayRequest = {
      type: 'req',
      id,
      method: 'connect',
      params: params as unknown as Record<string, unknown>,
    };

    ws.send(JSON.stringify(request));

    // Wait for hello-ok response
    const originalOnMessage = ws.onmessage;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as GatewayResponse;
        if (data.type === 'res' && data.id === id) {
          if (data.ok) {

            // Extract session key and tick policy from hello-ok payload
            const payload = data.payload as {
              snapshot?: { sessionDefaults?: { mainSessionKey?: string } };
              policy?: { tickIntervalMs?: number };
            };
            if (payload?.snapshot?.sessionDefaults?.mainSessionKey) {
              this.sessionKey = payload.snapshot.sessionDefaults.mainSessionKey;
            }

            // Start keepalive tick timer per gateway policy
            const tickIntervalMs = payload?.policy?.tickIntervalMs ?? 15000;
            this.startTickTimer(tickIntervalMs);
            this.startHealthCheck();

            this.setState('connected');
            this.handlers.onConnect?.();
            connectResolve?.(undefined);
          } else {
            this.setState('error');
            this.handlers.onError?.(new Error(data.error?.message ?? 'Connection failed'));
          }
          // Restore original handler
          ws.onmessage = originalOnMessage;
        } else {
          // Forward non-matching messages to the original handler
          originalOnMessage?.call(ws, event);
        }
      } catch (err) {
        console.error('[openclaw-client] Failed to parse connect response:', err);
        // Always restore original handler on error to prevent permanent breakage
        ws.onmessage = originalOnMessage;
      }
    };
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, this.config.reconnectDelay);
  }

  /** Start periodic tick requests to keep the gateway connection alive */
  private startTickTimer(intervalMs: number): void {
    this.stopTickTimer();
    this.tickTimer = setInterval(() => {
      if (this.ws && this.state === 'connected') {
        const id = this.nextRequestId();
        const tickReq: GatewayRequest = {
          type: 'req',
          id,
          method: 'tick',
          params: {},
        };
        this.ws.send(JSON.stringify(tickReq));
      }
    }, intervalMs);
  }

  /** Stop the periodic tick timer */
  private stopTickTimer(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** Start periodic WebSocket health check to detect zombie connections */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(() => {
      const readyState = this.ws?.readyState;
      // Detect zombie connection: our state says connected but WebSocket is actually dead
      if (this.state === 'connected' && readyState !== undefined && readyState !== WebSocket.OPEN) {
        console.error(
          '[openclaw-client] WebSocket connection dropped silently. Reconnecting...'
        );
        this.setState('disconnected');
        if (this.config.autoReconnect) {
          this.scheduleReconnect();
        }
      }
    }, 5000);
  }

  /** Stop health check timer */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private nextRequestId(): string {
    return `req-${++this.requestId}-${Date.now()}`;
  }
}

/** Create a new OpenClaw client */
export function createOpenClawClient(config: GatewayConfig): OpenClawClient {
  return new OpenClawClient(config);
}
