export interface SettingsViewState {
  readonly endpoint: string;
  readonly modelId: string;
  readonly displayLabel: string;
  readonly hasPersonalKey: boolean;
  readonly maskedKey: string | null;
  readonly enabled: boolean;
  readonly consent: boolean;
  readonly timeoutMs: number;
  readonly isG1Blocked: boolean;
  readonly statusMessage?: string | undefined;
  readonly statusType?: 'success' | 'error' | 'info' | undefined;
}

export interface SettingsFormData {
  readonly personalKey?: string;
  readonly enabled: boolean;
  readonly consent: boolean;
  readonly timeoutMs: number;
}
