import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from 'obsidian';
import type SmilesPlugin from './main';
import { checkTimeout, DEFAULT_SETTINGS, readSettings, TIMEOUT_RANGE, type Settings } from './settings';

/** Names and descriptions, shared by both ways of drawing the tab. */
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

  /** Obsidian 1.13 and later: the settings as definitions, so they appear in settings search. */
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

  /** Obsidian before 1.13 draws the tab from here. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;

    new Setting(containerEl)
      .setName(LABELS.depictionTimeout.name)
      .setDesc(LABELS.depictionTimeout.desc)
      .addText((text) => text
        .setPlaceholder(String(DEFAULT_SETTINGS.depictionTimeout))
        .setValue(String(settings.depictionTimeout))
        .onChange(async (raw) => {
          const seconds = Number(raw);
          if (checkTimeout(seconds) !== undefined) return;
          await this.plugin.updateSettings({ depictionTimeout: seconds });
        }));

    new Setting(containerEl)
      .setName(LABELS.followDarkTheme.name)
      .setDesc(LABELS.followDarkTheme.desc)
      .addToggle((toggle) => toggle
        .setValue(settings.followDarkTheme)
        .onChange(async (value) => this.plugin.updateSettings({ followDarkTheme: value })));

    new Setting(containerEl)
      .setName(LABELS.debug.name)
      .setDesc(LABELS.debug.desc)
      .addToggle((toggle) => toggle
        .setValue(settings.debug)
        .onChange(async (value) => this.plugin.updateSettings({ debug: value })));
  }
}
