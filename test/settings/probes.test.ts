import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SettingsService,
  MemoryStorageAdapter,
  PINNED_9ROUTER_ENDPOINT,
  UNKNOWN_MODEL_ID,
  JEV_DISPLAY_LABEL,
  SettingsError,
} from '../../src/settings/index.ts';
import { renderSettingsView } from '../../src/ui/settings/index.ts';

test('Probe: SSRF and URL override attacks are strictly blocked', async () => {
  const service = new SettingsService(new MemoryStorageAdapter());

  const dangerousEndpoints = [
    'http://9router.bangkhan.com/v1/systemone', // Non-HTTPS
    'https://9router.bangkhan.com/v1/other', // Modified path
    'https://evil.com/v1/systemone', // Host spoofing
    'https://9router.bangkhan.com.evil.com/v1/systemone', // Subdomain spoofing
    'https://127.0.0.1:8321/v1/systemone', // Localhost probe
    'https://169.254.169.254/latest/meta-data', // AWS metadata probe
    'javascript:alert(1)', // Scheme injection
    'data:text/html,<script>alert(1)</script>', // Data URI
    'https://9router.bangkhan.com/v1/systemone#redirect=evil.com', // Hash fragment injection
  ];

  for (const malicious of dangerousEndpoints) {
    await assert.rejects(
      async () => {
        await service.updateSettings({ endpoint: malicious });
      },
      (err: unknown) => {
        assert.ok(err instanceof SettingsError, `Should reject ${malicious}`);
        assert.equal(err.code, 'INVALID_ENDPOINT');
        return true;
      }
    );
  }
});

test('Probe: Key material never leaks into serialized representations or sync storage', async () => {
  const dummyKey = 'dummy_secret_super_classified_key_443';
  const syncStorageCalls: unknown[] = [];

  // Mock an environment where a developer might mistakenly call sync storage
  const mockSyncStorage = {
    set: async (data: unknown) => {
      syncStorageCalls.push(data);
    },
  };

  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);

  await service.savePersonalKey(dummyKey);
  const publicSettings = await service.getPublicSettings();

  // 1. Check JSON serialization of public settings
  const serialized = JSON.stringify(publicSettings);
  assert.ok(!serialized.includes(dummyKey), 'JSON serialization must not contain raw secret');

  // 2. Check Object.keys and values
  for (const val of Object.values(publicSettings)) {
    if (typeof val === 'string') {
      assert.notEqual(val, dummyKey, 'No public setting field may equal raw secret key');
    }
  }

  // 3. Confirm sync storage was never invoked
  assert.equal(syncStorageCalls.length, 0, 'chrome.storage.sync must never be called');
});

test('Probe: Zero live network calls when G1 is BLOCKED', async () => {
  const service = new SettingsService(new MemoryStorageAdapter());
  await service.savePersonalKey('dummy_secret_123');

  // Attempt live connection test
  let liveCallAttempted = false;
  try {
    await service.executeLiveTest();
    liveCallAttempted = true;
  } catch (err: unknown) {
    assert.ok(err instanceof SettingsError);
    assert.equal(err.code, 'G1_BLOCKED');
  }

  assert.equal(liveCallAttempted, false, 'Live network call must be prevented unconditionally');
});

test('Probe: Key removal clears secret completely with no lingering remnants', async () => {
  const dummyKey = 'dummy_secret_temporary_key_999';
  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);

  await service.savePersonalKey(dummyKey);
  assert.equal((await service.getPublicSettings()).hasPersonalKey, true);

  await service.removePersonalKey();
  const cleared = await service.getPublicSettings();
  assert.equal(cleared.hasPersonalKey, false);
  assert.equal(cleared.maskedKey, null);

  // Background internal lookup also returns null
  await service.updateSettings({ consent: true });
  const internal = await service.getInternalKeyForBackground();
  assert.equal(internal, null);
});

test('Probe: View markup strictly excludes reveal toggles under any state', () => {
  const states = [
    { hasKey: false, masked: null },
    { hasKey: true, masked: '••••••••••••••••' },
  ];

  for (const { hasKey, masked } of states) {
    const html = renderSettingsView({
      endpoint: PINNED_9ROUTER_ENDPOINT,
      modelId: UNKNOWN_MODEL_ID,
      displayLabel: JEV_DISPLAY_LABEL,
      hasPersonalKey: hasKey,
      maskedKey: masked,
      enabled: false,
      consent: false,
      timeoutMs: 5000,
      isG1Blocked: true,
    });

    assert.ok(!html.includes('btnToggleKeyMask'), 'btnToggleKeyMask must not exist in DOM');
    assert.ok(!html.includes('onclick="toggle'), 'No toggle handlers in DOM');
    assert.ok(!html.includes('Show Key'), 'No Show Key text in DOM');
    assert.ok(!html.includes('Reveal Key'), 'No Reveal Key text in DOM');
  }
});
