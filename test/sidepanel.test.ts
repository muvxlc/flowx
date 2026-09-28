import test from 'node:test';
import assert from 'node:assert';
import { pingServiceWorker, SidePanelApp } from '../src/sidepanel/sidepanel.ts';
import { MemoryChromeStorageArea } from '../src/persistence/memory-storage.ts';
import { PersistenceService } from '../src/persistence/service.ts';
import { SettingsService } from '../src/settings/service.ts';
import { MemoryStorageAdapter } from '../src/settings/storage.ts';

test('pingServiceWorker - returns false safely in non-extension environment', async () => {
  const result = await pingServiceWorker();
  assert.strictEqual(result, false);
});

test('SidePanelApp - initializes with default queue tab and supports tab switching', async () => {
  const storageArea = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage: storageArea });
  const settingsStorage = new MemoryStorageAdapter();
  const settingsService = new SettingsService(settingsStorage);

  const app = new SidePanelApp({ persistence, settingsService });
  assert.strictEqual(app.getActiveTab(), 'queue');

  app.switchTab('create');
  assert.strictEqual(app.getActiveTab(), 'create');

  app.switchTab('downloads');
  assert.strictEqual(app.getActiveTab(), 'downloads');

  app.switchTab('settings');
  assert.strictEqual(app.getActiveTab(), 'settings');

  app.switchTab('queue');
  assert.strictEqual(app.getActiveTab(), 'queue');
});

test('SidePanelApp - updateWorkerStatus returns boolean safely', async () => {
  const storageArea = new MemoryChromeStorageArea();
  const persistence = new PersistenceService({ storage: storageArea });
  const settingsStorage = new MemoryStorageAdapter();
  const settingsService = new SettingsService(settingsStorage);

  const app = new SidePanelApp({ persistence, settingsService });
  const status = await app.updateWorkerStatus();
  assert.strictEqual(typeof status, 'boolean');
});
