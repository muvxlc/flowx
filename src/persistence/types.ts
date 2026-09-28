export type JobState =
  | 'draft'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'needs-review';

export const VALID_JOB_STATES: readonly JobState[] = [
  'draft',
  'pending',
  'running',
  'completed',
  'failed',
  'paused',
  'needs-review',
] as const;

export type MediaTarget = 'image' | 'video';
export type JobMode = 'text-only' | 'single-ref' | 'paired-ref';
export type ProviderId = 'meta' | 'mock';
export type StorageSchemaVersion = number;

export interface JobSettings {
  readonly aspectRatio?: string;
  readonly durationSeconds?: number;
  readonly quality?: string;
  readonly customParameters?: Record<string, unknown>;
}

export interface JobResult {
  readonly idempotencyKey: string;
  readonly mediaUrl: string;
  readonly mediaType: MediaTarget;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly completedAt: number;
}

export interface PersistedJob {
  readonly id: string;
  readonly media: MediaTarget;
  readonly mode: JobMode;
  readonly prompt: string;
  readonly referenceId?: string | null;
  readonly provider: ProviderId;
  readonly settings?: JobSettings;
  readonly state: JobState;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly startedAt?: number | null;
  readonly completedAt?: number | null;
  readonly error?: string | null;
  readonly result?: JobResult | null;
  readonly idempotencyKey?: string | null;
  readonly interruptCount?: number;
}

export interface MediaReference {
  readonly id: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly createdAt: number;
  readonly hash?: string;
}

export interface StoredMedia {
  readonly data: Uint8Array | ArrayBuffer;
  readonly mimeType: string;
}

export interface ChromeStorageArea {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface QuarantinedRecord {
  readonly recordIndex: number;
  readonly rawData: unknown;
  readonly quarantinedAt: number;
  readonly reason: string;
}

export interface RehydrationReport {
  readonly jobs: PersistedJob[];
  readonly interruptedResetCount: number;
  readonly missingMediaCount: number;
  readonly quarantinedCount: number;
}
