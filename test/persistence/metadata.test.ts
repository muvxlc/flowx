import test from 'node:test';
import assert from 'node:assert';
import {
  MetadataStorage,
  createMemoryChromeStorage,
  type PersistedJob,
} from '../../src/persistence/index.ts';

test('MetadataStorage - stores and rehydrates valid queue metadata in chrome.storage.local', async () => {
  const fakeStorage = createMemoryChromeStorage();
  const metadataStore = new MetadataStorage({ storage: fakeStorage });

  const sampleJobs: PersistedJob[] = [
    {
      id: 'job-1',
      media: 'image',
      mode: 'text-only',
      prompt: 'A cyberpunk street scene in Bangkok',
      provider: 'meta',
      state: 'pending',
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'job-2',
      media: 'video',
      mode: 'single-ref',
      prompt: 'Camera flying through neon alley',
      referenceId: 'ref-media-1',
      provider: 'meta',
      state: 'paused',
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1100,
      updatedAt: 1150,
    },
  ];

  await metadataStore.saveJobs(sampleJobs);
  const rehydrated = await metadataStore.getJobs();

  assert.strictEqual(rehydrated.length, 2);
  assert.strictEqual(rehydrated[0]?.id, 'job-1');
  assert.strictEqual(rehydrated[0]?.prompt, 'A cyberpunk street scene in Bangkok');
  assert.strictEqual(rehydrated[1]?.referenceId, 'ref-media-1');

  // Verify schema version is stored alongside metadata
  const version = await metadataStore.getSchemaVersion();
  assert.strictEqual(typeof version, 'number');
  assert.ok(version >= 1);
});

test('MetadataStorage - guard rejects storing raw media blobs in chrome.storage', async () => {
  const fakeStorage = createMemoryChromeStorage();
  const metadataStore = new MetadataStorage({ storage: fakeStorage });

  const rawBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const invalidJob = {
    id: 'job-bad-blob',
    media: 'image',
    mode: 'text-only',
    prompt: 'test',
    provider: 'meta',
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: 1000,
    updatedAt: 1000,
    rawBlobData: rawBytes, // Illegal! Blobs must live in IndexedDB
  } as unknown as PersistedJob;

  await assert.rejects(
    async () => {
      await metadataStore.saveJobs([invalidJob]);
    },
    (err: Error) => {
      return err.message.includes('raw media blobs');
    }
  );
});

test('MetadataStorage - schema migration upgrades older schema to current version', async () => {
  const fakeStorage = createMemoryChromeStorage();
  // Simulate v0 legacy storage without version tag and old job shape
  await fakeStorage.set({
    'meta_automator_jobs': [
      {
        id: 'legacy-job-1',
        prompt_text: 'Legacy prompt',
        status: 'queued',
        timestamp: 500,
      },
    ],
  });

  const metadataStore = new MetadataStorage({ storage: fakeStorage });
  const rehydrated = await metadataStore.getJobs();

  assert.strictEqual(rehydrated.length, 1);
  assert.strictEqual(rehydrated[0]?.id, 'legacy-job-1');
  assert.strictEqual(rehydrated[0]?.prompt, 'Legacy prompt');
  assert.strictEqual(rehydrated[0]?.state, 'pending');

  const upgradedVersion = await metadataStore.getSchemaVersion();
  assert.strictEqual(upgradedVersion, 1);
});

test('MetadataStorage - corrupt records are quarantined without deleting valid data', async () => {
  const fakeStorage = createMemoryChromeStorage();
  // Inject mixed valid and corrupt records
  await fakeStorage.set({
    'meta_automator_schema_version': 1,
    'meta_automator_jobs': [
      {
        id: 'valid-job-1',
        media: 'image',
        mode: 'text-only',
        prompt: 'Valid prompt',
        provider: 'meta',
        state: 'pending',
        retryCount: 0,
        maxRetries: 3,
        createdAt: 1000,
        updatedAt: 1000,
      },
      null, // Corrupt entry
      { id: 'corrupt-no-prompt' }, // Missing required fields
      'totally-invalid-string', // Non-object
    ],
  });

  const metadataStore = new MetadataStorage({ storage: fakeStorage });
  const { validJobs, quarantinedCount } = await metadataStore.loadWithQuarantine();

  assert.strictEqual(validJobs.length, 1);
  assert.strictEqual(validJobs[0]?.id, 'valid-job-1');
  assert.strictEqual(quarantinedCount, 3);

  // Quarantine storage contains records for manual/diagnostic recovery
  const quarantine = await metadataStore.getQuarantinedRecords();
  assert.strictEqual(quarantine.length, 3);
});

test('MetadataStorage - invalid or poisoned job state strings are quarantined', async () => {
  const fakeStorage = createMemoryChromeStorage();
  await fakeStorage.set({
    meta_automator_jobs: [
      { id: 'job-valid', prompt: 'clean prompt', state: 'pending' },
      { id: 'job-poisoned', prompt: 'poisoned state prompt', state: 'BOGUS_CORRUPT_STATE' },
    ],
  });

  const metadataStore = new MetadataStorage({ storage: fakeStorage });
  const { validJobs, quarantinedCount } = await metadataStore.loadWithQuarantine();

  assert.strictEqual(validJobs.length, 1);
  assert.strictEqual(validJobs[0]?.id, 'job-valid');
  assert.strictEqual(quarantinedCount, 1);

  const quarantine = await metadataStore.getQuarantinedRecords();
  assert.strictEqual(quarantine.length, 1);
  assert.strictEqual((quarantine[0]?.rawData as Record<string, unknown>)?.['id'], 'job-poisoned');
  assert.ok(quarantine[0]?.reason.includes('state'));
});

