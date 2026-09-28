import { SettingsService } from '../settings/service.ts';
import type { StorageAdapter, UpdateSettingsInput, StoredSettings } from '../settings/types.ts';
import { SettingsError } from '../settings/types.ts';
import { STORAGE_KEY_SECRET, STORAGE_KEY_SETTINGS } from '../settings/constants.ts';
import { validatePersonalKey, validateTimeout, validateEndpoint } from '../settings/validator.ts';
import { G0_VERDICT } from '../providers/meta/gate.ts';
import { G1_VERDICT } from '../jev/gate.ts';
import type { SafeSettingsSummary } from './types.ts';
import type { ChromeStorageArea } from '../persistence/types.ts';

export interface WorkerSettingsSummary extends SafeSettingsSummary {
  readonly enabled: boolean;
  readonly consent: boolean;
  readonly timeoutMs: number;
}

export class ChromeStorageAreaAdapter implements StorageAdapter {
  private readonly area: ChromeStorageArea;

  constructor(area: ChromeStorageArea) {
    this.area = area;
  }

  async get<T>(key: string): Promise<T | null> {
    const res = await this.area.get(key);
    const val = res ? (res[key] as T | undefined) : undefined;
    return val !== undefined ? val : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.area.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await this.area.remove(key);
  }
}

export function extractPreferences(payload: Record<string, unknown> | undefined): UpdateSettingsInput {
  if (!payload) return {};
  const prefs: Record<string, unknown> = {};
  if (typeof payload.endpoint === 'string') prefs.endpoint = payload.endpoint;
  if (typeof payload.enabled === 'boolean') prefs.enabled = payload.enabled;
  else if (payload.enabled !== undefined) prefs.enabled = payload.enabled;

  if (typeof payload.consent === 'boolean') prefs.consent = payload.consent;
  else if (payload.consent !== undefined) prefs.consent = payload.consent;

  if (typeof payload.timeoutMs === 'number') prefs.timeoutMs = payload.timeoutMs;
  else if (payload.timeoutMs !== undefined) prefs.timeoutMs = payload.timeoutMs;

  return prefs as UpdateSettingsInput;
}

export function hasPreferencesPayload(payload: Record<string, unknown> | undefined): boolean {
  if (!payload) return false;
  return (
    payload.enabled !== undefined ||
    payload.consent !== undefined ||
    payload.timeoutMs !== undefined ||
    payload.endpoint !== undefined
  );
}

export function validateSettingsPreferences(input: UpdateSettingsInput): void {
  if (input.endpoint !== undefined) {
    validateEndpoint(input.endpoint);
  }
  if (input.timeoutMs !== undefined) {
    validateTimeout(input.timeoutMs);
  }
  if (input.consent !== undefined && typeof input.consent !== 'boolean') {
    throw new SettingsError('CONSENT_REQUIRED', 'Consent must be a boolean');
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new SettingsError('STORAGE_ERROR', 'Enabled must be a boolean');
  }
}

export async function getWorkerSettings(
  settingsService: SettingsService
): Promise<WorkerSettingsSummary> {
  const pub = await settingsService.getPublicSettings();
  return {
    endpoint: pub.endpoint,
    modelId: pub.modelId,
    displayLabel: pub.displayLabel,
    hasKey: pub.hasPersonalKey,
    enabled: pub.enabled,
    consent: pub.consent,
    timeoutMs: pub.timeoutMs,
    isG1Blocked: G1_VERDICT.status === 'BLOCKED',
    isG0Blocked: G0_VERDICT.status === 'BLOCKED',
  };
}

export async function updateWorkerSettings(
  settingsService: SettingsService,
  input: UpdateSettingsInput
): Promise<WorkerSettingsSummary> {
  validateSettingsPreferences(input);
  await settingsService.updateSettings(input);
  return getWorkerSettings(settingsService);
}

export async function saveWorkerSettingsKey(
  settingsService: SettingsService,
  storage: StorageAdapter,
  key: string,
  preferences?: UpdateSettingsInput
): Promise<{ success: boolean; hasKey: boolean; settings: WorkerSettingsSummary }> {
  const validKey = validatePersonalKey(key);

  if (preferences) {
    validateSettingsPreferences(preferences);
  }

  const prevKey = await storage.get<string>(STORAGE_KEY_SECRET);

  await storage.set(STORAGE_KEY_SECRET, validKey);

  if (preferences && (preferences.enabled !== undefined || preferences.consent !== undefined || preferences.timeoutMs !== undefined || preferences.endpoint !== undefined)) {
    try {
      await settingsService.updateSettings(preferences);
    } catch (err) {
      if (prevKey !== null && prevKey !== undefined) {
        await storage.set(STORAGE_KEY_SECRET, prevKey);
      } else {
        await storage.remove(STORAGE_KEY_SECRET);
      }
      throw err;
    }
  }

  const settings = await getWorkerSettings(settingsService);
  return { success: true, hasKey: settings.hasKey, settings };
}

export async function removeWorkerSettingsKey(
  settingsService: SettingsService
): Promise<{ success: boolean; hasKey: boolean; settings: WorkerSettingsSummary }> {
  await settingsService.removePersonalKey();
  const settings = await getWorkerSettings(settingsService);
  return { success: true, hasKey: false, settings };
}
