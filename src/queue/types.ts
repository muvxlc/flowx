export type JobState =
  | 'draft'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'needs-review';

export type MediaTarget = 'image' | 'video';
export type JobMode = 'text-only' | 'single-ref' | 'paired-ref';
export type ProviderId = 'meta' | 'mock';

export interface JobSettings {
  aspectRatio?: string;
  durationSeconds?: number;
  quality?: string;
  customParameters?: Record<string, unknown>;
}

export interface JobResult {
  idempotencyKey: string;
  mediaUrl: string;
  mediaType: MediaTarget;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  completedAt: number;
}

export interface Job {
  id: string;
  media: MediaTarget;
  mode: JobMode;
  prompt: string;
  referenceId?: string | null;
  provider: ProviderId;
  settings: JobSettings;
  state: JobState;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
  error?: string | null;
  result?: JobResult | null;
  idempotencyKey?: string | null;
}

export type JobTransitionEvent =
  | { type: 'SUBMIT' }
  | { type: 'START'; startedAt?: number }
  | { type: 'COMPLETE'; result: JobResult }
  | { type: 'FAIL'; error: string; fatal?: boolean }
  | { type: 'PAUSE'; reason?: string }
  | { type: 'RESUME' }
  | { type: 'MARK_NEEDS_REVIEW'; reason: string }
  | { type: 'CANCEL'; reason?: string }
  | { type: 'RESOLVE_REVIEW'; approve: boolean };
