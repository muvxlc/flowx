import type { Job } from '../queue/types.ts';
import type { QueueManager } from '../queue/queue.ts';
import type { PersistenceService } from '../persistence/service.ts';
import type { MetaAdapter } from '../providers/meta/types.ts';
import type { JevGate } from './jev-gate.ts';
import { transitionJob } from '../queue/state.ts';

export interface StepContext {
  queue: QueueManager;
  persistence: PersistenceService;
  jevGate: JevGate;
  metaAdapter: MetaAdapter;
  replaceJob: (job: Job) => void;
  onPause: (reason: string) => Promise<void>;
}

export async function executeWorkerStep(
  ctx: StepContext
): Promise<{ success: boolean; job: Job | null }> {
  const nextPending = ctx.queue.getJobs().find((j) => j.state === 'pending');
  if (!nextPending) {
    return { success: true, job: null };
  }

  const running = transitionJob(nextPending, { type: 'START', startedAt: Date.now() });
  ctx.replaceJob(running);
  await ctx.persistence.saveQueue(ctx.queue.getJobs());

  const jevEval = await ctx.jevGate.evaluateJob(running);
  if (jevEval.status === 'needs-review') {
    const reviewedJob = transitionJob(running, {
      type: 'MARK_NEEDS_REVIEW',
      reason: jevEval.reason ?? 'Jev gate evaluation flagged for review',
    });
    ctx.replaceJob(reviewedJob);
    await ctx.persistence.saveQueue(ctx.queue.getJobs());
    return { success: true, job: reviewedJob };
  }

  let currentJob = running;
  if (jevEval.job) {
    currentJob = {
      ...running,
      settings: {
        ...running.settings,
        ...jevEval.job.settings,
        customParameters: {
          ...(running.settings?.customParameters ?? {}),
          ...(jevEval.job.settings?.customParameters ?? {}),
        },
      },
    };
    ctx.replaceJob(currentJob);
    await ctx.persistence.saveQueue(ctx.queue.getJobs());
  }

  const execution = await ctx.metaAdapter.execute(currentJob);
  let finishedJob: Job;

  if (execution.status === 'completed' && execution.result) {
    finishedJob = transitionJob(currentJob, {
      type: 'COMPLETE',
      result: execution.result,
    });
  } else if (execution.status === 'needs-review') {
    finishedJob = transitionJob(currentJob, {
      type: 'MARK_NEEDS_REVIEW',
      reason: execution.error ?? 'Manual review required',
    });
  } else if (execution.status === 'paused') {
    await ctx.onPause(execution.error ?? 'Rate limit pause');
    finishedJob = transitionJob(currentJob, {
      type: 'PAUSE',
      reason: execution.error ?? 'Rate limit pause',
    });
  } else {
    finishedJob = transitionJob(currentJob, {
      type: 'FAIL',
      error: execution.error ?? 'Execution failed',
    });
  }

  ctx.replaceJob(finishedJob);
  await ctx.persistence.saveQueue(ctx.queue.getJobs());
  return { success: true, job: finishedJob };
}
