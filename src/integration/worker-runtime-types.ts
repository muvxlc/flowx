import type { Job } from '../queue/types.ts';
import type { ChromeStorageArea } from '../persistence/types.ts';
import type { MetaAdapter } from '../providers/meta/types.ts';
import type { AlarmClock } from '../scheduler/types.ts';
import type { StorageAdapter } from '../settings/types.ts';
import type { EnqueueBatchInput } from './types.ts';
import type { ImportedJobDraft } from '../import/types.ts';

export interface WorkerRuntimeOptions {
  readonly storageArea?: ChromeStorageArea | undefined;
  readonly metaAdapter?: MetaAdapter | undefined;
  readonly clock?: AlarmClock | undefined;
  readonly alarmName?: string | undefined;
  readonly settingsStorage?: StorageAdapter | undefined;
}

export interface WorkerQueueStatus {
  readonly totalJobs: number;
  readonly pendingCount: number;
  readonly runningCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly needsReviewCount: number;
  readonly isPaused: boolean;
  readonly pauseReason: string | null;
  readonly isRunning: boolean;
  readonly intent: 'idle' | 'active' | 'paused';
  readonly jobs: Job[];
}

export type QueueCommandName =
  | 'ENQUEUE'
  | 'START'
  | 'PAUSE'
  | 'STEP'
  | 'STATUS'
  | 'RESUME'
  | 'CLEAR_COMPLETED'
  | 'MOVE'
  | 'REORDER'
  | 'EDIT'
  | 'DUPLICATE'
  | 'CANCEL'
  | 'RETRY';

export interface QueueCommandPayload {
  readonly command: QueueCommandName;
  readonly batch?: EnqueueBatchInput | undefined;
  readonly jobs?: readonly ImportedJobDraft[] | undefined;
  readonly reason?: string | undefined;
}

export type SettingsActionName = 'SAVE_KEY' | 'REMOVE_KEY' | 'GET';

export interface SettingsCommandPayload {
  readonly action?: SettingsActionName | undefined;
  readonly apiKey?: string | undefined;
  readonly key?: string | undefined;
}
