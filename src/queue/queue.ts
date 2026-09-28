import type { Job, JobState } from './types.ts';
import { transitionJob } from './state.ts';

export interface QueueRunnerOptions {
  executeJob?: (job: Job) => Promise<Job>;
  onStateChange?: (job: Job) => void;
}

export class QueueManager {
  private jobs: Job[] = [];
  private activeJobId: string | null = null;
  private isProcessing = false;
  private isPaused = false;
  private executeJob: (job: Job) => Promise<Job>;
  private onStateChange?: ((job: Job) => void) | undefined;

  constructor(options?: QueueRunnerOptions) {
    this.executeJob =
      options?.executeJob ??
      (async (job: Job) => {
        return transitionJob(job, {
          type: 'COMPLETE',
          result: {
            idempotencyKey: `mock_idem_${job.id}`,
            mediaUrl: `https://example.com/artifacts/${job.id}.${job.media === 'video' ? 'mp4' : 'png'}`,
            mediaType: job.media,
            mimeType: job.media === 'video' ? 'video/mp4' : 'image/png',
            completedAt: Date.now()
          }
        });
      });
    if (options?.onStateChange) {
      this.onStateChange = options.onStateChange;
    }
  }

  addJob(job: Job): void {
    if (this.jobs.some((j) => j.id === job.id)) {
      throw new Error(`Job with id '${job.id}' already exists in queue`);
    }
    this.jobs.push(job);
    this.notify(job);
  }

  getJobs(): Job[] {
    return [...this.jobs];
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.find((j) => j.id === jobId);
  }

  getActiveJob(): Job | null {
    if (!this.activeJobId) return null;
    return this.jobs.find((j) => j.id === this.activeJobId) ?? null;
  }

  getQueueStatus(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    paused: number;
    needsReview: number;
  } {
    const counts = {
      total: this.jobs.length,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      paused: 0,
      needsReview: 0
    };
    for (const job of this.jobs) {
      if (job.state === 'pending') counts.pending++;
      else if (job.state === 'running') counts.running++;
      else if (job.state === 'completed') counts.completed++;
      else if (job.state === 'failed') counts.failed++;
      else if (job.state === 'paused') counts.paused++;
      else if (job.state === 'needs-review') counts.needsReview++;
    }
    return counts;
  }

  private updateJob(updated: Job): void {
    const idx = this.jobs.findIndex((j) => j.id === updated.id);
    if (idx !== -1) {
      this.jobs[idx] = updated;
      this.notify(updated);
    }
  }

  private notify(job: Job): void {
    if (this.onStateChange) {
      this.onStateChange(job);
    }
  }

  async step(): Promise<Job | null> {
    if (this.activeJobId) {
      throw new Error(`Cannot step queue: job '${this.activeJobId}' is currently running`);
    }
    if (this.isPaused) {
      return null;
    }

    const pendingJob = this.jobs.find((j) => j.state === 'pending');
    if (!pendingJob) {
      return null;
    }

    // Single active submission invariant
    this.activeJobId = pendingJob.id;
    let running = transitionJob(pendingJob, { type: 'START', startedAt: Date.now() });
    this.updateJob(running);

    try {
      const finished = await this.executeJob(running);
      const current = this.getJob(running.id);
      if (current && current.state !== 'running') {
        return current;
      }
      this.updateJob(finished);
      return finished;
    } catch (err: unknown) {
      const current = this.getJob(running.id);
      if (current && current.state !== 'running') {
        return current;
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isChallengeOr429 = /429|rate[- ]?limit|challenge|captcha/i.test(errorMsg);

      if (isChallengeOr429) {
        // Safety requirement: challenge or 429 pauses rather than blind retry
        const paused = transitionJob(running, {
          type: 'PAUSE',
          reason: `Safety pause: ${errorMsg}`
        });
        this.updateJob(paused);
        this.isPaused = true;
        return paused;
      }

      const isTimeout = /timeout|timed[- ]?out/i.test(errorMsg);
      if (isTimeout) {
        // Timeout requires operator review or pause
        const needsReview = transitionJob(running, {
          type: 'MARK_NEEDS_REVIEW',
          reason: `Execution timeout: ${errorMsg}`
        });
        this.updateJob(needsReview);
        return needsReview;
      }

      // Standard bounded retry
      const failedOrRetried = transitionJob(running, {
        type: 'FAIL',
        error: errorMsg,
        fatal: false
      });
      this.updateJob(failedOrRetried);
      return failedOrRetried;
    } finally {
      this.activeJobId = null;
    }
  }

  async start(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.isPaused = false;

    try {
      while (this.isProcessing && !this.isPaused) {
        const nextPending = this.jobs.find((j) => j.state === 'pending');
        if (!nextPending) break;
        await this.step();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  pause(reason = 'Queue paused by user'): void {
    this.isPaused = true;
    this.isProcessing = false;
    for (const job of this.jobs) {
      if (job.state === 'pending') {
        const paused = transitionJob(job, { type: 'PAUSE', reason });
        this.updateJob(paused);
      }
    }
  }

  resume(): void {
    this.isPaused = false;
    for (const job of this.jobs) {
      if (job.state === 'paused') {
        const resumed = transitionJob(job, { type: 'RESUME' });
        this.updateJob(resumed);
      }
    }
  }

  cancelJob(jobId: string, reason = 'Cancelled by user'): void {
    const job = this.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found`);
    }
    if (job.state === 'completed') {
      throw new Error(`Cannot cancel completed job '${jobId}'`);
    }
    const cancelled = transitionJob(job, { type: 'CANCEL', reason });
    this.updateJob(cancelled);
  }

  clearCompleted(): void {
    this.jobs = this.jobs.filter((j) => j.state !== 'completed');
  }

  reorderPending(orderedPendingIds: string[]): void {
    const currentPending = this.jobs.filter((j) => j.state === 'pending');
    if (currentPending.length !== orderedPendingIds.length) {
      throw new Error('Reorder list length does not match pending job count');
    }
    const uniqueIds = new Set(orderedPendingIds);
    if (uniqueIds.size !== orderedPendingIds.length) {
      throw new Error('Reorder list contains duplicate job IDs');
    }
    const idMap = new Map(currentPending.map((j) => [j.id, j]));
    const reordered: Job[] = [];
    for (const id of orderedPendingIds) {
      const job = idMap.get(id);
      if (!job) {
        throw new Error(`Job '${id}' is not in pending state or not found`);
      }
      reordered.push(job);
    }

    // Reconstruct jobs array preserving non-pending positions where possible
    let pendingIdx = 0;
    this.jobs = this.jobs.map((job) => {
      if (job.state === 'pending') {
        return reordered[pendingIdx++]!;
      }
      return job;
    });
  }
}
