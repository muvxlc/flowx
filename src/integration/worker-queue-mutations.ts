import type { Job } from '../queue/types.ts';
import type { QueueManager } from '../queue/queue.ts';
import type { PersistenceService } from '../persistence/service.ts';
import type { JobEditPayload } from '../ui/queue/types.ts';
import {
  moveJobInList,
  reorderJobsList,
  applyJobEdit,
  createJobDuplicate,
  applyJobRetry,
  applyJobCancel,
} from '../ui/queue/queue-mutations.ts';

function replaceQueueJobs(queue: QueueManager, jobs: Job[]): void {
  (queue as unknown as { jobs: Job[] }).jobs = [...jobs];
}

export async function clearCompletedFromWorker(
  queue: QueueManager,
  persistence: PersistenceService
): Promise<{ success: boolean; clearedCount: number }> {
  const current = queue.getJobs();
  const remaining = current.filter((j) => j.state !== 'completed');
  const clearedCount = current.length - remaining.length;
  replaceQueueJobs(queue, remaining);
  await persistence.saveQueue(remaining);
  return { success: true, clearedCount };
}

export async function moveWorkerJob(
  queue: QueueManager,
  persistence: PersistenceService,
  jobId: string,
  direction: -1 | 1
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = queue.getJobs();
    const updated = moveJobInList(current, jobId, direction);
    replaceQueueJobs(queue, updated);
    await persistence.saveQueue(updated);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function reorderWorkerJobs(
  queue: QueueManager,
  persistence: PersistenceService,
  orderedIds: readonly string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = queue.getJobs();
    const updated = reorderJobsList(current, orderedIds);
    replaceQueueJobs(queue, updated);
    await persistence.saveQueue(updated);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function editWorkerJob(
  queue: QueueManager,
  persistence: PersistenceService,
  jobId: string,
  updates: JobEditPayload
): Promise<{ success: boolean; job?: Job; error?: string }> {
  try {
    const current = queue.getJobs();
    const { jobs: updated, updatedJob } = applyJobEdit(current, jobId, updates);
    replaceQueueJobs(queue, updated);
    await persistence.saveQueue(updated);
    return { success: true, job: updatedJob };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function duplicateWorkerJob(
  queue: QueueManager,
  persistence: PersistenceService,
  jobId: string
): Promise<{ success: boolean; duplicate?: Job; error?: string }> {
  try {
    const current = queue.getJobs();
    const { jobs: updated, duplicate } = createJobDuplicate(current, jobId);
    replaceQueueJobs(queue, updated);
    await persistence.saveQueue(updated);
    return { success: true, duplicate };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelWorkerJob(
  queue: QueueManager,
  persistence: PersistenceService,
  jobId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = queue.getJobs();
    const updated = applyJobCancel(current, jobId, reason);
    replaceQueueJobs(queue, updated);
    await persistence.saveQueue(updated);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function retryWorkerJob(
  queue: QueueManager,
  persistence: PersistenceService,
  jobId: string
): Promise<{ success: boolean; retried?: Job; error?: string }> {
  try {
    const current = queue.getJobs();
    const { jobs: updated, retried } = applyJobRetry(current, jobId);
    replaceQueueJobs(queue, updated);
    await persistence.saveQueue(updated);
    return { success: true, retried };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
