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

test('SettingsService: initializes with default configuration and G1 BLOCKED state', async () => {
  // Given: a clean memory storage adapter
  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);

  // When: reading public settings
  const publicSettings = await service.getPublicSettings();

  // Then: default values conform to Prototype A contract with G1 BLOCKED
  assert.equal(publicSettings.endpoint, PINNED_9ROUTER_ENDPOINT);
  assert.equal(publicSettings.modelId, UNKNOWN_MODEL_ID);
  assert.equal(publicSettings.displayLabel, JEV_DISPLAY_LABEL);
  assert.equal(publicSettings.hasPersonalKey, false);
  assert.equal(publicSettings.maskedKey, null);
  assert.equal(publicSettings.enabled, false);
  assert.equal(publicSettings.consent, false);
  assert.equal(publicSettings.timeoutMs, 5000);
  assert.equal(publicSettings.isG1Blocked, true);
});

test('SettingsService: safe save and remove of personal key with dummy_secret', async () => {
  // Given: settings service
  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);
  const dummyKey = 'dummy_secret_sk_9r_1234567890abcdef';

  // When: saving personal key
  await service.savePersonalKey(dummyKey);
  const afterSave = await service.getPublicSettings();

  // Then: public settings indicates key exists with mask, but NEVER leaks the raw key
  assert.equal(afterSave.hasPersonalKey, true);
  assert.equal(afterSave.maskedKey, '••••••••••••••••');
  assert.ok(!JSON.stringify(afterSave).includes(dummyKey), 'Raw key must not appear in public settings JSON');

  // When: removing personal key
  await service.removePersonalKey();
  const afterRemove = await service.getPublicSettings();

  // Then: key state is cleared
  assert.equal(afterRemove.hasPersonalKey, false);
  assert.equal(afterRemove.maskedKey, null);
});

test('SettingsService: strictly enforces pinned endpoint and rejects mismatches or redirects', async () => {
  // Given: settings service
  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);

  // When / Then: attempting to update endpoint to arbitrary or redirected URL throws
  await assert.rejects(
    async () => {
      await service.updateSettings({
        endpoint: 'https://evil-proxy.com/v1/systemone',
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof SettingsError);
      assert.equal(err.code, 'INVALID_ENDPOINT');
      return true;
    }
  );

  // When / Then: attempting http or localhost or query params throws
  await assert.rejects(
    async () => {
      await service.updateSettings({
        endpoint: 'http://9router.bangkhan.com/v1/systemone',
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof SettingsError);
      assert.equal(err.code, 'INVALID_ENDPOINT');
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await service.updateSettings({
        endpoint: 'https://9router.bangkhan.com/v1/systemone?redirect=https://evil.com',
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof SettingsError);
      assert.equal(err.code, 'INVALID_ENDPOINT');
      return true;
    }
  );
});

test('SettingsService: validates consent, toggle, and timeout bounds', async () => {
  // Given: settings service
  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);

  // When: updating settings with valid options
  await service.updateSettings({
    enabled: true,
    consent: true,
    timeoutMs: 8000,
  });
  const updated = await service.getPublicSettings();

  // Then: valid updates are reflected
  assert.equal(updated.enabled, true);
  assert.equal(updated.consent, true);
  assert.equal(updated.timeoutMs, 8000);

  // When / Then: invalid timeout below minimum (<1000ms) is rejected
  await assert.rejects(
    async () => {
      await service.updateSettings({ timeoutMs: 500 });
    },
    (err: unknown) => {
      assert.ok(err instanceof SettingsError);
      assert.equal(err.code, 'INVALID_TIMEOUT');
      return true;
    }
  );

  // When / Then: invalid timeout above maximum (>30000ms) is rejected
  await assert.rejects(
    async () => {
      await service.updateSettings({ timeoutMs: 45000 });
    },
    (err: unknown) => {
      assert.ok(err instanceof SettingsError);
      assert.equal(err.code, 'INVALID_TIMEOUT');
      return true;
    }
  );
});

test('SettingsService: live connection test is disabled pending verified contract (G1 BLOCKED)', async () => {
  // Given: settings service with dummy key saved
  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);
  await service.savePersonalKey('dummy_secret_key');

  // When / Then: executing live connection test is rejected with G1_BLOCKED
  await assert.rejects(
    async () => {
      await service.executeLiveTest();
    },
    (err: unknown) => {
      assert.ok(err instanceof SettingsError);
      assert.equal(err.code, 'G1_BLOCKED');
      assert.ok(err.message.includes('G1 contract gate BLOCKED'));
      return true;
    }
  );
});

test('SettingsService: getInternalKeyForServiceWorker enforces consent and local-only access', async () => {
  // Given: settings service with key but NO consent
  const storage = new MemoryStorageAdapter();
  const service = new SettingsService(storage);
  await service.savePersonalKey('dummy_secret_local_only');

  // When / Then: attempting to retrieve internal key without consent fails closed
  await assert.rejects(
    async () => {
      await service.getInternalKeyForBackground();
    },
    (err: unknown) => {
      assert.ok(err instanceof SettingsError);
      assert.equal(err.code, 'CONSENT_REQUIRED');
      return true;
    }
  );

  // When: consent is granted
  await service.updateSettings({ consent: true });
  const internalKey = await service.getInternalKeyForBackground();

  // Then: background service receives key for authorized worker-only use
  assert.equal(internalKey, 'dummy_secret_local_only');
});
