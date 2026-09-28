import type { Job, JobResult } from '../queue/types.ts';
import { QueueManager } from '../queue/queue.ts';
import { createJob, transitionJob } from '../queue/state.ts';
import { PersistenceService } from '../persistence/service.ts';
import { SafeQueueScheduler } from '../scheduler/scheduler.ts';
import { MetaMockAdapter } from '../providers/meta/mock-adapter.ts';
import type { MetaAdapter, MetaMockResult } from '../providers/meta/types.ts';
import { G0_VERDICT, isLiveAllowed, assertLivePermitted } from '../providers/meta/gate.ts';
import { importJobBatch } from '../import/index.ts';
import { generateCsvExport } from '../exports/csv.ts';
import type {
  WorkflowOrchestratorOptions,
  EnqueueCommand,
  EnqueueBatchInput,
  EnqueuePayload,
  InterruptedRecoveryReport,
  DownloadStatusInfo,
} from './types.ts';

export type { WorkflowOrchestratorOptions, EnqueueBatchInput, EnqueuePayload };

export class WorkflowOrchestrator {
  private readonly queue: QueueManager;
  private readonly persistence: PersistenceService | undefined;
  private readonly scheduler: SafeQueueScheduler | undefined;
  private readonly metaAdapter: MetaAdapter;
  private paused = false;
  private pauseReason: string | null = null;
  private isProcessingStep = false;

  constructor(options?: WorkflowOrchestratorOptions) {
    this.queue = options?.queue ?? new QueueManager();
    this.persistence = options?.persistence;
    this.scheduler = options?.scheduler;
    this.metaAdapter = options?.metaAdapter ?? new MetaMockAdapter();

    (this.queue as unknown as { executeJob: (job: Job) => Promise<Job> }).executeJob = async (
      runningJob: Job
    ) => {
      const execution = await this.metaAdapter.execute(runningJob);
      if (execution.status === 'completed' && execution.result) {
        return transitionJob(runningJob, {
          type: 'COMPLETE',
          result: execution.result,
        });
      }
      if (execution.status === 'needs-review') {
        return transitionJob(runningJob, {
          type: 'MARK_NEEDS_REVIEW',
          reason: execution.error ?? 'Manual operator review required',
        });
      }
      if (execution.status === 'paused') {
        this.pause(execution.error ?? 'Rate limit or verification pause');
        throw new Error(`429 rate limit: ${execution.error}`);
      }
      throw new Error(execution.error ?? 'Execution failed');
    };
  }

  isLiveBlocked(): boolean {
    return !isLiveAllowed();
  }

  assertLivePermitted(): never {
    return assertLivePermitted();
  }

  async enqueueBatch(command: EnqueuePayload): Promise<Job[]> {
    let drafts: readonly import('../import/types.ts').ImportedJobDraft[];
    if ('type' in command && command.type === 'ENQUEUE_JOBS') {
      drafts = command.jobs;
    } else {
      const input = command as EnqueueBatchInput;
      const importResult = importJobBatch({
        media: input.media,
        mode: input.mode,
        promptSource: {
          type: 'paste',
          rawText: input.promptsText,
        },
        references: input.references,
        provider: 'meta',
      });

      if (!importResult.success) {
        throw new Error(
          `Failed to enqueue batch: ${importResult.errors.map((e) => e.message).join(', ')}`
        );
      }
      drafts = importResult.jobs;
    }

    const enqueued: Job[] = [];
    for (const draft of drafts) {
      const job = createJob({
        ...draft,
        state: 'pending',
      });
      this.queue.addJob(job);
      enqueued.push(job);
    }

    if (this.persistence) {
      await this.persistence.saveQueue(this.queue.getJobs());
    }

    return enqueued;
  }

  getJobs(): Job[] {
    return this.queue.getJobs();
  }

  getCompletedJobs(): Job[] {
    return this.queue.getJobs().filter((j) => j.state === 'completed');
  }

  isPaused(): boolean {
    return this.paused || (this.scheduler ? this.scheduler.isPaused() : false);
  }

  getPauseReason(): string | null {
    return this.pauseReason;
  }

  pause(reason = 'Operator paused queue'): void {
    this.paused = true;
    this.pauseReason = reason;
    this.queue.pause(reason);
    if (this.scheduler) {
      this.scheduler.pause(reason);
    }
  }

  resume(): void {
    this.paused = false;
    this.pauseReason = null;
    this.queue.resume();
    if (this.scheduler) {
      this.scheduler.resume();
    }
  }

  async step(): Promise<Job | null> {
    if (this.isProcessingStep || this.isPaused()) {
      return null;
    }

    this.isProcessingStep = true;
    try {
      const completed = await this.queue.step();
    if (this.persistence && completed) {
      await this.persistence.saveQueue(this.queue.getJobs());
    }
      return completed;
    } finally {
      this.isProcessingStep = false;
    }
  }

  async runAll(): Promise<Job[]> {
    const executed: Job[] = [];
    while (!this.isPaused()) {
      const nextPending = this.queue.getJobs().find((j) => j.state === 'pending');
      if (!nextPending) {
        break;
      }
      const done = await this.step();
      if (!done) {
        break;
      }
      executed.push(done);
    }
    return executed;
  }

  async recoverInterruptedJobs(): Promise<InterruptedRecoveryReport> {
    if (!this.persistence) {
      return { resetToPendingCount: 0, escalatedToNeedsReviewCount: 0, recoveredJobIds: [] };
    }

    const rehydrated = await this.persistence.rehydrateQueue();
    const recoveredIds: string[] = [];

    (this.queue as unknown as { jobs: Job[] }).jobs = [];

    for (const job of rehydrated.jobs) {
      this.queue.addJob(job as Job);
      if ((job.interruptCount ?? 0) > 0) {
        recoveredIds.push(job.id);
      }
    }

    return {
      resetToPendingCount: rehydrated.interruptedResetCount,
      escalatedToNeedsReviewCount: rehydrated.jobs.filter((j) => j.state === 'needs-review').length,
      recoveredJobIds: recoveredIds,
    };
  }

  getJobDownloadStatus(job: Job): DownloadStatusInfo {
    const isCompleted = job.state === 'completed';
    const mediaUrl = job.result?.mediaUrl ?? '';
    const isMock = mediaUrl.startsWith('mock://') || mediaUrl.includes('non-downloadable');

    if (!isCompleted || !mediaUrl) {
      return {
        canDownload: false,
        statusText: 'Incomplete',
        isMock,
        mediaUrl,
      };
    }

    if (isMock) {
      return {
        canDownload: false,
        statusText: 'Mock Non-Downloadable (Simulated)',
        isMock: true,
        mediaUrl,
      };
    }

    return {
      canDownload: true,
      statusText: 'Ready',
      isMock: false,
      mediaUrl,
    };
  }

  exportCsv(options?: { includePrompt?: boolean }): string {
    return generateCsvExport(this.getCompletedJobs(), options);
  }
}
