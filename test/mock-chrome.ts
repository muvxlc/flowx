export type MessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

export interface ChromeMockEnv {
  readonly mockChrome: any;
  readonly sendMessage: (
    msg: unknown,
    sender?: Partial<chrome.runtime.MessageSender>
  ) => Promise<unknown>;
  readonly fireAlarm: (name: string) => Promise<void>;
  readonly createdAlarms: Map<string, { periodInMinutes?: number; when?: number }>;
  readonly storageData: Map<string, unknown>;
}

export function createChromeMock(extensionId = 'test-worker-extension-id'): ChromeMockEnv {
  let messageListener: MessageListener | null = null;
  let alarmListener: ((alarm: { name: string; scheduledTime: number }) => void) | null = null;
  const createdAlarms = new Map<string, { periodInMinutes?: number; when?: number }>();
  const storageData = new Map<string, unknown>();

  const mockChrome = {
    runtime: {
      id: extensionId,
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: {
        addListener: (fn: MessageListener) => {
          messageListener = fn;
        },
      },
    },
    alarms: {
      create: (name: string, info: { periodInMinutes?: number; when?: number }) => {
        createdAlarms.set(name, info);
      },
      clear: (name: string, callback?: (wasCleared: boolean) => void) => {
        const existed = createdAlarms.delete(name);
        callback?.(existed);
      },
      onAlarm: {
        addListener: (fn: (alarm: { name: string; scheduledTime: number }) => void) => {
          alarmListener = fn;
        },
      },
    },
    storage: {
      local: {
        get: (keys: string | string[] | null, callback?: (items: Record<string, unknown>) => void) => {
          const result: Record<string, unknown> = {};
          if (typeof keys === 'string') {
            result[keys] = storageData.get(keys);
          } else if (Array.isArray(keys)) {
            for (const k of keys) result[k] = storageData.get(k);
          } else {
            for (const [k, v] of storageData.entries()) result[k] = v;
          }
          callback?.(result);
          return Promise.resolve(result);
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          for (const [k, v] of Object.entries(items)) storageData.set(k, v);
          callback?.();
          return Promise.resolve();
        },
        remove: (keys: string | string[], callback?: () => void) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) storageData.delete(k);
          callback?.();
          return Promise.resolve();
        },
        clear: (callback?: () => void) => {
          storageData.clear();
          callback?.();
          return Promise.resolve();
        },
      },
    },
  };

  return {
    mockChrome,
    sendMessage: async (msg: unknown, sender?: Partial<chrome.runtime.MessageSender>) => {
      if (!messageListener) throw new Error('No onMessage listener registered');
      const fullSender: chrome.runtime.MessageSender = {
        id: extensionId,
        url: `chrome-extension://${extensionId}/sidepanel/index.html`,
        ...sender,
      };
      return new Promise<unknown>((resolve) => {
        const handledAsync = messageListener!(msg, fullSender, (resp) => resolve(resp));
        if (!handledAsync) {
        }
      });
    },
    fireAlarm: async (name: string) => {
      if (!alarmListener) throw new Error('No onAlarm listener registered');
      await alarmListener({ name, scheduledTime: Date.now() });
    },
    createdAlarms,
    storageData,
  };
}
