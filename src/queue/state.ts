import type { Job, JobState, JobTransitionEvent, MediaTarget, JobMode } from './types.ts';

let counter = 0;

export function createJob(params: Partial<Job> & { media?: MediaTarget; mode?: JobMode; prompt?: string }): Job {
  const now = Date.now();
  counter = (counter + 1) % 100000;
  const id = params.id ?? `job_${now}_${counter}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    media: params.media ?? 'image',
    mode: params.mode ?? 'text-only',
    prompt: params.prompt ?? '',
    referenceId: params.referenceId ?? null,
    provider: params.provider ?? 'meta',
    settings: params.settings ?? {},
    state: params.state ?? 'draft',
    retryCount: params.retryCount ?? 0,
    maxRetries: params.maxRetries ?? 3,
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
    startedAt: params.startedAt ?? null,
    completedAt: params.completedAt ?? null,
    error: params.error ?? null,
    result: params.result ?? null,
    idempotencyKey: params.idempotencyKey ?? null
  };
}

export function canTransition(currentState: JobState, eventType: JobTransitionEvent['type']): boolean {
  switch (currentState) {
    case 'draft':
      return eventType === 'SUBMIT' || eventType === 'CANCEL' || eventType === 'FAIL';
    case 'pending':
      return (
        eventType === 'START' ||
        eventType === 'PAUSE' ||
        eventType === 'CANCEL' ||
        eventType === 'FAIL' ||
        eventType === 'MARK_NEEDS_REVIEW'
      );
    case 'running':
      return (
        eventType === 'COMPLETE' ||
        eventType === 'FAIL' ||
        eventType === 'PAUSE' ||
        eventType === 'MARK_NEEDS_REVIEW' ||
        eventType === 'CANCEL'
      );
    case 'paused':
      return eventType === 'RESUME' || eventType === 'CANCEL';
    case 'needs-review':
      return eventType === 'RESOLVE_REVIEW' || eventType === 'CANCEL';
    case 'completed':
      return eventType === 'COMPLETE'; // Idempotent check handled in transitionJob
    case 'failed':
      return false;
    default:
      return false;
  }
}

export function transitionJob(job: Job, event: JobTransitionEvent, now = Date.now()): Job {
  switch (event.type) {
    case 'SUBMIT': {
      if (job.state !== 'draft') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'SUBMIT'`);
      }
      return { ...job, state: 'pending', updatedAt: now };
    }
    case 'START': {
      if (job.state !== 'pending') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'START'`);
      }
      return { ...job, state: 'running', startedAt: event.startedAt ?? now, updatedAt: now };
    }
    case 'COMPLETE': {
      if (job.state === 'completed') {
        if (job.idempotencyKey && event.result.idempotencyKey === job.idempotencyKey) {
          return job;
        }
        throw new Error(`Invalid state transition from 'completed' with event 'COMPLETE': key mismatch`);
      }
      if (job.state !== 'running') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'COMPLETE'`);
      }
      return {
        ...job,
        state: 'completed',
        result: event.result,
        idempotencyKey: event.result.idempotencyKey,
        completedAt: event.result.completedAt || now,
        error: null,
        updatedAt: now
      };
    }
    case 'FAIL': {
      if (job.state !== 'running' && job.state !== 'pending' && job.state !== 'draft') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'FAIL'`);
      }
      if (event.fatal) {
        return { ...job, state: 'failed', error: event.error, updatedAt: now };
      }
      const nextRetry = job.retryCount + 1;
      if (nextRetry >= job.maxRetries) {
        return {
          ...job,
          state: 'failed',
          retryCount: nextRetry,
          error: event.error,
          updatedAt: now
        };
      }
      return {
        ...job,
        state: 'pending',
        retryCount: nextRetry,
        error: event.error,
        updatedAt: now
      };
    }
    case 'PAUSE': {
      if (job.state !== 'pending' && job.state !== 'running') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'PAUSE'`);
      }
      return {
        ...job,
        state: 'paused',
        error: event.reason ?? job.error ?? null,
        updatedAt: now
      };
    }
    case 'RESUME': {
      if (job.state !== 'paused') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'RESUME'`);
      }
      return { ...job, state: 'pending', updatedAt: now };
    }
    case 'MARK_NEEDS_REVIEW': {
      if (job.state !== 'running' && job.state !== 'pending') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'MARK_NEEDS_REVIEW'`);
      }
      return { ...job, state: 'needs-review', error: event.reason, updatedAt: now };
    }
    case 'RESOLVE_REVIEW': {
      if (job.state !== 'needs-review') {
        throw new Error(`Invalid state transition from '${job.state}' with event 'RESOLVE_REVIEW'`);
      }
      return {
        ...job,
        state: event.approve ? 'pending' : 'failed',
        error: event.approve ? null : (job.error || 'Operator rejected job'),
        updatedAt: now
      };
    }
    case 'CANCEL': {
      if (job.state === 'completed') {
        throw new Error(`Invalid state transition from 'completed' with event 'CANCEL'`);
      }
      return {
        ...job,
        state: 'failed',
        error: event.reason ?? 'Cancelled by user',
        updatedAt: now
      };
    }
    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled event type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
