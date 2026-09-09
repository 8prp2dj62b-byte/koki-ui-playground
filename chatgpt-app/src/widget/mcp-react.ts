import { App, PostMessageTransport } from '@modelcontextprotocol/ext-apps';
import { useEffect, useState } from 'react';

export interface UseAppOptions {
  appInfo: { name: string; version: string };
  capabilities: Record<string, unknown>;
  onAppCreated?: (app: App) => void;
  autoResize?: boolean;
  strict?: boolean;
}

export interface AppState {
  app: App | null;
  isConnected: boolean;
  error: Error | null;
}

/**
 * Small React lifecycle wrapper around the stable MCP Apps core API.
 * Kept local because some published ext-apps versions have shipped a React
 * subpath typing/export mismatch while the App/PostMessageTransport API is
 * stable and is the protocol source of truth.
 */
export function useApp({
  appInfo,
  capabilities,
  onAppCreated,
  autoResize = true,
  strict = false,
}: UseAppOptions): AppState {
  const [app, setApp] = useState<App | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    let instance: App | null = null;

    const connect = async () => {
      try {
        instance = new App(appInfo, capabilities, { autoResize, strict });
        onAppCreated?.(instance);
        const transport = new PostMessageTransport(window.parent, window.parent);
        await instance.connect(transport);
        if (!mounted) {
          void instance.close();
          return;
        }
        setApp(instance);
        setIsConnected(true);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setApp(null);
        setIsConnected(false);
        setError(err instanceof Error ? err : new Error('MCP_APP_CONNECT_FAILED'));
      }
    };

    void connect();
    return () => {
      mounted = false;
      if (instance) void instance.close();
    };
    // The bridge is intentionally initialized once per widget lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { app, isConnected, error };
}
