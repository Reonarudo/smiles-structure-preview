import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import type SmilesPlugin from './main';
import { checkTimeout, DEFAULT_SETTINGS, readSettings, TIMEOUT_RANGE, type Settings } from './settings';

/** Names and descriptions of the settings. */
const LABELS = {
  depictionTimeout: {
    name: 'Depiction timeout',
    desc: `Seconds allowed to depict one molecule before it is abandoned and reported as a timeout (${TIMEOUT_RANGE.min} to ${TIMEOUT_RANGE.max}). A change restarts the renderer; molecules that timed out are tried again.`
  },
  followDarkTheme: {
    name: 'Follow dark themes',
    desc: 'In a dark theme, draw structures on the page in dark-theme colours, as Mermaid diagrams follow the theme: lines and text lightened just enough to read, filled shapes darkened, hues kept. Turn off to keep every structure on a white card with its exact colours.'
  },
  debug: { name: 'Debug logging', desc: 'Report ignored fence attributes in the developer console.' }
} as const;

export class SmilesSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SmilesPlugin) {
    super(app, plugin);
  }

  /** The settings as definitions: Obsidian draws them, and lists them in settings search. */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { ...LABELS.depictionTimeout, control: { type: 'number', key: 'depictionTimeout', min: TIMEOUT_RANGE.min, max: TIMEOUT_RANGE.max, step: 'any', defaultValue: DEFAULT_SETTINGS.depictionTimeout, validate: checkTimeout } },
      { ...LABELS.followDarkTheme, control: { type: 'toggle', key: 'followDarkTheme', defaultValue: DEFAULT_SETTINGS.followDarkTheme } },
      { ...LABELS.debug, control: { type: 'toggle', key: 'debug', defaultValue: DEFAULT_SETTINGS.debug } }
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof Settings];
  }

  /** Through the plugin, which validates, restarts the renderer when needed, and keeps the saved flips. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (!(key in DEFAULT_SETTINGS)) return;
    const next = readSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.updateSettings({ [key]: next[key as keyof Settings] });
  }
}
