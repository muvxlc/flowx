export type SettingsErrorCode =
  | 'INVALID_ENDPOINT'
  | 'INVALID_TIMEOUT'
  | 'CONSENT_REQUIRED'
  | 'G1_BLOCKED'
  | 'INVALID_KEY'
  | 'STORAGE_ERROR';

export class SettingsError extends Error {
  readonly code: SettingsErrorCode;

  constructor(code: SettingsErrorCode, message: string) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
    Object.setPrototypeOf(this, SettingsError.prototype);
  }
}

export interface PublicSettings {
  readonly endpoint: string;
  readonly modelId: string;
  readonly displayLabel: string;
  readonly hasPersonalKey: boolean;
  readonly maskedKey: string | null;
  readonly enabled: boolean;
  readonly consent: boolean;
  readonly timeoutMs: number;
  readonly isG1Blocked: boolean;
}

export interface StoredSettings {
  readonly endpoint: string;
  readonly enabled: boolean;
  readonly consent: boolean;
  readonly timeoutMs: number;
}

export interface UpdateSettingsInput {
  readonly endpoint?: string;
  readonly enabled?: boolean;
  readonly consent?: boolean;
  readonly timeoutMs?: number;
}

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
