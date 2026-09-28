import type { Job, JobSettings, MediaTarget, JobMode } from '../../queue/types.ts';
import type { PersistenceService } from '../../persistence/service.ts';
import type { QueueManager } from '../../queue/queue.ts';

export interface JobEditPayload {
  readonly prompt?: string;
  readonly settings?: Partial<JobSettings>;
  readonly media?: MediaTarget;
  readonly mode?: JobMode;
}

export interface QueueViewOptions {
  readonly jobs: readonly Job[];
  readonly queueRunning?: boolean;
  readonly activeJobId?: string | null;
  readonly progressPercentage?: number;
  readonly isLoading?: boolean;
  readonly errorMessage?: string | null;
  readonly statusAlert?: string | null;
  readonly inspectingJobId?: string | null;
  readonly editingJobId?: string | null;
}

export interface QueuePanelState {
  readonly jobs: readonly Job[];
  readonly queueRunning: boolean;
  readonly activeJobId: string | null;
  readonly progressPercentage: number;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly statusAlert: string | null;
  readonly inspectingJobId: string | null;
  readonly editingJobId: string | null;
}

export interface QueueControllerOptions {
  readonly persistence?: PersistenceService;
  readonly queueManager?: QueueManager;
  readonly onStateChange?: (state: QueuePanelState) => void;
}
