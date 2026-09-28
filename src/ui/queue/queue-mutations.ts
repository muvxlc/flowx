import type { Job } from '../../queue/types.ts';
import type { JobEditPayload } from './types.ts';

export function moveJobInList(jobs: readonly Job[], jobId: string, direction: -1 | 1): Job[] {
  const list = [...jobs];
  const idx = list.findIndex((j) => j.id === jobId);
  if (idx === -1) {
    throw new Error(`Job '${jobId}' not found`);
  }

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= list.length) {
    return list; // Boundary limit
  }

  const item = list[idx]!;
  list.splice(idx, 1);
  list.splice(targetIdx, 0, item);
  return list;
}

export function reorderJobsList(jobs: readonly Job[], orderedIds: readonly string[]): Job[] {
  if (orderedIds.length !== jobs.length) {
    throw new Error('Reorder list length does not match total jobs count');
  }

  const idMap = new Map(jobs.map((j) => [j.id, j]));
  const reordered: Job[] = [];
  for (const id of orderedIds) {
    const job = idMap.get(id);
    if (!job) {
      throw new Error(`Job '${id}' not found in queue`);
    }
    reordered.push(job);
  }
  return reordered;
}

export function applyJobEdit(
  jobs: readonly Job[],
  jobId: string,
  updates: JobEditPayload
): { jobs: Job[]; updatedJob: Job } {
  const list = [...jobs];
  const idx = list.findIndex((j) => j.id === jobId);
  if (idx === -1) {
    throw new Error(`Job '${jobId}' not found`);
  }

  const current = list[idx]!;
  if (current.state === 'running') {
    throw new Error(`Cannot edit running job '${jobId}'`);
  }

  if (updates.prompt !== undefined && updates.prompt.trim().length === 0) {
    throw new Error('Prompt cannot be empty');
  }

  const updatedJob: Job = {
    ...current,
    ...(updates.prompt !== undefined ? { prompt: updates.prompt.trim() } : {}),
    ...(updates.media ? { media: updates.media } : {}),
    ...(updates.mode ? { mode: updates.mode } : {}),
    settings: {
      ...current.settings,
      ...(updates.settings ?? {}),
    },
    updatedAt: Date.now(),
  };

  list[idx] = updatedJob;
  return { jobs: list, updatedJob };
}

export function createJobDuplicate(
  jobs: readonly Job[],
  jobId: string
): { jobs: Job[]; duplicate: Job } {
  const current = jobs.find((j) => j.id === jobId);
  if (!current) {
    throw new Error(`Job '${jobId}' not found`);
  }

  if (current.state === 'running') {
    throw new Error(`Cannot duplicate running job '${jobId}'`);
  }

  const newId = `job_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const duplicate: Job = {
    ...current,
    id: newId,
    state: 'pending',
    retryCount: 0,
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    idempotencyKey: null,
  };

  return { jobs: [...jobs, duplicate], duplicate };
}

export function applyJobRetry(
  jobs: readonly Job[],
  jobId: string
): { jobs: Job[]; retried: Job } {
  const list = [...jobs];
  const idx = list.findIndex((j) => j.id === jobId);
  if (idx === -1) {
    throw new Error(`Job '${jobId}' not found`);
  }

  const current = list[idx]!;
  if (current.state !== 'failed' && current.state !== 'needs-review') {
    throw new Error(
      `Job '${jobId}' is in state '${current.state}', only failed or needs-review can be retried`
    );
  }

  const retried: Job = {
    ...current,
    state: 'pending',
    retryCount: 0,
    error: null,
    startedAt: null,
    completedAt: null,
    updatedAt: Date.now(),
  };

  list[idx] = retried;
  return { jobs: list, retried };
}

export function applyJobCancel(
  jobs: readonly Job[],
  jobId: string,
  reason = 'Cancelled by operator'
): Job[] {
  const list = [...jobs];
  const idx = list.findIndex((j) => j.id === jobId);
  if (idx === -1) {
    throw new Error(`Job '${jobId}' not found`);
  }

  const current = list[idx]!;
  if (current.state === 'completed') {
    throw new Error(`Cannot cancel completed job '${jobId}'`);
  }

  list[idx] = {
    ...current,
    state: 'failed',
    error: reason,
    updatedAt: Date.now(),
  };
  return list;
}
