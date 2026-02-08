import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createOpenClawClient, type Message, type ConnectionState } from '@simplestclaw/openclaw-client';
import { useAppStore } from '../lib/store';

export function Chat() {
  const { gatewayStatus, setScreen } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  
  const clientRef = useRef<ReturnType<typeof createOpenClawClient> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const gatewayUrl = gatewayStatus.type === 'running' ? gatewayStatus.info.url : '';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!gatewayUrl) return;

    const client = createOpenClawClient({
      url: gatewayUrl,
      autoReconnect: true,
    });

    client
      .on('onStateChange', setConnectionState)
      .on('onMessage', (msg) => {
        setMessages((prev) => [...prev, msg]);
      });

    clientRef.current = client;
    client.connect().catch(console.error);

    return () => {
      client.disconnect();
    };
  }, [gatewayUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || connectionState !== 'connected') return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      await clientRef.current?.sendMessage(input);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Ambient status - tiny dot, not screaming
  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'bg-emerald-500';
      case 'connecting': return 'bg-white/50';
      default: return 'bg-white/20';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-[#fafafa] antialiased">
      {/* Header - minimal, ambient */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <span className="text-[15px] font-medium tracking-tight">simplestclaw</span>
        </div>
        <button
          onClick={() => setScreen('settings')}
          className="text-[13px] text-white/40 hover:text-white/70 transition-colors"
        >
          Settings
        </button>
      </header>

      {/* Messages - content is king */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        {messages.length === 0 && connectionState === 'connected' && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-[17px] text-white/50 mb-2">Ready</p>
            <p className="text-[15px] text-white/30">Send a message to get started</p>
          </div>
        )}

        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                  message.role === 'user'
                    ? 'bg-white text-black'
                    : 'bg-white/[0.02] border border-white/10'
                }`}
              >
                {message.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none text-[15px] leading-relaxed">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed">{message.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl px-5 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-white/30" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input - simple, inviting */}
      <div className="px-6 py-4 border-t border-white/5">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={connectionState === 'connected' ? 'Message...' : 'Connecting...'}
              disabled={connectionState !== 'connected' || isLoading}
              className="flex-1 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim() || connectionState !== 'connected' || isLoading}
              className={`px-4 py-3 rounded-xl text-[15px] font-medium transition-all ${
                input.trim() && connectionState === 'connected' && !isLoading
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
