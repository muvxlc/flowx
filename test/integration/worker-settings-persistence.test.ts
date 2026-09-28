import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerRuntime } from '../../src/integration/worker-runtime.ts';
import { dispatchMessage, setWorkerRuntime } from '../../src/background/dispatcher.ts';
import { createChromeMock } from '../mock-chrome.ts';

test('RED 1: SETTINGS_UPDATE action UPDATE validates and persists preferences without key', async () => {
  const env = createChromeMock('ext-id-settings');
  const storageArea = env.mockChrome.storage.local as any;
  const runtime = new WorkerRuntime({ storageArea });
  await runtime.init();
  setWorkerRuntime(runtime);

  const initial = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: { action: 'GET' },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings: any };

  assert.equal(initial.success, true);
  assert.equal(initial.settings.enabled, false);
  assert.equal(initial.settings.consent, false);
  assert.equal(initial.settings.timeoutMs, 5000);
  assert.equal(initial.settings.hasKey, false);

  const updateResp = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: {
        action: 'UPDATE',
        enabled: true,
        consent: true,
        timeoutMs: 12000,
      },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings?: any; hasKey?: boolean; error?: string };

  assert.equal(updateResp.success, true, updateResp.error ?? 'UPDATE failed');
  assert.ok(updateResp.settings, 'UPDATE must return settings');
  assert.equal(updateResp.settings.enabled, true);
  assert.equal(updateResp.settings.consent, true);
  assert.equal(updateResp.settings.timeoutMs, 12000);
  assert.equal(updateResp.settings.hasKey, false);

  const getResp = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: { action: 'GET' },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings: any };

  assert.equal(getResp.success, true);
  assert.equal(getResp.settings.enabled, true);
  assert.equal(getResp.settings.consent, true);
  assert.equal(getResp.settings.timeoutMs, 12000);
});

test('RED 2: SETTINGS_UPDATE action SAVE_KEY persists key and preferences together', async () => {
  const env = createChromeMock('ext-id-settings');
  const storageArea = env.mockChrome.storage.local as any;
  const runtime = new WorkerRuntime({ storageArea });
  await runtime.init();
  setWorkerRuntime(runtime);

  const secretKey = 'dummy_secret_key_12345';
  const saveResp = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: {
        action: 'SAVE_KEY',
        apiKey: secretKey,
        enabled: true,
        consent: true,
        timeoutMs: 9000,
      },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; hasKey?: boolean; settings?: any; error?: string };

  assert.equal(saveResp.success, true, saveResp.error ?? 'SAVE_KEY failed');
  assert.equal(saveResp.hasKey, true);
  assert.ok(saveResp.settings, 'SAVE_KEY should return settings');
  assert.equal(saveResp.settings.enabled, true);
  assert.equal(saveResp.settings.consent, true);
  assert.equal(saveResp.settings.timeoutMs, 9000);
  assert.equal(saveResp.settings.hasKey, true);

  const getResp = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: { action: 'GET' },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings: any };

  assert.equal(getResp.settings.hasKey, true);
  assert.equal(getResp.settings.enabled, true);
  assert.equal(getResp.settings.consent, true);
  assert.equal(getResp.settings.timeoutMs, 9000);
  assert.equal(getResp.settings.apiKey, undefined, 'Raw key must not appear in settings');
  assert.ok(!JSON.stringify(getResp).includes(secretKey), 'Raw key must not leak in response');
});

test('RED 3: Invalid timeout or consent fails without partial mutation and rolls back', async () => {
  const env = createChromeMock('ext-id-settings');
  const storageArea = env.mockChrome.storage.local as any;
  const runtime = new WorkerRuntime({ storageArea });
  await runtime.init();
  setWorkerRuntime(runtime);

  // Set baseline valid settings
  await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: { action: 'UPDATE', enabled: false, consent: false, timeoutMs: 5000 },
    },
    { id: 'ext-id-settings' } as any
  );

  // 1. UPDATE with invalid timeout (too low: 200ms < 1000ms)
  const failUpdate = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: { action: 'UPDATE', enabled: true, consent: true, timeoutMs: 200 },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; error?: string };

  assert.equal(failUpdate.success, false);
  assert.ok(failUpdate.error?.includes('Timeout') || failUpdate.error?.includes('timeout') || failUpdate.error?.includes('INVALID_TIMEOUT'));

  // Verify no partial mutation occurred
  const check1 = (await dispatchMessage(
    { type: 'SETTINGS_UPDATE', payload: { action: 'GET' } },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings: any };
  assert.equal(check1.settings.enabled, false, 'enabled must NOT be partially mutated on timeout error');
  assert.equal(check1.settings.consent, false, 'consent must NOT be partially mutated on timeout error');
  assert.equal(check1.settings.timeoutMs, 5000, 'timeoutMs must remain baseline');

  // 2. SAVE_KEY with valid key but invalid timeout -> must roll back key save!
  const failSaveKey = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: {
        action: 'SAVE_KEY',
        apiKey: 'sk-secret-rollback-test',
        enabled: true,
        consent: true,
        timeoutMs: 999999, // exceeds MAX_TIMEOUT_MS (120000)
      },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; error?: string };

  assert.equal(failSaveKey.success, false);

  // Key must NOT be present (rolled back)
  const check2 = (await dispatchMessage(
    { type: 'SETTINGS_UPDATE', payload: { action: 'GET' } },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings: any };
  assert.equal(check2.settings.hasKey, false, 'Key must be rolled back if preference update fails');
  assert.equal(check2.settings.enabled, false);
  assert.equal(check2.settings.timeoutMs, 5000);

  // 3. UPDATE with invalid non-boolean consent
  const failConsent = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: { action: 'UPDATE', enabled: true, consent: 'invalid' as any, timeoutMs: 7000 },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; error?: string };

  assert.equal(failConsent.success, false);

  const check3 = (await dispatchMessage(
    { type: 'SETTINGS_UPDATE', payload: { action: 'GET' } },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings: any };
  assert.equal(check3.settings.enabled, false);
  assert.equal(check3.settings.timeoutMs, 5000);
});

test('RED 4: Settings survive WorkerRuntime restart on same storage', async () => {
  const env = createChromeMock('ext-id-settings');
  const storageArea = env.mockChrome.storage.local as any;

  // Runtime 1 writes settings & key
  const runtime1 = new WorkerRuntime({ storageArea });
  await runtime1.init();
  setWorkerRuntime(runtime1);

  const saveRes = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: {
        action: 'SAVE_KEY',
        apiKey: 'persistent_dummy_secret',
        enabled: true,
        consent: true,
        timeoutMs: 15000,
      },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean };
  assert.equal(saveRes.success, true);

  // Simulate worker shutdown & new worker instance rehydrating from storageArea
  const runtime2 = new WorkerRuntime({ storageArea });
  await runtime2.init();
  setWorkerRuntime(runtime2);

  const getRes = (await dispatchMessage(
    {
      type: 'SETTINGS_UPDATE',
      payload: { action: 'GET' },
    },
    { id: 'ext-id-settings' } as any
  )) as { success: boolean; settings: any };

  assert.equal(getRes.success, true);
  assert.equal(getRes.settings.hasKey, true);
  assert.equal(getRes.settings.enabled, true);
  assert.equal(getRes.settings.consent, true);
  assert.equal(getRes.settings.timeoutMs, 15000);
  assert.equal(getRes.settings.isG0Blocked, true);
  assert.equal(getRes.settings.isG1Blocked, true);
  assert.ok(!JSON.stringify(getRes).includes('persistent_dummy_secret'));
});
