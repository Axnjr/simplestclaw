import { useState } from 'react';
import { useAppStore } from '../lib/store';
import { tauri } from '../lib/tauri';
import { Loader2 } from 'lucide-react';

export function Settings() {
  const { error, setScreen, setGatewayStatus, setApiKeyConfigured, setError } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    
    setSaving(true);
    setError(null);

    try {
      await tauri.setApiKey(apiKey.trim());
      setApiKeyConfigured(true);

      setGatewayStatus({ type: 'starting' });
      const info = await tauri.startGateway();
      setGatewayStatus({ type: 'running', info });
      setScreen('chat');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setGatewayStatus({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-[#fafafa] antialiased p-8">
      <div className="w-full max-w-md">
        {/* Header - confident, minimal */}
        <div className="text-center mb-12">
          <h1 className="text-[28px] font-medium tracking-[-0.02em] mb-3">
            Enter your API key
          </h1>
          <p className="text-[15px] text-white/50 leading-relaxed">
            Your key stays on your computer. We never see it.
          </p>
        </div>

        {/* Error - calm, guiding, not alarming */}
        {error && (
          <div className="mb-8 p-5 rounded-xl bg-white/[0.02] border border-white/10">
            <p className="text-[15px] text-white/70 mb-1">Something went wrong</p>
            <p className="text-[13px] text-white/40">{error}</p>
          </div>
        )}

        {/* Form - simple, focused */}
        <div className="space-y-6">
          <div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10 text-[15px] placeholder-white/30 focus:outline-none focus:border-white/20 font-mono transition-colors"
              disabled={saving}
              autoFocus
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className={`w-full py-3 rounded-xl text-[15px] font-medium transition-all flex items-center justify-center gap-2 ${
              apiKey.trim() && !saving
                ? 'bg-white text-black hover:bg-white/90'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>

        {/* Footer help - subtle, not desperate */}
        <p className="mt-8 text-[13px] text-white/30 text-center">
          Get your key from{' '}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/50 hover:text-white/70 transition-colors"
          >
            console.anthropic.com
          </a>
        </p>
      </div>
    </div>
  );
}
