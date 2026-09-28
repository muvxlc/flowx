import type { RuntimeBridge } from '../integration/service-bridge.ts';
import type { Job } from '../queue/types.ts';
import type { WorkerQueueStatus } from '../integration/worker-runtime-types.ts';
import { renderQueueView } from '../ui/queue/queue-view.ts';

export interface QueueGlueState {
  jobs: Job[];
  queueRunning: boolean;
  statusAlert: string | null;
  errorMessage: string | null;
  inspectingJobId: string | null;
}

export interface QueueGlueCallbacks {
  onStateUpdate: (patch: Partial<QueueGlueState>) => void;
  onFallbackStep: () => Promise<Job | null>;
  onFallbackToggle: (start: boolean) => Promise<void>;
}

async function dispatchQueueAction(
  bridge: RuntimeBridge,
  callbacks: QueueGlueCallbacks,
  payload: Record<string, unknown>,
  successAlert: string,
  fallbackError: string
): Promise<void> {
  try {
    const resp = (await bridge.sendCommand('QUEUE_COMMAND', payload)) as {
      success?: boolean;
      status?: WorkerQueueStatus;
      error?: string;
    };
    if (resp?.success && resp.status) {
      callbacks.onStateUpdate({
        jobs: resp.status.jobs,
        statusAlert: successAlert,
        errorMessage: null,
      });
    } else {
      callbacks.onStateUpdate({
        errorMessage: resp?.error ?? fallbackError,
        statusAlert: null,
      });
    }
  } catch (err: unknown) {
    callbacks.onStateUpdate({
      errorMessage: err instanceof Error ? err.message : fallbackError,
      statusAlert: null,
    });
  }
}

function handleBridgeError(
  bridge: RuntimeBridge,
  callbacks: QueueGlueCallbacks,
  err: unknown,
  fallbackMsg: string
): boolean {
  if (bridge.hasRuntime()) {
    const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : fallbackMsg);
    callbacks.onStateUpdate({ errorMessage: msg, statusAlert: null });
    return true;
  }
  return false;
}

export function renderAndBindQueueTab(
  container: HTMLElement,
  state: QueueGlueState,
  bridge: RuntimeBridge,
  callbacks: QueueGlueCallbacks
): void {
  const activeJob = state.jobs.find((j) => j.state === 'running');
  container.innerHTML = renderQueueView({
    jobs: state.jobs,
    queueRunning: state.queueRunning,
    activeJobId: activeJob?.id ?? null,
    statusAlert: state.statusAlert,
    errorMessage: state.errorMessage ?? null,
    inspectingJobId: state.inspectingJobId,
  });

  container.querySelector('#btnToggleQueue')?.addEventListener('click', async () => {
    const isRunning = state.queueRunning;
    const payload = isRunning
      ? { command: 'PAUSE', reason: 'Operator paused queue' }
      : { command: 'START' };

    try {
      const resp = (await bridge.sendCommand('QUEUE_COMMAND', payload)) as {
        success?: boolean;
        status?: WorkerQueueStatus;
        error?: string;
      };

      if (resp?.success && resp.status) {
        callbacks.onStateUpdate({
          queueRunning: !resp.status.isPaused,
          jobs: resp.status.jobs,
          statusAlert: resp.status.isPaused
            ? `Queue Paused: ${resp.status.pauseReason ?? 'Operator paused'}`
            : 'Queue Active (Continuous Alarm Intent)',
          errorMessage: null,
        });
      } else if (!handleBridgeError(bridge, callbacks, resp?.error, 'Extension worker rejected queue toggle command')) {
        await callbacks.onFallbackToggle(!isRunning);
      }
    } catch (err: unknown) {
      if (!handleBridgeError(bridge, callbacks, err, 'Failed to communicate with extension worker')) {
        await callbacks.onFallbackToggle(!isRunning);
      }
    }
  });

  container.querySelector('#btnStepQueue')?.addEventListener('click', async () => {
    try {
      const resp = (await bridge.sendCommand('QUEUE_COMMAND', { command: 'STEP' })) as {
        success?: boolean;
        job?: Job | null;
        status?: WorkerQueueStatus;
        error?: string;
      };

      if (resp?.success) {
        const nextJobs = resp.status?.jobs ?? (resp.job ? state.jobs.map((j) => (j.id === resp.job!.id ? resp.job! : j)) : state.jobs);
        callbacks.onStateUpdate({
          jobs: nextJobs,
          queueRunning: resp.status ? !resp.status.isPaused : state.queueRunning,
          statusAlert: resp.job
            ? `Stepped 1 job: ${resp.job.id} -> ${resp.job.state}`
            : 'No pending jobs to step',
          errorMessage: null,
        });
      } else if (!handleBridgeError(bridge, callbacks, resp?.error, 'Extension worker rejected step command')) {
        const stepped = await callbacks.onFallbackStep();
        if (stepped) {
          callbacks.onStateUpdate({ statusAlert: `Stepped 1 job: ${stepped.id} -> ${stepped.state}`, errorMessage: null });
        }
      }
    } catch (err: unknown) {
      if (!handleBridgeError(bridge, callbacks, err, 'Failed to communicate with extension worker')) {
        const stepped = await callbacks.onFallbackStep();
        if (stepped) {
          callbacks.onStateUpdate({ statusAlert: `Stepped 1 job: ${stepped.id} -> ${stepped.state}`, errorMessage: null });
        }
      }
    }
  });

  container.querySelector('#btnSimulateError')?.addEventListener('click', async () => {
    try {
      const resp = (await bridge.sendCommand('QUEUE_COMMAND', {
        command: 'PAUSE',
        reason: 'Simulate 429 Challenge Pause',
      })) as { success?: boolean; status?: WorkerQueueStatus; error?: string };

      if (resp?.success && resp.status) {
        callbacks.onStateUpdate({
          queueRunning: false,
          jobs: resp.status.jobs,
          statusAlert: '429 Challenge Pause (Simulated)',
          errorMessage: 'Rate limit challenge: Queue paused automatically',
        });
      } else if (!handleBridgeError(bridge, callbacks, resp?.error, 'Extension worker rejected pause command')) {
        callbacks.onStateUpdate({
          queueRunning: false,
          jobs: state.jobs,
          statusAlert: '429 Challenge Pause (Simulated)',
          errorMessage: 'Rate limit challenge: Queue paused automatically',
        });
      }
    } catch (err: unknown) {
      if (!handleBridgeError(bridge, callbacks, err, 'Failed to communicate with extension worker')) {
        callbacks.onStateUpdate({
          queueRunning: false,
          jobs: state.jobs,
          statusAlert: '429 Challenge Pause (Simulated)',
          errorMessage: 'Rate limit challenge: Queue paused automatically',
        });
      }
    }
  });

  container.querySelector('#btnClearCompleted')?.addEventListener('click', async () => {
    try {
      const resp = (await bridge.sendCommand('QUEUE_COMMAND', { command: 'CLEAR_COMPLETED' })) as {
        success?: boolean;
        clearedCount?: number;
        status?: WorkerQueueStatus;
        error?: string;
      };

      if (resp?.success) {
        const nextJobs = resp.status?.jobs ?? state.jobs.filter((j) => j.state !== 'completed');
        callbacks.onStateUpdate({
          jobs: nextJobs,
          statusAlert: `Completed jobs cleared (${resp.clearedCount ?? 0} jobs removed)`,
          errorMessage: null,
        });
      } else {
        callbacks.onStateUpdate({
          errorMessage: resp?.error ?? 'Failed to clear completed jobs',
          statusAlert: null,
        });
      }
    } catch (err: unknown) {
      callbacks.onStateUpdate({
        errorMessage: err instanceof Error ? err.message : 'Error clearing completed jobs',
        statusAlert: null,
      });
    }
  });

  const actions: Array<{ action: string; payload: (id: string) => Record<string, unknown>; alert: (id: string) => string; fail: string }> = [
    { action: 'move-up', payload: (jobId) => ({ command: 'MOVE', jobId, direction: -1 }), alert: (id) => `Moved job #${id} up`, fail: 'Failed to move job' },
    { action: 'move-down', payload: (jobId) => ({ command: 'MOVE', jobId, direction: 1 }), alert: (id) => `Moved job #${id} down`, fail: 'Failed to move job' },
    { action: 'duplicate', payload: (jobId) => ({ command: 'DUPLICATE', jobId }), alert: (id) => `Duplicated job #${id}`, fail: 'Failed to duplicate job' },
    { action: 'cancel', payload: (jobId) => ({ command: 'CANCEL', jobId, reason: 'Cancelled by operator' }), alert: (id) => `Cancelled job #${id}`, fail: 'Failed to cancel job' },
    { action: 'retry', payload: (jobId) => ({ command: 'RETRY', jobId }), alert: (id) => `Retrying job #${id}`, fail: 'Failed to retry job' },
  ];
  for (const cfg of actions) {
    container.querySelectorAll<HTMLButtonElement>(`[data-action="${cfg.action}"]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const jobId = btn.getAttribute('data-id');
        if (jobId) dispatchQueueAction(bridge, callbacks, cfg.payload(jobId), cfg.alert(jobId), cfg.fail);
      });
    });
  }

  container.querySelectorAll<HTMLButtonElement>('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const jobId = btn.getAttribute('data-id');
      if (!jobId) return;
      const target = state.jobs.find((j) => j.id === jobId);
      if (target?.state === 'running') {
        callbacks.onStateUpdate({ errorMessage: 'Cannot edit running job', statusAlert: null });
        return;
      }
      const currentPrompt = target?.prompt ?? '';
      const promptFn = typeof window !== 'undefined' && window.prompt ? window.prompt : null;
      const newPrompt = promptFn ? promptFn('Edit prompt:', currentPrompt) : null;
      if (newPrompt === null) {
        return;
      }
      if (newPrompt.trim().length === 0) {
        callbacks.onStateUpdate({ errorMessage: 'Prompt cannot be empty', statusAlert: null });
        return;
      }
      await dispatchQueueAction(
        bridge,
        callbacks,
        { command: 'EDIT', jobId, updates: { prompt: newPrompt.trim() }, prompt: newPrompt.trim() },
        `Updated prompt for #${jobId}`,
        'Failed to edit job'
      );
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-action="inspect"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      callbacks.onStateUpdate({ inspectingJobId: btn.getAttribute('data-id') });
    });
  });

  container.querySelector('[data-action="close-inspect"]')?.addEventListener('click', () => {
    callbacks.onStateUpdate({ inspectingJobId: null });
  });
}
