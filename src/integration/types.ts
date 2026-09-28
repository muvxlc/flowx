import type { Job, JobResult, MediaTarget, JobMode } from '../queue/types.ts';
import type { ReferenceAsset } from '../import/types.ts';
import type { EnqueueCommand } from '../ui/create/types.ts';
import type { MetaAdapter, MetaAdapterResult } from '../providers/meta/types.ts';
import type { QueueManager } from '../queue/queue.ts';
import type { PersistenceService } from '../persistence/service.ts';
import type { SafeQueueScheduler } from '../scheduler/scheduler.ts';

export interface WorkflowOrchestratorOptions {
  queue?: QueueManager | undefined;
  persistence?: PersistenceService | undefined;
  scheduler?: SafeQueueScheduler | undefined;
  metaAdapter?: MetaAdapter | undefined;
}

export interface EnqueueBatchInput {
  readonly media: MediaTarget;
  readonly mode: JobMode;
  readonly promptsText: string;
  readonly references: readonly ReferenceAsset[];
}

export type EnqueuePayload = EnqueueBatchInput | EnqueueCommand;

export interface InterruptedRecoveryReport {
  readonly resetToPendingCount: number;
  readonly escalatedToNeedsReviewCount: number;
  readonly recoveredJobIds: readonly string[];
}

export interface DownloadStatusInfo {
  readonly canDownload: boolean;
  readonly statusText: string;
  readonly isMock: boolean;
  readonly mediaUrl: string;
}

export interface SafeSettingsSummary {
  readonly endpoint: string;
  readonly modelId: string;
  readonly displayLabel: string;
  readonly hasKey: boolean;
  readonly isG1Blocked: boolean;
  readonly isG0Blocked: boolean;
}

export type { EnqueueCommand };
