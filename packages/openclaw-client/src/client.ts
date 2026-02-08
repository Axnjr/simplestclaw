import type {
  GatewayConfig,
  GatewayEventHandlers,
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  ConnectionState,
  ConnectChallenge,
  ConnectParams,
  Message,
  ToolCall,
  ChatSendParams,
  StreamingChunk,
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
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
            const data = JSON.parse(event.data);
            await this.handleMessage(data, resolve);
          } catch (err) {
            console.error('Failed to parse message:', err);
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
  async sendMessage(
    message: string,
    onChunk?: (chunk: StreamingChunk) => void
  ): Promise<Message> {
    const id = this.nextRequestId();
    
    const params: ChatSendParams = {
      message,
    };

    const response = await this.request('chat.send', params);
    
    // For now, return a simple message
    // TODO: Handle streaming via events
    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: typeof response === 'string' ? response : JSON.stringify(response),
      timestamp: Date.now(),
    };

    this.handlers.onMessage?.(assistantMessage);
    return assistantMessage;
  }

  /** Send a request and wait for response */
  private async request<T = Record<string, unknown>>(method: string, params?: T): Promise<unknown> {
    if (!this.ws || this.state !== 'connected') {
      throw new Error('Not connected to Gateway');
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
      this.ws!.send(JSON.stringify(request));

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
    connectResolve?: (value: void) => void
  ): Promise<void> {
    if (data.type === 'event') {
      await this.handleEvent(data, connectResolve);
    } else if (data.type === 'res') {
      this.handleResponse(data);
    }
  }

  private async handleEvent(
    event: GatewayEvent,
    connectResolve?: (value: void) => void
  ): Promise<void> {
    switch (event.event) {
      case 'connect.challenge': {
        // Respond with connect request
        const challenge = event.payload as ConnectChallenge;
        await this.sendConnectRequest(challenge, connectResolve);
        break;
      }

      case 'chat.message': {
        const message = event.payload as Message;
        this.handlers.onMessage?.(message);
        break;
      }

      case 'tool.call.started':
      case 'tool.call.completed': {
        const toolCall = event.payload as ToolCall;
        this.handlers.onToolCall?.(toolCall);
        break;
      }

      default:
        // Unknown event, ignore
        break;
    }
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
    connectResolve?: (value: void) => void
  ): Promise<void> {
    const id = this.nextRequestId();
    
    const params: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: this.config.clientId,
        version: '0.1.0',
        platform: typeof window !== 'undefined' ? 'web' : 'node',
        mode: 'operator',
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

    this.ws!.send(JSON.stringify(request));

    // Wait for hello-ok response
    const originalOnMessage = this.ws!.onmessage;
    this.ws!.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as GatewayResponse;
        if (data.type === 'res' && data.id === id) {
          if (data.ok) {
            this.setState('connected');
            this.handlers.onConnect?.();
            connectResolve?.();
          } else {
            this.setState('error');
            this.handlers.onError?.(new Error(data.error?.message ?? 'Connection failed'));
          }
          // Restore original handler
          this.ws!.onmessage = originalOnMessage;
        }
      } catch (err) {
        console.error('Failed to parse connect response:', err);
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

  private nextRequestId(): string {
    return `req-${++this.requestId}-${Date.now()}`;
  }
}

/** Create a new OpenClaw client */
export function createOpenClawClient(config: GatewayConfig): OpenClawClient {
  return new OpenClawClient(config);
}
