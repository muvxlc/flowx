import type { PersistedJob } from './types.ts';

export interface WorkerRehydrationResult {
  readonly jobs: PersistedJob[];
  readonly interruptedResetCount: number;
}

export interface MediaIntegrityResult {
  readonly jobs: PersistedJob[];
  readonly missingMediaCount: number;
}

export class RecoveryManager {
  private readonly maxInterrupts: number;

  constructor(maxInterrupts = 3) {
    this.maxInterrupts = maxInterrupts;
  }

  rehydrateOnWorkerRestart(persistedJobs: PersistedJob[]): WorkerRehydrationResult {
    let interruptedResetCount = 0;
    const rehydrated: PersistedJob[] = [];

    for (const job of persistedJobs) {
      if (job.state === 'completed') {
        // Invariant: Completed jobs must never be repeated or reset
        rehydrated.push(job);
        continue;
      }

      if (job.state === 'running') {
        interruptedResetCount++;
        const nextInterruptCount = (job.interruptCount ?? 0) + 1;
        const reachedMaxInterrupts = nextInterruptCount >= this.maxInterrupts;
        const reachedMaxRetries = job.retryCount >= job.maxRetries;

        if (reachedMaxInterrupts || reachedMaxRetries) {
          rehydrated.push({
            ...job,
            state: 'needs-review',
            interruptCount: nextInterruptCount,
            startedAt: null,
            updatedAt: Date.now(),
            error: `Worker recreation: job repeatedly interrupted (${nextInterruptCount} times). Requires manual review.`,
          });
        } else {
          rehydrated.push({
            ...job,
            state: 'pending',
            interruptCount: nextInterruptCount,
            startedAt: null,
            updatedAt: Date.now(),
            error: `Worker suspended/recreated: job interrupted (attempt ${nextInterruptCount}/${this.maxInterrupts})`,
          });
        }
        continue;
      }

      // Preserves 'draft', 'pending', 'paused', 'failed', 'needs-review'
      rehydrated.push(job);
    }

    return {
      jobs: rehydrated,
      interruptedResetCount,
    };
  }

  async verifyMediaIntegrity(
    jobs: PersistedJob[],
    mediaChecker: (refId: string) => Promise<boolean>
  ): Promise<MediaIntegrityResult> {
    let missingMediaCount = 0;
    const audited: PersistedJob[] = [];

    for (const job of jobs) {
      if (job.state === 'completed') {
        audited.push(job);
        continue;
      }

      if (job.referenceId && job.referenceId.trim() !== '') {
        const exists = await mediaChecker(job.referenceId);
        if (!exists) {
          missingMediaCount++;
          audited.push({
            ...job,
            state: 'needs-review',
            updatedAt: Date.now(),
            error: `Missing media reference: ${job.referenceId}`,
          });
          continue;
        }
      }
      audited.push(job);
    }

    return {
      jobs: audited,
      missingMediaCount,
    };
  }
}
