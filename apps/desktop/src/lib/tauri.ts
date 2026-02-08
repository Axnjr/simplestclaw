import { invoke } from '@tauri-apps/api/core';
import type { GatewayInfo } from './store';

export interface Config {
  anthropicApiKey: string | null;
  gatewayPort: number;
  autoStartGateway: boolean;
}

export const tauri = {
  async getConfig(): Promise<Config> {
    return invoke('get_config');
  },

  async setApiKey(key: string): Promise<void> {
    return invoke('set_api_key', { key });
  },

  async hasApiKey(): Promise<boolean> {
    return invoke('has_api_key');
  },

  async startGateway(): Promise<GatewayInfo> {
    return invoke('start_gateway');
  },

  async stopGateway(): Promise<void> {
    return invoke('stop_gateway');
  },

  async getGatewayStatus(): Promise<{ running: boolean; info: GatewayInfo | null }> {
    return invoke('get_gateway_status');
  },
};
