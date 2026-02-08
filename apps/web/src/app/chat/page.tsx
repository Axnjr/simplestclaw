'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, Loader2, Terminal, FileCode, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { createOpenClawClient, type Message, type ToolCall, type ConnectionState } from '@simplestclaw/openclaw-client';

function ChatContent() {
  const searchParams = useSearchParams();
  const gatewayUrl = searchParams.get('gateway') || 'ws://localhost:18789';
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  
  const clientRef = useRef<ReturnType<typeof createOpenClawClient> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Connect to Gateway on mount
  useEffect(() => {
    const client = createOpenClawClient({
      url: gatewayUrl,
      autoReconnect: true,
    });

    client
      .on('onStateChange', setConnectionState)
      .on('onMessage', (msg) => {
        setMessages((prev) => [...prev, msg]);
      })
      .on('onToolCall', (tc) => {
        setToolCalls((prev) => {
          const existing = prev.findIndex((t) => t.id === tc.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = tc;
            return updated;
          }
          return [...prev, tc];
        });
      })
      .on('onError', (err) => {
        setError(err.message);
      });

    clientRef.current = client;

    client.connect().catch((err) => {
      setError(err.message);
    });

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
    setError(null);
    setToolCalls([]);

    try {
      await clientRef.current?.sendMessage(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-semibold text-gray-900 dark:text-white">Chat</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              <span className="capitalize">{connectionState}</span>
              <span className="text-gray-400">•</span>
              <span className="font-mono">{gatewayUrl}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && connectionState === 'connected' && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <p className="text-lg font-medium mb-2">Connected to OpenClaw</p>
            <p className="text-sm">Send a message to get started</p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
              }`}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Tool calls in progress */}
        {toolCalls.filter((tc) => tc.status === 'running').length > 0 && (
          <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Terminal className="w-4 h-4" />
              <span>Running tools...</span>
            </div>
            {toolCalls
              .filter((tc) => tc.status === 'running')
              .map((tc) => (
                <div
                  key={tc.id}
                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="font-mono">{tc.name}</span>
                </div>
              ))}
          </div>
        )}

        {/* Completed tool calls */}
        {toolCalls.filter((tc) => tc.status === 'completed').length > 0 && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <FileCode className="w-4 h-4" />
              <span>Completed tools</span>
            </div>
            {toolCalls
              .filter((tc) => tc.status === 'completed')
              .map((tc) => (
                <div
                  key={tc.id}
                  className="text-sm text-green-600 dark:text-green-400"
                >
                  <span className="font-mono">{tc.name}</span>
                  {tc.durationMs && (
                    <span className="text-green-500 ml-2">({tc.durationMs}ms)</span>
                  )}
                </div>
              ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              connectionState === 'connected'
                ? 'Type a message...'
                : 'Connecting to Gateway...'
            }
            disabled={connectionState !== 'connected' || isLoading}
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || connectionState !== 'connected' || isLoading}
            className="px-4 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
