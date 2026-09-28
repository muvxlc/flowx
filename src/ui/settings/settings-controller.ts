import type { SettingsService } from '../../settings/service.ts';
import type { SettingsViewState } from './types.ts';
import { renderSettingsView } from './settings-view.ts';

export class SettingsController {
  private readonly service: SettingsService;
  private readonly container: HTMLElement;
  private currentState: SettingsViewState | null = null;

  constructor(service: SettingsService, container: HTMLElement) {
    this.service = service;
    this.container = container;
  }

  async init(): Promise<void> {
    const publicSettings = await this.service.getPublicSettings();
    this.currentState = {
      ...publicSettings,
    };
    this.render();
  }

  render(): void {
    if (!this.currentState) return;
    this.container.innerHTML = renderSettingsView(this.currentState);
    this.bindEvents();
  }

  private bindEvents(): void {
    const btnSetDummyKey = this.container.querySelector<HTMLButtonElement>('#btnSetDummyKey');
    const btnRemoveKey = this.container.querySelector<HTMLButtonElement>('#btnRemoveKey');
    const btnSaveSettings = this.container.querySelector<HTMLButtonElement>('#btnSaveSettings');
    const btnResetSettings = this.container.querySelector<HTMLButtonElement>('#btnResetSettings');
    const keyInput = this.container.querySelector<HTMLInputElement>('#cfgApiKey');
    const chkEnableJev = this.container.querySelector<HTMLInputElement>('#chkEnableJev');
    const chkConsent = this.container.querySelector<HTMLInputElement>('#chkConsent');
    const numTimeout = this.container.querySelector<HTMLInputElement>('#numTimeout');

    if (btnSetDummyKey && keyInput) {
      btnSetDummyKey.addEventListener('click', () => {
        keyInput.value = 'dummy_secret';
        keyInput.focus();
      });
    }

    if (btnRemoveKey) {
      btnRemoveKey.addEventListener('click', async () => {
        try {
          await this.service.removePersonalKey();
          const updated = await this.service.getPublicSettings();
          this.currentState = {
            ...updated,
            statusMessage: 'Personal API key removed',
            statusType: 'info',
          };
          this.render();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to remove key';
          this.updateStatus(message, 'error');
        }
      });
    }

    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', async () => {
        try {
          const newKey = keyInput?.value?.trim();
          if (newKey && newKey.length > 0) {
            await this.service.savePersonalKey(newKey);
          }

          const enabled = chkEnableJev?.checked ?? false;
          const consent = chkConsent?.checked ?? false;
          const timeoutVal = parseInt(numTimeout?.value ?? '5000', 10);

          const updated = await this.service.updateSettings({
            enabled,
            consent,
            timeoutMs: Number.isNaN(timeoutVal) ? 5000 : timeoutVal,
          });

          this.currentState = {
            ...updated,
            statusMessage: 'Settings saved successfully',
            statusType: 'success',
          };
          this.render();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to save settings';
          this.updateStatus(message, 'error');
        }
      });
    }

    if (btnResetSettings) {
      btnResetSettings.addEventListener('click', async () => {
        try {
          const updated = await this.service.updateSettings({
            enabled: false,
            consent: false,
            timeoutMs: 5000,
          });
          this.currentState = {
            ...updated,
            statusMessage: 'Defaults restored',
            statusType: 'info',
          };
          this.render();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to reset settings';
          this.updateStatus(message, 'error');
        }
      });
    }
  }

  private updateStatus(message: string, type: 'success' | 'error' | 'info'): void {
    if (!this.currentState) return;
    this.currentState = {
      ...this.currentState,
      statusMessage: message,
      statusType: type,
    };
    this.render();
  }
}
