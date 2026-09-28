import type { Job } from '../../queue/types.ts';
import type {
  JobEditPayload,
  QueueControllerOptions,
  QueuePanelState,
} from './types.ts';
import type { PersistenceService } from '../../persistence/service.ts';
import type { QueueManager } from '../../queue/queue.ts';
import {
  moveJobInList,
  reorderJobsList,
  applyJobEdit,
  createJobDuplicate,
  applyJobRetry,
  applyJobCancel,
} from './queue-mutations.ts';

export class QueueController {
  private jobs: Job[] = [];
  private queueRunning = false;
  private activeJobId: string | null = null;
  private isLoading = false;
  private errorMessage: string | null = null;
  private statusAlert: string | null = null;
  private inspectingJobId: string | null = null;
  private editingJobId: string | null = null;
  private readonly persistence?: PersistenceService | undefined;
  private readonly queueManager?: QueueManager | undefined;
  private readonly onStateChange?: ((state: QueuePanelState) => void) | undefined;

  constructor(options?: QueueControllerOptions) {
    this.persistence = options?.persistence;
    this.queueManager = options?.queueManager;
    this.onStateChange = options?.onStateChange;
  }

  getState(): QueuePanelState {
    const total = this.jobs.length;
    const completed = this.jobs.filter((j) => j.state === 'completed').length;
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      jobs: [...this.jobs],
      queueRunning: this.queueRunning,
      activeJobId: this.activeJobId,
      progressPercentage: pct,
      isLoading: this.isLoading,
      errorMessage: this.errorMessage,
      statusAlert: this.statusAlert,
      inspectingJobId: this.inspectingJobId,
      editingJobId: this.editingJobId,
    };
  }

  getJobs(): Job[] {
    return [...this.jobs];
  }

  async setJobs(jobs: Job[]): Promise<void> {
    this.jobs = [...jobs];
    await this.syncToPersistence();
    this.notify();
  }

  async loadFromPersistence(): Promise<void> {
    if (!this.persistence) return;
    this.isLoading = true;
    this.notify();

    try {
      const report = await this.persistence.rehydrateQueue();
      this.jobs = report.jobs.map((pj) => ({
        ...pj,
        retryCount: pj.retryCount ?? 0,
        maxRetries: pj.maxRetries ?? 3,
        provider: pj.provider ?? 'meta',
      })) as Job[];
      this.errorMessage = null;
    } catch (err: unknown) {
      this.errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      this.isLoading = false;
      this.notify();
    }
  }

  private async syncToPersistence(): Promise<void> {
    if (!this.persistence) return;
    await this.persistence.saveQueue(this.jobs);
  }

  private notify(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  async moveJob(jobId: string, direction: -1 | 1): Promise<void> {
    this.jobs = moveJobInList(this.jobs, jobId, direction);
    await this.syncToPersistence();
    this.notify();
  }

  async reorderJobs(orderedIds: string[]): Promise<void> {
    this.jobs = reorderJobsList(this.jobs, orderedIds);
    await this.syncToPersistence();
    this.notify();
  }

  async editJob(jobId: string, updates: JobEditPayload): Promise<Job> {
    const { jobs, updatedJob } = applyJobEdit(this.jobs, jobId, updates);
    this.jobs = jobs;
    await this.syncToPersistence();
    this.notify();
    return updatedJob;
  }

  async duplicateJob(jobId: string): Promise<Job> {
    const { jobs, duplicate } = createJobDuplicate(this.jobs, jobId);
    this.jobs = jobs;
    await this.syncToPersistence();
    this.notify();
    return duplicate;
  }

  inspectJob(jobId: string | null): void {
    this.inspectingJobId = jobId;
    this.notify();
  }

  editJobStart(jobId: string | null): void {
    if (jobId) {
      const job = this.jobs.find((j) => j.id === jobId);
      if (job && job.state === 'running') {
        throw new Error(`Cannot edit running job '${jobId}'`);
      }
    }
    this.editingJobId = jobId;
    this.notify();
  }

  async retryJob(jobId: string): Promise<Job> {
    const { jobs, retried } = applyJobRetry(this.jobs, jobId);
    this.jobs = jobs;
    await this.syncToPersistence();
    this.notify();
    return retried;
  }

  async cancelJob(jobId: string, reason = 'Cancelled by operator'): Promise<void> {
    this.jobs = applyJobCancel(this.jobs, jobId, reason);
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
    }
    await this.syncToPersistence();
    this.notify();
  }

  async clearCompleted(): Promise<void> {
    this.jobs = this.jobs.filter((j) => j.state !== 'completed');
    await this.syncToPersistence();
    this.notify();
  }

  async pauseQueue(reason = 'Paused by operator'): Promise<void> {
    this.queueRunning = false;
    this.statusAlert = `Queue paused: ${reason}`;
    this.jobs = this.jobs.map((j) =>
      j.state === 'pending' ? { ...j, state: 'paused' as const, updatedAt: Date.now() } : j
    );
    await this.syncToPersistence();
    this.notify();
  }

  async resumeQueue(): Promise<void> {
    this.queueRunning = true;
    this.statusAlert = 'Queue running';
    this.jobs = this.jobs.map((j) =>
      j.state === 'paused' ? { ...j, state: 'pending' as const, updatedAt: Date.now() } : j
    );
    await this.syncToPersistence();
    this.notify();
  }

  async simulate429(): Promise<void> {
    this.queueRunning = false;
    this.statusAlert = 'Safety pause: Challenge verification required (429)';
    this.errorMessage = 'Challenge verification required (429)';
    this.jobs = this.jobs.map((j) =>
      j.state === 'running' || j.state === 'pending'
        ? { ...j, state: 'paused' as const, error: 'Challenge pause (429)', updatedAt: Date.now() }
        : j
    );
    await this.syncToPersistence();
    this.notify();
  }

  async stepQueue(): Promise<Job | null> {
    if (this.queueManager) {
      const stepped = await this.queueManager.step();
      await this.loadFromPersistence();
      return stepped;
    }

    const nextPending = this.jobs.find((j) => j.state === 'pending');
    if (!nextPending) return null;

    const runningJob: Job = {
      ...nextPending,
      state: 'running',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.activeJobId = runningJob.id;
    this.jobs = this.jobs.map((j) => (j.id === runningJob.id ? runningJob : j));
    this.notify();

    const completedJob: Job = {
      ...runningJob,
      state: 'completed',
      completedAt: Date.now(),
      updatedAt: Date.now(),
      result: {
        idempotencyKey: `sim_idem_${runningJob.id}`,
        mediaUrl: `https://example.com/mock/${runningJob.id}.${runningJob.media === 'video' ? 'mp4' : 'png'}`,
        mediaType: runningJob.media,
        mimeType: runningJob.media === 'video' ? 'video/mp4' : 'image/png',
        completedAt: Date.now(),
      },
    };

    this.activeJobId = null;
    this.jobs = this.jobs.map((j) => (j.id === completedJob.id ? completedJob : j));
    await this.syncToPersistence();
    this.notify();
    return completedJob;
  }
}
