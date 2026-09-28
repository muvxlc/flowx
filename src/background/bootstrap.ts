import { redactLogMessage, logInfo, logWarn, logError } from './redactor.ts';
import { dispatchMessage, getWorkerRuntime } from './dispatcher.ts';

export { redactLogMessage, logInfo, logWarn, logError };

export type ActionType =
  | 'PING'
  | 'QUEUE_COMMAND'
  | 'QUEUE_STATUS_GET'
  | 'STATUS'
  | 'ENQUEUE'
  | 'START'
  | 'PAUSE'
  | 'STEP'
  | 'JEV_DECISION_REQUEST'
  | 'META_INJECT_SCRIPT'
  | 'SETTINGS_UPDATE'
  | 'SETTINGS_GET'
  | 'SETTINGS_KEY_SAVE'
  | 'SETTINGS_KEY_REMOVE';

export interface ExtensionMessage {
  readonly type: ActionType;
  readonly payload?: unknown;
}

export interface MessageValidationResult {
  readonly valid: boolean;
  readonly action?: ActionType;
  readonly error?: string;
}

export interface SenderValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export const PRIVILEGED_ACTIONS = new Set<ActionType>([
  'QUEUE_COMMAND',
  'QUEUE_STATUS_GET',
  'STATUS',
  'ENQUEUE',
  'START',
  'PAUSE',
  'STEP',
  'JEV_DECISION_REQUEST',
  'META_INJECT_SCRIPT',
  'SETTINGS_UPDATE',
  'SETTINGS_GET',
  'SETTINGS_KEY_SAVE',
  'SETTINGS_KEY_REMOVE',
]);

export function isPrivilegedAction(action: ActionType): boolean {
  return PRIVILEGED_ACTIONS.has(action);
}

const ALLOWED_ACTIONS = new Set<ActionType>([
  'PING',
  'QUEUE_COMMAND',
  'QUEUE_STATUS_GET',
  'STATUS',
  'ENQUEUE',
  'START',
  'PAUSE',
  'STEP',
  'JEV_DECISION_REQUEST',
  'META_INJECT_SCRIPT',
  'SETTINGS_UPDATE',
  'SETTINGS_GET',
  'SETTINGS_KEY_SAVE',
  'SETTINGS_KEY_REMOVE',
]);

const ALLOWED_TAB_ORIGIN_REGEX = /^https:\/\/((\*\.)|([a-z0-9-]+\.))*meta\.ai(\/.*)?$/;

export function validateMessage(msg: unknown): MessageValidationResult {
  if (typeof msg !== 'object' || msg === null) {
    return { valid: false, error: 'Message must be a non-null object' };
  }

  const obj = msg as Record<string, unknown>;
  const msgType = obj['type'];

  if (typeof msgType !== 'string') {
    return { valid: false, error: 'Message type must be a string' };
  }

  if (!ALLOWED_ACTIONS.has(msgType as ActionType)) {
    return { valid: false, error: `Unknown message type: ${msgType}` };
  }

  return { valid: true, action: msgType as ActionType };
}

function validateExtensionUrl(urlStr: string, targetId: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'chrome-extension:') {
      return { valid: false, error: `Invalid sender protocol (expected chrome-extension:, got: ${parsed.protocol})` };
    }
    if (parsed.hostname !== targetId || parsed.host !== targetId) {
      return { valid: false, error: `Sender URL host does not match extension ID (got: ${parsed.host})` };
    }
    if (parsed.username || parsed.password || parsed.port) {
      return { valid: false, error: 'Malformed sender URL: user info or port forbidden' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `Malformed sender URL: ${urlStr}` };
  }
}

export function validateSender(
  sender: chrome.runtime.MessageSender,
  expectedId?: string,
  action?: ActionType
): SenderValidationResult {
  if (!sender || typeof sender !== 'object') {
    return { valid: false, error: 'Sender object missing' };
  }

  const targetId = expectedId ?? (typeof chrome !== 'undefined' ? chrome.runtime?.id : undefined);

  if (!targetId || typeof targetId !== 'string' || targetId.trim().length === 0) {
    return { valid: false, error: 'Extension runtime ID unknown or not configured' };
  }

  if (!sender.id || sender.id !== targetId) {
    return { valid: false, error: `Sender ID does not match extension ID (got: ${sender.id})` };
  }

  const expectedOrigin = `chrome-extension://${targetId}`;

  if (sender.tab && typeof sender.tab.url === 'string' && sender.tab.url.startsWith('chrome-extension:')) {
    const tabUrlValidation = validateExtensionUrl(sender.tab.url, targetId);
    if (!tabUrlValidation.valid) {
      return { valid: false, error: `Sender tab URL is not a trusted extension URL: ${sender.tab.url}` };
    }
  }

  if (typeof sender.url === 'string' && sender.url.startsWith('chrome-extension:')) {
    const urlValidation = validateExtensionUrl(sender.url, targetId);
    if (!urlValidation.valid) {
      return { valid: false, error: urlValidation.error ?? 'Invalid sender URL' };
    }
  }

  const isExtensionUrl = typeof sender.url === 'string' && validateExtensionUrl(sender.url, targetId).valid;
  const isExtensionTab =
    Boolean(sender.tab && typeof sender.tab.url === 'string' && validateExtensionUrl(sender.tab.url, targetId).valid);

  if (isExtensionUrl && (!sender.tab || isExtensionTab || !sender.tab.url)) {
    if (sender.origin && sender.origin !== expectedOrigin) {
      return { valid: false, error: `Sender origin does not match extension origin (got: ${sender.origin})` };
    }
    return { valid: true };
  }

  if (sender.tab) {
    if (action && isPrivilegedAction(action)) {
      return {
        valid: false,
        error: `Unauthorized: Tab content script is not permitted to perform privileged action '${action}'`,
      };
    }

    const tabUrl = sender.tab.url;
    if (!tabUrl || !ALLOWED_TAB_ORIGIN_REGEX.test(tabUrl)) {
      return { valid: false, error: `Sender tab URL not allowed: ${tabUrl ?? 'unknown'}` };
    }

    if (sender.url && !sender.url.startsWith('chrome-extension:') && !ALLOWED_TAB_ORIGIN_REGEX.test(sender.url)) {
      return { valid: false, error: `Sender URL not allowed: ${sender.url}` };
    }

    if (sender.origin && sender.origin !== expectedOrigin && !ALLOWED_TAB_ORIGIN_REGEX.test(sender.origin)) {
      return { valid: false, error: `Sender origin not allowed: ${sender.origin}` };
    }

    return { valid: true };
  }

  if (!sender.url || typeof sender.url !== 'string') {
    return { valid: false, error: 'Sender URL missing for extension page' };
  }

  const fallbackUrlValidation = validateExtensionUrl(sender.url, targetId);
  if (!fallbackUrlValidation.valid) {
    return { valid: false, error: fallbackUrlValidation.error ?? 'Invalid sender URL' };
  }

  if (sender.origin && sender.origin !== expectedOrigin) {
    return { valid: false, error: `Sender origin does not match extension origin (got: ${sender.origin})` };
  }

  return { valid: true };
}

export function canInjectScriptIntoTab(
  tab: { readonly id?: number; readonly url?: string } | undefined,
  explicitUserTrigger: boolean
): boolean {
  if (!tab || typeof tab.id !== 'number' || !tab.url) {
    return false;
  }
  if (!explicitUserTrigger) {
    return false;
  }
  return ALLOWED_TAB_ORIGIN_REGEX.test(tab.url);
}

export function setupBackgroundListeners(): void {
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    return;
  }

  chrome.runtime.onInstalled?.addListener((details) => {
    logInfo(`Service worker installed. Reason: ${details.reason}`);
    getWorkerRuntime().init().catch((err) => logError('Runtime init failed', err));
  });

  chrome.runtime.onStartup?.addListener(() => {
    logInfo('Service worker started on browser startup.');
    getWorkerRuntime().init().catch((err) => logError('Runtime startup failed', err));
  });

  chrome.alarms?.onAlarm?.addListener((alarm) => {
    getWorkerRuntime().handleAlarm(alarm.name).catch((err) => {
      logError('Alarm handling failed', err);
    });
  });

  chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
    const messageCheck = validateMessage(message);
    if (!messageCheck.valid) {
      logWarn(`Rejected invalid message: ${messageCheck.error}`);
      sendResponse({ success: false, error: messageCheck.error });
      return false;
    }

    const senderCheck = validateSender(sender, undefined, messageCheck.action);
    if (!senderCheck.valid) {
      logWarn(`Rejected untrusted message sender: ${senderCheck.error}`);
      sendResponse({ success: false, error: 'Unauthorized sender' });
      return false;
    }

    if (messageCheck.action === 'PING') {
      sendResponse({ success: true, pong: Date.now() });
      return false;
    }

    dispatchMessage(message as ExtensionMessage, sender)
      .then((res) => sendResponse(res))
      .catch((err) => {
        logError('Message dispatch failed', err);
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      });

    return true;
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  setupBackgroundListeners();
}
