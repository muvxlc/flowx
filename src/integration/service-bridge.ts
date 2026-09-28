import type { ExtensionMessage } from '../background/bootstrap.ts';
import type { SafeSettingsSummary } from './types.ts';
import { G0_VERDICT } from '../providers/meta/gate.ts';
import { G1_VERDICT } from '../jev/gate.ts';
import {
  PINNED_9ROUTER_ENDPOINT,
  UNKNOWN_MODEL_ID,
  JEV_DISPLAY_LABEL,
} from '../settings/constants.ts';

export class RuntimeBridge {
  private hasKeyLocally = false;

  hasRuntime(): boolean {
    return typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function';
  }

  isMockMode(): boolean {
    return !this.hasRuntime();
  }

  async ping(): Promise<boolean> {
    if (!this.hasRuntime()) {
      return false;
    }
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'PING',
        payload: { timestamp: Date.now() },
      });
      return resp?.success === true;
    } catch {
      return false;
    }
  }

  async sendCommand(action: string, payload?: unknown): Promise<unknown> {
    if (!this.hasRuntime()) {
      return { success: true, mockMode: true, action };
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: action, payload },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  getSettingsSummary(): SafeSettingsSummary {
    return {
      endpoint: PINNED_9ROUTER_ENDPOINT,
      modelId: UNKNOWN_MODEL_ID,
      displayLabel: JEV_DISPLAY_LABEL,
      hasKey: this.hasKeyLocally,
      isG1Blocked: G1_VERDICT.status === 'BLOCKED',
      isG0Blocked: G0_VERDICT.status === 'BLOCKED',
    };
  }

  setHasKeyStatus(hasKey: boolean): void {
    this.hasKeyLocally = hasKey;
  }
}
