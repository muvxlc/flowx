import test from 'node:test';
import assert from 'node:assert';
import {
  validateMessage,
  validateSender,
  canInjectScriptIntoTab,
  setupBackgroundListeners,
  redactLogMessage,
  logInfo,
  logWarn,
  logError,
  type ExtensionMessage,
} from '../src/background/bootstrap.ts';
import { createChromeMock } from './mock-chrome.ts';

test('Sender validation - accepts messages matching extension runtime id', () => {
  const extensionId = 'test-extension-id-12345';
  const validSender = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel/index.html`,
  };
  const result = validateSender(validSender as chrome.runtime.MessageSender, extensionId);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.error, undefined);
});

test('Sender validation - rejects messages with wrong or missing runtime id', () => {
  const extensionId = 'test-extension-id-12345';
  const badSender = {
    id: 'malicious-extension-id',
    url: 'chrome-extension://malicious-extension-id/popup.html',
  };
  const result = validateSender(badSender as chrome.runtime.MessageSender, extensionId);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error?.includes('Sender ID does not match extension ID'));

  const noIdSender = { url: 'https://attacker.com' };
  const resultNoId = validateSender(noIdSender as chrome.runtime.MessageSender, extensionId);
  assert.strictEqual(resultNoId.valid, false);
});

test('Sender validation - verifies tab URL if sender is a tab/content script', () => {
  const extensionId = 'test-extension-id-12345';

  const validMetaTab = {
    id: extensionId,
    tab: {
      id: 101,
      url: 'https://www.meta.ai/chat/12345',
    },
  };
  const validResult = validateSender(validMetaTab as chrome.runtime.MessageSender, extensionId);
  assert.strictEqual(validResult.valid, true);

  const invalidTabUrl = {
    id: extensionId,
    tab: {
      id: 102,
      url: 'https://evil.com/phishing',
    },
  };
  const invalidResult = validateSender(invalidTabUrl as chrome.runtime.MessageSender, extensionId);
  assert.strictEqual(invalidResult.valid, false);
  assert.ok(invalidResult.error?.includes('Sender tab URL not allowed'));
});

test('Message validation - accepts known typed messages', () => {
  const validPing: ExtensionMessage = {
    type: 'PING',
    payload: { timestamp: 123456789 },
  };
  const result = validateMessage(validPing);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.action, 'PING');

  const validQueueCmd: ExtensionMessage = {
    type: 'QUEUE_COMMAND',
    payload: { command: 'PAUSE' },
  };
  const queueResult = validateMessage(validQueueCmd);
  assert.strictEqual(queueResult.valid, true);
});

test('Message validation - rejects unknown action or malformed payload', () => {
  const unknownMsg = {
    type: 'UNKNOWN_DANGEROUS_ACTION',
    payload: { steal: true },
  };
  const result = validateMessage(unknownMsg);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error?.includes('Unknown message type: UNKNOWN_DANGEROUS_ACTION'));

  const malformed = 'not-an-object';
  const malformedResult = validateMessage(malformed);
  assert.strictEqual(malformedResult.valid, false);
});

test('Scripting injection guard - allows explicit injection only on authorized Meta AI tabs', () => {
  const metaTab = { id: 1, url: 'https://www.meta.ai/' };
  const otherTab = { id: 2, url: 'https://example.com/' };

  assert.strictEqual(canInjectScriptIntoTab(metaTab, true), true);
  // Without explicit user trigger, injection is denied
  assert.strictEqual(canInjectScriptIntoTab(metaTab, false), false);
  // On non-Meta tab, injection is denied even if triggered
  assert.strictEqual(canInjectScriptIntoTab(otherTab, true), false);
});

test('Redacted logger - strips API keys and authorization headers', () => {
  const secretKey = 'sk-9router-secret-key-12345';
  const rawLog = `Calling Jev at https://9router.bangkhan.com/v1/systemone with Authorization: Bearer ${secretKey}`;
  const sanitized = redactLogMessage(rawLog);

  assert.strictEqual(sanitized.includes(secretKey), false);
  assert.ok(sanitized.includes('Bearer [REDACTED]'));

  const promptSecret = `Payload contains api_key=${secretKey}&token=xyz987`;
  const sanitizedParams = redactLogMessage(promptSecret);
  assert.strictEqual(sanitizedParams.includes(secretKey), false);
  assert.ok(sanitizedParams.includes('api_key=[REDACTED]'));
  assert.ok(sanitizedParams.includes('token=[REDACTED]'));
});

test('Redacted logger - masks JSON token payloads and nested credential/prompt payloads', () => {
  const jsonToken = '{"token":"secret-token-abc"}';
  const sanitizedJson = redactLogMessage(jsonToken);
  assert.strictEqual(sanitizedJson.includes('secret-token-abc'), false);
  assert.ok(sanitizedJson.includes('"token":"[REDACTED]"') || sanitizedJson.includes('"token": "[REDACTED]"'));

  const dummySecret = 'dummy_secret';
  const nestedPayload = JSON.stringify({
    type: 'JEV_DECISION_REQUEST',
    payload: {
      credentials: {
        token: 'secret-token-abc',
        apiKey: dummySecret,
      },
      prompt: 'sensitive user prompt to be masked',
    },
  });

  const sanitizedNested = redactLogMessage(`Dispatch error for payload: ${nestedPayload}`);
  assert.strictEqual(sanitizedNested.includes('secret-token-abc'), false);
  assert.strictEqual(sanitizedNested.includes(dummySecret), false);
  assert.strictEqual(sanitizedNested.includes('sensitive user prompt to be masked'), false);
  assert.ok(sanitizedNested.includes('[REDACTED]'));
});

test('Redacted logger - masks or sanitizes variadic arguments passed to logger functions (logInfo/logWarn/logError)', () => {
  const capInfo: unknown[][] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    capInfo.push(args);
  };
  try {
    logInfo('User error', { token: 'super_secret', password: 'pwd' });
  } finally {
    console.log = origLog;
  }
  const serializedInfo = JSON.stringify(capInfo);
  assert.strictEqual(serializedInfo.includes('super_secret'), false);
  assert.strictEqual(serializedInfo.includes('pwd'), false);
  assert.ok(serializedInfo.includes('[REDACTED]'));

  const capWarn: unknown[][] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    capWarn.push(args);
  };
  try {
    logWarn('Warning occurred', 'api_key: secret-warn-token');
  } finally {
    console.warn = origWarn;
  }
  const serializedWarn = JSON.stringify(capWarn);
  assert.strictEqual(serializedWarn.includes('secret-warn-token'), false);
  assert.ok(serializedWarn.includes('[REDACTED]'));

  const capErr: unknown[][] = [];
  const origErr = console.error;
  console.error = (...args: unknown[]) => {
    capErr.push(args);
  };
  try {
    logError('Failure', new Error('secret-in-error: password=secretpass'));
  } finally {
    console.error = origErr;
  }
  const serializedErr = JSON.stringify(capErr);
  assert.strictEqual(serializedErr.includes('secretpass'), false);
  assert.ok(serializedErr.includes('[REDACTED]'));
});

test('Redacted logger - masks URL percent-encoded query parameter values completely', () => {
  const result = redactLogMessage('https://api.com?api_key=foo%20secret');
  assert.strictEqual(result.includes('secret'), false);
  assert.strictEqual(result.includes('%20'), false);
  assert.strictEqual(result, 'https://api.com?api_key=[REDACTED]');

  const resultMultiple = redactLogMessage('https://api.com?token=abc%2Bxyz%3D%3D&safe=1');
  assert.strictEqual(resultMultiple.includes('abc'), false);
  assert.strictEqual(resultMultiple.includes('xyz'), false);
  assert.strictEqual(resultMultiple, 'https://api.com?token=[REDACTED]&safe=1');
});

test('Redacted logger - masks unquoted colon headers and key-value formats', () => {
  const result1 = redactLogMessage('api_key: secret-token-123');
  assert.strictEqual(result1.includes('secret-token-123'), false);
  assert.strictEqual(result1, 'api_key: [REDACTED]');

  const result2 = redactLogMessage('X-Api-Key: secret123');
  assert.strictEqual(result2.includes('secret123'), false);
  assert.strictEqual(result2, 'X-Api-Key: [REDACTED]');

  const result3 = redactLogMessage('Header line\ntoken: secret-abc-456\nOther: normal');
  assert.strictEqual(result3.includes('secret-abc-456'), false);
  assert.ok(result3.includes('token: [REDACTED]'));
  assert.ok(result3.includes('Other: normal'));
});

test('SEC-01 Regression: Tab content script is rejected for privileged queue and settings commands', () => {
  const extensionId = 'test-extension-id-12345';
  const metaTabSender = {
    id: extensionId,
    tab: {
      id: 99,
      url: 'https://www.meta.ai/chat/prompt',
    },
  };

  const saveKeyRes = validateSender(metaTabSender as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(saveKeyRes.valid, false, 'Tab sender must NOT be permitted to execute SETTINGS_KEY_SAVE');
  assert.ok(saveKeyRes.error?.includes('privileged'), `Expected privileged error, got: ${saveKeyRes.error}`);

  const enqueueRes = validateSender(metaTabSender as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(enqueueRes.valid, false, 'Tab sender must NOT be permitted to execute ENQUEUE');
  assert.ok(enqueueRes.error?.includes('privileged'), `Expected privileged error, got: ${enqueueRes.error}`);

  const removeKeyRes = validateSender(metaTabSender as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_REMOVE');
  assert.strictEqual(removeKeyRes.valid, false, 'Tab sender must NOT be permitted to execute SETTINGS_KEY_REMOVE');

  const pauseRes = validateSender(metaTabSender as chrome.runtime.MessageSender, extensionId, 'PAUSE');
  assert.strictEqual(pauseRes.valid, false, 'Tab sender must NOT be permitted to execute PAUSE');

  const pingRes = validateSender(metaTabSender as chrome.runtime.MessageSender, extensionId, 'PING');
  assert.strictEqual(pingRes.valid, true, 'PING from valid Meta AI tab should be preserved as safe');
});

test('SEC-01: Rejects unknown runtime.id bypass', () => {
  const senderWithId = {
    id: 'arbitrary-unverified-id',
    url: 'chrome-extension://arbitrary-unverified-id/page.html',
  };
  const result = validateSender(senderWithId as chrome.runtime.MessageSender, undefined);
  assert.strictEqual(result.valid, false);
  assert.ok(result.error?.includes('Extension runtime ID unknown'));
});

test('SEC-01: Extension page sender validation requires exact origin and rejects malformed/spoofed URLs', () => {
  const extensionId = 'test-extension-id-12345';

  const validPage = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/dist/sidepanel.html`,
  };
  const validRes = validateSender(validPage as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(validRes.valid, true);

  const noUrl = { id: extensionId };
  const noUrlRes = validateSender(noUrl as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(noUrlRes.valid, false);

  const wrongExtUrl = {
    id: extensionId,
    url: 'chrome-extension://attacker-extension-id/sidepanel.html',
  };
  const wrongExtRes = validateSender(wrongExtUrl as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(wrongExtRes.valid, false);

  const webUrl = {
    id: extensionId,
    url: 'https://evil.com/fake-page.html',
  };
  const webRes = validateSender(webUrl as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(webRes.valid, false);

  const malformedUrl = {
    id: extensionId,
    url: 'not a valid url %%%',
  };
  const malformedRes = validateSender(malformedUrl as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(malformedRes.valid, false);

  const spoofedAuth = {
    id: extensionId,
    url: `chrome-extension://${extensionId}@evil.com/page`,
  };
  const spoofedAuthRes = validateSender(spoofedAuth as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(spoofedAuthRes.valid, false);

  const spoofedSuffix = {
    id: extensionId,
    url: `chrome-extension://${extensionId}.evil.com/page`,
  };
  const spoofedSuffixRes = validateSender(spoofedSuffix as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(spoofedSuffixRes.valid, false);

  const badOrigin = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/dist/sidepanel.html`,
    origin: 'https://evil.com',
  };
  const badOriginRes = validateSender(badOrigin as chrome.runtime.MessageSender, extensionId, 'SETTINGS_KEY_SAVE');
  assert.strictEqual(badOriginRes.valid, false);
});

test('SEC-01 End-to-End: setupBackgroundListeners rejects tab sender for SETTINGS_KEY_SAVE and ENQUEUE without secret leak', async () => {
  const extensionId = 'test-listener-ext-id';
  const env = createChromeMock(extensionId);
  const origChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
  (globalThis as unknown as { chrome: unknown }).chrome = env.mockChrome;

  try {
    setupBackgroundListeners();

    const tabSender = {
      id: extensionId,
      tab: { id: 123, url: 'https://www.meta.ai/chat' } as any,
    };

    const dummySecret = 'sk-super-secret-attacker-cannot-steal';

    const saveKeyResp = (await env.sendMessage(
      {
        type: 'SETTINGS_KEY_SAVE',
        payload: { apiKey: dummySecret },
      },
      tabSender
    )) as { success: boolean; error?: string };

    assert.strictEqual(saveKeyResp.success, false);
    assert.strictEqual(saveKeyResp.error, 'Unauthorized sender');
    assert.strictEqual(JSON.stringify(saveKeyResp).includes(dummySecret), false);

    const enqueueResp = (await env.sendMessage(
      {
        type: 'ENQUEUE',
        payload: { type: 'ENQUEUE_JOBS', jobs: [] },
      },
      tabSender
    )) as { success: boolean; error?: string };

    assert.strictEqual(enqueueResp.success, false);
    assert.strictEqual(enqueueResp.error, 'Unauthorized sender');

    const pingResp = (await env.sendMessage(
      { type: 'PING' },
      tabSender
    )) as { success: boolean; pong?: number };

    assert.strictEqual(pingResp.success, true);
    assert.ok(typeof pingResp.pong === 'number');
  } finally {
    (globalThis as unknown as { chrome: unknown }).chrome = origChrome;
  }
});

test('SEC-01 Regression: Chromium MV3 extension page in tab/window with sender.tab is authorized for privileged actions', () => {
  const extensionId = 'ndjhjpodkbndkeacodpjidpdiahfkbbe';
  const realExtensionPageSender = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel.html`,
    origin: `chrome-extension://${extensionId}`,
    frameId: 0,
    documentId: 'F820059147F132C55D8F0CC29B85080F',
    documentLifecycle: 'active',
    tab: {
      id: 1360513349,
      url: `chrome-extension://${extensionId}/sidepanel.html`,
      active: true,
      windowId: 1360513347,
    },
  };

  const pingResult = validateSender(realExtensionPageSender as chrome.runtime.MessageSender, extensionId, 'PING');
  assert.strictEqual(pingResult.valid, true, `PING should be allowed, got error: ${pingResult.error}`);

  const privilegedActions = [
    'SETTINGS_UPDATE',
    'SETTINGS_KEY_SAVE',
    'SETTINGS_KEY_REMOVE',
    'SETTINGS_GET',
    'ENQUEUE',
    'START',
    'PAUSE',
    'STEP',
    'QUEUE_COMMAND',
    'QUEUE_STATUS_GET',
    'STATUS',
    'JEV_DECISION_REQUEST',
    'META_INJECT_SCRIPT',
  ] as const;

  for (const action of privilegedActions) {
    const result = validateSender(realExtensionPageSender as chrome.runtime.MessageSender, extensionId, action);
    assert.strictEqual(
      result.valid,
      true,
      `Action '${action}' from real extension page with sender.tab must be permitted, got error: ${result.error}`
    );
  }
});

test('SEC-01 Regression: Inconsistent tab URL or web sender with extension tab.url is strictly rejected', () => {
  const extensionId = 'test-extension-id-12345';

  const webSenderSpoofingTab = {
    id: extensionId,
    url: 'https://evil.com/exploit.html',
    origin: 'https://evil.com',
    tab: {
      id: 50,
      url: `chrome-extension://${extensionId}/sidepanel.html`,
    },
  };
  const webSpoofRes = validateSender(webSenderSpoofingTab as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(webSpoofRes.valid, false, 'Web sender with extension tab.url must be rejected');

  const extensionPageInWebTab = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel.html`,
    origin: `chrome-extension://${extensionId}`,
    tab: {
      id: 51,
      url: 'https://evil.com/page.html',
    },
  };
  const webTabRes = validateSender(extensionPageInWebTab as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(webTabRes.valid, false, 'Extension page with mismatched tab.url must be rejected');

  const extensionTabWithPort = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel.html`,
    origin: `chrome-extension://${extensionId}`,
    tab: {
      id: 52,
      url: `chrome-extension://${extensionId}:8080/sidepanel.html`,
    },
  };
  const portTabRes = validateSender(extensionTabWithPort as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(portTabRes.valid, false, 'Extension tab with port must be rejected');

  const extensionTabWithUserinfo = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel.html`,
    origin: `chrome-extension://${extensionId}`,
    tab: {
      id: 53,
      url: `chrome-extension://admin:secret@${extensionId}/sidepanel.html`,
    },
  };
  const userinfoTabRes = validateSender(extensionTabWithUserinfo as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(userinfoTabRes.valid, false, 'Extension tab with userinfo must be rejected');

  const spoofedPrefixSender = {
    id: extensionId,
    url: `chrome-extension-spoof://${extensionId}/sidepanel.html`,
    origin: `chrome-extension://${extensionId}`,
    tab: {
      id: 54,
      url: `chrome-extension://${extensionId}/sidepanel.html`,
    },
  };
  const spoofedPrefixRes = validateSender(spoofedPrefixSender as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(spoofedPrefixRes.valid, false, 'Spoofed protocol prefix must be rejected');

  const senderUrlPort = {
    id: extensionId,
    url: `chrome-extension://${extensionId}:8080/sidepanel.html`,
    origin: `chrome-extension://${extensionId}`,
  };
  const senderUrlPortRes = validateSender(senderUrlPort as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(senderUrlPortRes.valid, false, 'Sender URL with port must be rejected');

  const senderUrlUserinfo = {
    id: extensionId,
    url: `chrome-extension://admin:secret@${extensionId}/sidepanel.html`,
    origin: `chrome-extension://${extensionId}`,
  };
  const senderUrlUserinfoRes = validateSender(senderUrlUserinfo as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(senderUrlUserinfoRes.valid, false, 'Sender URL with userinfo must be rejected');

  const tabWithBadOrigin = {
    id: extensionId,
    url: `chrome-extension://${extensionId}/sidepanel.html`,
    origin: 'https://evil.com',
    tab: {
      id: 55,
      url: `chrome-extension://${extensionId}/sidepanel.html`,
    },
  };
  const tabWithBadOriginRes = validateSender(tabWithBadOrigin as chrome.runtime.MessageSender, extensionId, 'ENQUEUE');
  assert.strictEqual(tabWithBadOriginRes.valid, false, 'Extension tab with evil origin must be rejected');
});

test('SEC-01 End-to-End: setupBackgroundListeners authorizes extension page in tab for privileged actions', async () => {
  const extensionId = 'test-listener-ext-tab-id';
  const env = createChromeMock(extensionId);
  const origChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
  (globalThis as unknown as { chrome: unknown }).chrome = env.mockChrome;

  try {
    setupBackgroundListeners();

    const realExtSender = {
      id: extensionId,
      url: `chrome-extension://${extensionId}/sidepanel.html`,
      origin: `chrome-extension://${extensionId}`,
      tab: {
        id: 999,
        url: `chrome-extension://${extensionId}/sidepanel.html`,
      } as any,
    };

    const pingResp = (await env.sendMessage(
      { type: 'PING' },
      realExtSender
    )) as { success: boolean; pong?: number };
    assert.strictEqual(pingResp.success, true);
    assert.ok(typeof pingResp.pong === 'number');

    const statusResp = (await env.sendMessage(
      { type: 'STATUS' },
      realExtSender
    )) as { success: boolean; error?: string };
    assert.notStrictEqual(statusResp?.error, 'Unauthorized sender', 'STATUS must not fail with Unauthorized sender');
  } finally {
    (globalThis as unknown as { chrome: unknown }).chrome = origChrome;
  }
});



