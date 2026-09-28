import type { RuntimeBridge } from '../integration/service-bridge.ts';
import type { SettingsViewState } from '../ui/settings/types.ts';
import { renderSettingsView } from '../ui/settings/settings-view.ts';
import {
  PINNED_9ROUTER_ENDPOINT,
  UNKNOWN_MODEL_ID,
  JEV_DISPLAY_LABEL,
} from '../settings/constants.ts';
import { G1_VERDICT } from '../jev/gate.ts';
import type { SafeSettingsSummary } from '../integration/types.ts';

export class WorkerMediatedSettings {
  bridge: RuntimeBridge;
  container: HTMLElement;
  private state: SettingsViewState | null = null;
  private isLoading = false;

  constructor(bridge: RuntimeBridge, container: HTMLElement) {
    this.bridge = bridge;
    this.container = container;
  }

  async init(): Promise<void> {
    this.isLoading = true;
    this.renderLoading();

    try {
      const resp = (await this.bridge.sendCommand('SETTINGS_UPDATE', { action: 'GET' })) as {
        success?: boolean;
        settings?: SafeSettingsSummary & { enabled?: boolean; consent?: boolean; timeoutMs?: number };
      };

      const summary = resp?.settings ?? this.bridge.getSettingsSummary();
      const rawSummary = summary as SafeSettingsSummary & { enabled?: boolean; consent?: boolean; timeoutMs?: number };
      this.state = {
        endpoint: summary.endpoint ?? PINNED_9ROUTER_ENDPOINT,
        modelId: summary.modelId ?? UNKNOWN_MODEL_ID,
        displayLabel: summary.displayLabel ?? JEV_DISPLAY_LABEL,
        hasPersonalKey: summary.hasKey ?? false,
        maskedKey: summary.hasKey ? '••••••••••••••••' : null,
        enabled: rawSummary.enabled ?? false,
        consent: rawSummary.consent ?? false,
        timeoutMs: rawSummary.timeoutMs ?? 5000,
        isG1Blocked: G1_VERDICT.status === 'BLOCKED',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load settings';
      const fallback = this.bridge.getSettingsSummary();
      this.state = {
        endpoint: fallback.endpoint,
        modelId: fallback.modelId,
        displayLabel: fallback.displayLabel,
        hasPersonalKey: fallback.hasKey,
        maskedKey: fallback.hasKey ? '••••••••••••••••' : null,
        enabled: false,
        consent: false,
        timeoutMs: 5000,
        isG1Blocked: true,
        statusMessage: msg,
        statusType: 'error',
      };
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private renderLoading(): void {
    if (!this.container || typeof this.container.innerHTML === 'undefined') return;
    this.container.innerHTML = `
<section class="tab-body" id="tabContentSettings" role="region" aria-busy="true" aria-label="Extension Settings">
  <div class="placeholder-panel" role="status">
    <p>Loading settings from worker...</p>
  </div>
</section>`.trim();
  }

  render(): void {
    if (!this.container || typeof this.container.innerHTML === 'undefined') return;
    if (this.isLoading) {
      this.renderLoading();
      return;
    }
    if (!this.state) {
      const summary = this.bridge.getSettingsSummary();
      this.state = {
        endpoint: summary.endpoint,
        modelId: summary.modelId,
        displayLabel: summary.displayLabel,
        hasPersonalKey: summary.hasKey,
        maskedKey: summary.hasKey ? '••••••••••••••••' : null,
        enabled: false,
        consent: false,
        timeoutMs: 5000,
        isG1Blocked: true,
      };
    }
    this.container.innerHTML = renderSettingsView(this.state);
    this.bindEvents();
  }

  private bindEvents(): void {
    const keyInput = this.container.querySelector<HTMLInputElement>('#cfgApiKey');
    const btnDummy = this.container.querySelector<HTMLButtonElement>('#btnSetDummyKey');
    const btnRemove = this.container.querySelector<HTMLButtonElement>('#btnRemoveKey');
    const btnSave = this.container.querySelector<HTMLButtonElement>('#btnSaveSettings');
    const btnReset = this.container.querySelector<HTMLButtonElement>('#btnResetSettings');

    btnDummy?.addEventListener('click', () => {
      if (keyInput) {
        keyInput.value = 'dummy_secret';
        keyInput.focus();
      }
    });

    btnRemove?.addEventListener('click', async () => {
      try {
        const resp = (await this.bridge.sendCommand('SETTINGS_UPDATE', { action: 'REMOVE_KEY' })) as {
          success?: boolean;
          hasKey?: boolean;
          error?: string;
        };
        if (resp?.success === false) {
          this.updateState({
            statusMessage: resp.error ?? 'Failed to remove key',
            statusType: 'error',
          });
          return;
        }
        const hasKey = resp?.hasKey ?? false;
        this.bridge.setHasKeyStatus(hasKey);
        this.updateState({
          hasPersonalKey: hasKey,
          maskedKey: null,
          statusMessage: 'Personal API key removed',
          statusType: 'info',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to remove key';
        this.updateState({ statusMessage: msg, statusType: 'error' });
      }
    });

    btnSave?.addEventListener('click', async () => {
      try {
        const key = keyInput?.value?.trim();
        const chkEnable = this.container.querySelector<HTMLInputElement>('#chkEnableJev');
        const chkConsent = this.container.querySelector<HTMLInputElement>('#chkConsent');
        const numTimeout = this.container.querySelector<HTMLInputElement>('#numTimeout');

        const enabled = chkEnable?.checked ?? false;
        const consent = chkConsent?.checked ?? false;
        const timeoutMs = parseInt(numTimeout?.value ?? '5000', 10) || 5000;

        let hasKey = this.state?.hasPersonalKey ?? false;

        const updatePayload: Record<string, unknown> = {
          action: key && key.length > 0 ? 'SAVE_KEY' : 'UPDATE',
          apiKey: key && key.length > 0 ? key : undefined,
          enabled,
          consent,
          timeoutMs,
        };

        const resp = (await this.bridge.sendCommand('SETTINGS_UPDATE', updatePayload)) as {
          success?: boolean;
          hasKey?: boolean;
          error?: string;
        };

        if (resp?.success === false) {
          this.updateState({
            statusMessage: resp.error ?? 'Failed to save settings',
            statusType: 'error',
          });
          return;
        }

        if (key && key.length > 0) {
          hasKey = resp?.hasKey ?? true;
          this.bridge.setHasKeyStatus(hasKey);
        }

        this.updateState({
          hasPersonalKey: hasKey,
          maskedKey: hasKey ? '••••••••••••••••' : null,
          enabled,
          consent,
          timeoutMs,
          statusMessage: 'Settings saved successfully',
          statusType: 'success',
        });
        if (keyInput) keyInput.value = '';
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save settings';
        this.updateState({ statusMessage: msg, statusType: 'error' });
      }
    });

    btnReset?.addEventListener('click', async () => {
      try {
        await this.bridge.sendCommand('SETTINGS_UPDATE', {
          action: 'UPDATE',
          enabled: false,
          consent: false,
          timeoutMs: 5000,
        });
      } catch {
      }
      this.updateState({
        enabled: false,
        consent: false,
        timeoutMs: 5000,
        statusMessage: 'Defaults restored',
        statusType: 'info',
      });
    });
  }

  private updateState(patch: Partial<SettingsViewState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...patch };
    this.render();
  }
}
