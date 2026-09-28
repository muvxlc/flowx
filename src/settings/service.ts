import {
  PINNED_9ROUTER_ENDPOINT,
  UNKNOWN_MODEL_ID,
  JEV_DISPLAY_LABEL,
  DEFAULT_TIMEOUT_MS,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_SECRET,
  MASKED_KEY_STRING,
} from './constants.ts';
import type {
  PublicSettings,
  StoredSettings,
  StorageAdapter,
  UpdateSettingsInput,
} from './types.ts';
import { SettingsError } from './types.ts';
import {
  validateEndpoint,
  validateTimeout,
  validatePersonalKey,
  validateConsent,
} from './validator.ts';

export class SettingsService {
  private readonly storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  async getPublicSettings(): Promise<PublicSettings> {
    const stored = await this.getStoredSettings();
    const hasKey = await this.hasPersonalKey();

    return {
      endpoint: PINNED_9ROUTER_ENDPOINT,
      modelId: UNKNOWN_MODEL_ID,
      displayLabel: JEV_DISPLAY_LABEL,
      hasPersonalKey: hasKey,
      maskedKey: hasKey ? MASKED_KEY_STRING : null,
      enabled: stored.enabled,
      consent: stored.consent,
      timeoutMs: stored.timeoutMs,
      isG1Blocked: true,
    };
  }

  async savePersonalKey(rawKey: string): Promise<void> {
    const validKey = validatePersonalKey(rawKey);
    await this.storage.set(STORAGE_KEY_SECRET, validKey);
  }

  async removePersonalKey(): Promise<void> {
    await this.storage.remove(STORAGE_KEY_SECRET);
  }

  async updateSettings(input: UpdateSettingsInput): Promise<PublicSettings> {
    if (input.endpoint !== undefined) {
      validateEndpoint(input.endpoint);
    }
    if (input.timeoutMs !== undefined) {
      validateTimeout(input.timeoutMs);
    }

    const current = await this.getStoredSettings();
    const updated: StoredSettings = {
      endpoint: PINNED_9ROUTER_ENDPOINT,
      enabled: input.enabled ?? current.enabled,
      consent: input.consent ?? current.consent,
      timeoutMs: input.timeoutMs ?? current.timeoutMs,
    };

    await this.storage.set(STORAGE_KEY_SETTINGS, updated);
    return this.getPublicSettings();
  }

  async getInternalKeyForBackground(): Promise<string | null> {
    const settings = await this.getStoredSettings();
    validateConsent(settings.consent);
    return this.storage.get<string>(STORAGE_KEY_SECRET);
  }

  async executeLiveTest(): Promise<never> {
    throw new SettingsError(
      'G1_BLOCKED',
      'Live connection test disabled: G1 contract gate BLOCKED pending verified credentials and endpoint contract'
    );
  }

  isG1Blocked(): boolean {
    return true;
  }

  private async hasPersonalKey(): Promise<boolean> {
    const key = await this.storage.get<string>(STORAGE_KEY_SECRET);
    return typeof key === 'string' && key.trim().length > 0;
  }

  private async getStoredSettings(): Promise<StoredSettings> {
    const data = await this.storage.get<Partial<StoredSettings>>(STORAGE_KEY_SETTINGS);
    if (!data || typeof data !== 'object') {
      return {
        endpoint: PINNED_9ROUTER_ENDPOINT,
        enabled: false,
        consent: false,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      };
    }

    return {
      endpoint: PINNED_9ROUTER_ENDPOINT,
      enabled: typeof data.enabled === 'boolean' ? data.enabled : false,
      consent: typeof data.consent === 'boolean' ? data.consent : false,
      timeoutMs:
        typeof data.timeoutMs === 'number' && Number.isFinite(data.timeoutMs)
          ? data.timeoutMs
          : DEFAULT_TIMEOUT_MS,
    };
  }
}
