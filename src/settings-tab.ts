import { PluginSettingTab, Setting, type App } from 'obsidian';
import type SmilesPlugin from './main';
import { DEFAULT_SETTINGS, TIMEOUT_RANGE } from './settings';

export class SmilesSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SmilesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;

    new Setting(containerEl)
      .setName('Depiction timeout')
      .setDesc(`Seconds allowed to depict one molecule before it is abandoned and reported as a timeout (${TIMEOUT_RANGE.min} to ${TIMEOUT_RANGE.max}). A change restarts the renderer; molecules that timed out are tried again.`)
      .addText((text) => text
        .setPlaceholder(String(DEFAULT_SETTINGS.depictionTimeout))
        .setValue(String(settings.depictionTimeout))
        .onChange(async (raw) => {
          const seconds = Number(raw);
          if (!Number.isFinite(seconds) || seconds < TIMEOUT_RANGE.min || seconds > TIMEOUT_RANGE.max) return;
          await this.plugin.updateSettings({ depictionTimeout: seconds });
        }));

    new Setting(containerEl)
      .setName('Follow dark themes')
      .setDesc('In a dark theme, draw structures on the page in dark-theme colours, as Mermaid diagrams follow the theme: lines and text lightened just enough to read, filled shapes darkened, hues kept. Turn off to keep every structure on a white card with its exact colours.')
      .addToggle((toggle) => toggle
        .setValue(settings.followDarkTheme)
        .onChange(async (value) => this.plugin.updateSettings({ followDarkTheme: value })));

    new Setting(containerEl)
      .setName('Debug logging')
      .setDesc('Report ignored fence attributes in the developer console.')
      .addToggle((toggle) => toggle
        .setValue(settings.debug)
        .onChange(async (value) => this.plugin.updateSettings({ debug: value })));
  }
}
