import { WorkerRuntime } from '../integration/worker-runtime.ts';
import { extractPreferences, hasPreferencesPayload } from '../integration/worker-settings.ts';
import type { ExtensionMessage } from './bootstrap.ts';

let defaultRuntime: WorkerRuntime | null = null;

export function getWorkerRuntime(): WorkerRuntime {
  if (!defaultRuntime) {
    defaultRuntime = new WorkerRuntime();
    defaultRuntime.init().catch(() => {});
  }
  return defaultRuntime;
}

export function setWorkerRuntime(runtime: WorkerRuntime | null): void {
  defaultRuntime = runtime;
}

export async function dispatchMessage(
  msg: ExtensionMessage,
  _sender: chrome.runtime.MessageSender
): Promise<unknown> {
  const runtime = getWorkerRuntime();
  const payload = msg.payload as Record<string, unknown> | undefined;

  try {
    switch (msg.type) {
      case 'PING':
        return { success: true, pong: Date.now() };

      case 'QUEUE_STATUS_GET':
      case 'STATUS': {
        const status = await runtime.getStatus();
        return { success: true, status };
      }

      case 'ENQUEUE': {
        if (!payload || typeof payload !== 'object') {
          return { success: false, error: 'Missing or malformed enqueue payload' };
        }
        return runtime.enqueue(payload as unknown as import('../integration/types.ts').EnqueuePayload);
      }

      case 'START':
        return runtime.start();

      case 'PAUSE':
        return runtime.pause(typeof payload?.reason === 'string' ? payload.reason : undefined);

      case 'STEP':
        return runtime.step();

      case 'QUEUE_COMMAND': {
        if (!payload || typeof payload !== 'object' || typeof payload.command !== 'string') {
          return { success: false, error: 'Invalid or missing queue command' };
        }
        const cmd = payload.command.toUpperCase();
        if (cmd === 'ENQUEUE') {
          const batchOrJobs = payload.batch ?? payload.jobs ?? payload;
          if (!batchOrJobs || typeof batchOrJobs !== 'object') {
            return { success: false, error: 'Missing or malformed enqueue payload' };
          }
          return runtime.enqueue(batchOrJobs as unknown as import('../integration/types.ts').EnqueuePayload);
        }
        if (cmd === 'START' || cmd === 'RESUME') {
          return runtime.start();
        }
        if (cmd === 'PAUSE') {
          return runtime.pause(typeof payload.reason === 'string' ? payload.reason : undefined);
        }
        if (cmd === 'STEP') {
          return runtime.step();
        }
        if (cmd === 'STATUS') {
          const status = await runtime.getStatus();
          return { success: true, status };
        }
        if (cmd === 'CLEAR_COMPLETED') {
          return runtime.clearCompleted();
        }
        if (cmd === 'MOVE') {
          const jobId = payload.jobId as string | undefined;
          const direction = payload.direction as number | undefined;
          if (typeof jobId !== 'string' || (direction !== -1 && direction !== 1)) {
            return { success: false, error: 'Invalid MOVE payload: jobId and direction (-1 or 1) required' };
          }
          return runtime.moveJob(jobId, direction as -1 | 1);
        }
        if (cmd === 'REORDER') {
          const orderedIds = payload.orderedIds as string[] | undefined;
          if (!Array.isArray(orderedIds)) {
            return { success: false, error: 'Invalid REORDER payload: orderedIds array required' };
          }
          return runtime.reorderJobs(orderedIds);
        }
        if (cmd === 'EDIT') {
          const jobId = payload.jobId as string | undefined;
          if (typeof jobId !== 'string') {
            return { success: false, error: 'Invalid EDIT payload: jobId required' };
          }
          const updates =
            (payload.updates as import('../ui/queue/types.ts').JobEditPayload | undefined) ??
            ({
              prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
              media: payload.media as any,
              mode: payload.mode as any,
              settings: payload.settings as any,
            } as import('../ui/queue/types.ts').JobEditPayload);
          return runtime.editJob(jobId, updates);
        }
        if (cmd === 'DUPLICATE') {
          const jobId = payload.jobId as string | undefined;
          if (typeof jobId !== 'string') {
            return { success: false, error: 'Invalid DUPLICATE payload: jobId required' };
          }
          return runtime.duplicateJob(jobId);
        }
        if (cmd === 'CANCEL') {
          const jobId = payload.jobId as string | undefined;
          if (typeof jobId !== 'string') {
            return { success: false, error: 'Invalid CANCEL payload: jobId required' };
          }
          return runtime.cancelJob(jobId, typeof payload.reason === 'string' ? payload.reason : undefined);
        }
        if (cmd === 'RETRY') {
          const jobId = payload.jobId as string | undefined;
          if (typeof jobId !== 'string') {
            return { success: false, error: 'Invalid RETRY payload: jobId required' };
          }
          return runtime.retryJob(jobId);
        }
        return { success: false, error: `Unknown queue command: ${cmd}` };
      }

      case 'SETTINGS_UPDATE': {
        if (!payload || typeof payload !== 'object') {
          return { success: false, error: 'Missing settings payload' };
        }
        const action = typeof payload.action === 'string' ? payload.action.toUpperCase() : undefined;
        const key = (payload.apiKey ?? payload.key) as string | undefined;

        if (action === 'REMOVE_KEY' || payload.removeKey === true) {
          return await runtime.removeSettingsKey();
        }

        if (action === 'GET') {
          const settings = await runtime.getSettings();
          return { success: true, settings, hasKey: settings.hasKey };
        }

        const preferences = extractPreferences(payload);
        const hasPreferences = hasPreferencesPayload(payload);

        if (action === 'SAVE_KEY' || (action === undefined && typeof key === 'string')) {
          if (!key) return { success: false, error: 'Missing apiKey' };
          return await runtime.saveSettingsKey(key, hasPreferences ? preferences : undefined);
        }

        if (action === 'UPDATE') {
          if (typeof key === 'string' && key.trim().length > 0) {
            return await runtime.saveSettingsKey(key, hasPreferences ? preferences : undefined);
          }
          const settings = await runtime.updateSettings(preferences);
          return { success: true, settings, hasKey: settings.hasKey };
        }

        return { success: false, error: 'Invalid settings update action' };
      }

      case 'SETTINGS_GET': {
        const settings = await runtime.getSettings();
        return { success: true, settings, hasKey: settings.hasKey };
      }

      case 'SETTINGS_KEY_SAVE': {
        const key = (payload?.apiKey ?? payload?.key) as string | undefined;
        if (!key) return { success: false, error: 'Missing apiKey' };
        const preferences = extractPreferences(payload);
        const hasPreferences = hasPreferencesPayload(payload);
        return await runtime.saveSettingsKey(key, hasPreferences ? preferences : undefined);
      }

      case 'SETTINGS_KEY_REMOVE':
        return await runtime.removeSettingsKey();

      default:
        return { success: false, error: `Unhandled action: ${msg.type}` };
    }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
