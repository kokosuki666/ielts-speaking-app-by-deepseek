export {};

declare global {
  interface DesktopBridge {
    info: () => Promise<{
      version: string;
      platform: string;
      isPackaged: boolean;
      userData: string;
      updateConfigured: boolean;
      updateUrl: string;
    }>;
    saveBackup: (json: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    checkUpdate: () => Promise<{ ok: boolean; reason?: string }>;
    downloadUpdate: () => Promise<{ ok: boolean }>;
    installUpdate: () => Promise<{ ok: boolean }>;
    openDataFolder: () => Promise<string>;
    onUpdateStatus: (callback: (payload: unknown) => void) => () => void;
    window: {
      minimize: () => Promise<boolean>;
      toggleMaximize: () => Promise<boolean>;
      close: () => Promise<boolean>;
      isMaximized: () => Promise<boolean>;
      onMaximized: (callback: (value: boolean) => void) => () => void;
    };
  }

  interface Window {
    desktop?: DesktopBridge;
  }
}
