// The plugin's settings as data, kept free of `obsidian` so the tests can load it; the tab is in settings-tab.ts.

export interface Settings {
  /** Seconds allowed to depict one molecule; the VS Code extension's `smiles.depictionTimeout`. */
  depictionTimeout: number;
  /** In dark themes, draw structures in their dark-theme colours (src/theme.ts, src/structure-theme.ts), as Mermaid follows the theme; off keeps the white card. */
  followDarkTheme: boolean;
  /** Log ignored fence attributes to the developer console. */
  debug: boolean;
}

export const DEFAULT_SETTINGS: Settings = { depictionTimeout: 3, followDarkTheme: true, debug: false };

export const TIMEOUT_RANGE = { min: 0.5, max: 60 } as const;

/** Settings as stored, with anything missing or out of range replaced by its default. */
export function readSettings(stored: unknown): Settings {
  const value = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof Settings, unknown>>;
  const timeout = value.depictionTimeout;
  return {
    depictionTimeout: typeof timeout === 'number' && timeout >= TIMEOUT_RANGE.min && timeout <= TIMEOUT_RANGE.max
      ? timeout
      : DEFAULT_SETTINGS.depictionTimeout,
    followDarkTheme: typeof value.followDarkTheme === 'boolean' ? value.followDarkTheme : DEFAULT_SETTINGS.followDarkTheme,
    debug: typeof value.debug === 'boolean' ? value.debug : DEFAULT_SETTINGS.debug
  };
}

/** The budget in milliseconds, clamped to the setting's range, as the VS Code extension computes it. */
export function timeoutMs(seconds: number): number {
  const clamped = Number.isFinite(seconds) ? Math.min(TIMEOUT_RANGE.max, Math.max(TIMEOUT_RANGE.min, seconds)) : DEFAULT_SETTINGS.depictionTimeout;
  return Math.round(clamped * 1000);
}
