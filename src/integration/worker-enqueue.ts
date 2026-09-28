import type { Job } from '../queue/types.ts';
import type { QueueManager } from '../queue/queue.ts';
import type { PersistenceService } from '../persistence/service.ts';
import { createJob } from '../queue/state.ts';
import { importJobBatch } from '../import/index.ts';
import type { ImportedJobDraft } from '../import/types.ts';
import type { EnqueuePayload, EnqueueBatchInput } from './types.ts';

export async function executeWorkerEnqueue(
  queue: QueueManager,
  persistence: PersistenceService,
  payload: EnqueuePayload
): Promise<{ success: boolean; jobs: Job[]; error?: string }> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'Invalid or missing enqueue payload', jobs: [] };
  }

  let drafts: readonly ImportedJobDraft[];

  if ('type' in payload && payload.type === 'ENQUEUE_JOBS') {
    if (!Array.isArray(payload.jobs)) {
      return { success: false, error: 'Malformed ENQUEUE_JOBS: jobs array required', jobs: [] };
    }
    for (const item of payload.jobs) {
      if (!item || typeof item !== 'object') {
        return {
          success: false,
          error: 'Malformed ENQUEUE_JOBS: jobs array contains invalid entry',
          jobs: [],
        };
      }
    }
    drafts = payload.jobs;
  } else {
    const batchInput = payload as EnqueueBatchInput;
    if (typeof batchInput.promptsText !== 'string' || batchInput.promptsText.trim().length === 0) {
      return { success: false, error: 'Empty or invalid prompt text', jobs: [] };
    }
    try {
      drafts = importJobBatch({
        media: batchInput.media,
        mode: batchInput.mode,
        promptSource: {
          type: 'paste',
          rawText: batchInput.promptsText,
        },
        references: batchInput.references ?? [],
        provider: 'meta',
      }).jobs;
    } catch (err: unknown) {
      return {
        success: false,
        error: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
        jobs: [],
      };
    }
  }

  const enqueued: Job[] = [];
  for (const d of drafts) {
    const job = createJob({ ...d, state: 'pending' });
    queue.addJob(job);
    enqueued.push(job);
  }

  await persistence.saveQueue(queue.getJobs());
  return { success: true, jobs: enqueued };
}
