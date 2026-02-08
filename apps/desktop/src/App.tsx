import { useEffect } from 'react';
import { useAppStore } from './lib/store';
import { tauri } from './lib/tauri';
import { Loading } from './components/Loading';
import { Settings } from './components/Settings';
import { Chat } from './components/Chat';

function App() {
  const { screen, setScreen, setGatewayStatus, setApiKeyConfigured, setError } = useAppStore();

  useEffect(() => {
    async function init() {
      try {
        // Check if API key is configured
        const hasKey = await tauri.hasApiKey();
        setApiKeyConfigured(hasKey);

        if (!hasKey) {
          setScreen('settings');
          return;
        }

        // API key exists, try to start gateway
        setGatewayStatus({ type: 'starting' });
        const info = await tauri.startGateway();
        setGatewayStatus({ type: 'running', info });
        setScreen('chat');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setGatewayStatus({ type: 'error', message });
        setScreen('settings');
      }
    }

    init();
  }, [setScreen, setGatewayStatus, setApiKeyConfigured, setError]);

  switch (screen) {
    case 'loading':
      return <Loading />;
    case 'settings':
      return <Settings />;
    case 'chat':
      return <Chat />;
    default:
      return <Loading />;
  }
}

export default App;
