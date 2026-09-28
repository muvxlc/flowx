import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob, transitionJob } from '../../src/queue/index.ts';
import {
  MetaMockAdapter,
  isLiveAllowed,
  assertLivePermitted,
  isMockArtifactUrl,
  isDownloadableArtifact,
  type MetaMockResult,
} from '../../src/providers/meta/index.ts';
import { DownloadManager } from '../../src/exports/downloader.ts';
import { MemoryDownloadsAdapter, ChromeDownloadsAdapter } from '../../src/exports/adapter.ts';

test('Regression: mock URL cannot masquerade as live verified result in Chrome downloads manager (fail-closed)', async () => {
  // Given: Gate G0 is BLOCKED and mock adapter executes image job
  assert.equal(isLiveAllowed(), false, 'G0 must remain BLOCKED');
  assert.throws(() => assertLivePermitted(), /Gate G0 BLOCKED/i);

  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Fail-closed mock protocol test',
    provider: 'meta'
  });

  const execution = await adapter.execute(job);
  assert.equal(execution.status, 'completed');
  assert.ok(execution.result);

  const mockResult = execution.result as MetaMockResult;

  // Then: mock result semantics explicitly mark non-downloadable
  assert.equal(mockResult.downloadable, false, 'Mock result must declare downloadable=false');
  assert.equal(mockResult.isMockArtifact, true, 'Mock result must declare isMockArtifact=true');
  assert.ok(isMockArtifactUrl(mockResult.mediaUrl), 'Must be identified as mock artifact URL');
  assert.equal(isDownloadableArtifact(mockResult), false, 'Must not be considered downloadable');
  assert.ok(mockResult.mediaUrl.startsWith('mock://meta-ai/generated/'));

  // When: job passed to hardened ChromeDownloadsAdapter
  const submittedJob = transitionJob(job, { type: 'SUBMIT' });
  const runningJob = transitionJob(submittedJob, { type: 'START' });
  const completedJob = transitionJob(runningJob, {
    type: 'COMPLETE',
    result: mockResult
  });

  // Mock chrome runtime to simulate active MV3 environment
  const originalChrome = (globalThis as Record<string, unknown>).chrome;
  try {
    (globalThis as Record<string, unknown>).chrome = {
      downloads: {
        download: () => 1,
      },
      runtime: {},
    };

    const chromeAdapter = new ChromeDownloadsAdapter();
    const manager = new DownloadManager({ adapter: chromeAdapter });
    const downloadResult = await manager.downloadJob(completedJob);

    // Then: Chrome downloads manager strictly rejects mock:// scheme fail-closed
    assert.equal(downloadResult.status, 'error');
    assert.ok(
      downloadResult.error?.includes('Chrome downloads API does not permit mock:// scheme'),
      `Expected mock rejection error, got: ${downloadResult.error}`
    );
  } finally {
    (globalThis as Record<string, unknown>).chrome = originalChrome;
  }
});

test('Fail-closed provenance: unverified mock artifact host cannot masquerade as verified result', async () => {
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Spoof host test',
    provider: 'meta'
  });

  const submitted = transitionJob(job, { type: 'SUBMIT' });
  const running = transitionJob(submitted, { type: 'START' });
  const spoofedJob = transitionJob(running, {
    type: 'COMPLETE',
    result: {
      idempotencyKey: 'idem_spoof',
      mediaUrl: 'mock://unauthorized-host/generated/img_123.png',
      mediaType: 'image',
      mimeType: 'image/png',
      completedAt: Date.now(),
    }
  });

  const manager = new DownloadManager({ adapter: new MemoryDownloadsAdapter() });
  const result = await manager.downloadJob(spoofedJob);

  assert.equal(result.status, 'error');
  assert.ok(
    result.error?.includes('Unverified mock artifact host'),
    `Expected unverified host error, got: ${result.error}`
  );
});

test('Mock result: optional local safe data-URI artifact compatible with Task 11 download manager', async () => {
  // Given: adapter configured with safe-data-uri artifactFormat
  const adapter = new MetaMockAdapter({ artifactFormat: 'safe-data-uri' });
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Safe local artifact test',
    provider: 'meta'
  });

  // When: executed
  const execution = await adapter.execute(job);
  assert.equal(execution.status, 'completed');
  assert.ok(execution.result);

  // Then: returns safe data URI artifact without fabricating remote URL
  assert.ok(execution.result.mediaUrl.startsWith('data:image/png;base64,'));
  assert.equal(isMockArtifactUrl(execution.result.mediaUrl), false);
  assert.equal(isDownloadableArtifact(execution.result), true);

  // When: stepped through valid transitions and passed to DownloadManager
  const submittedJob = transitionJob(job, { type: 'SUBMIT' });
  const runningJob = transitionJob(submittedJob, { type: 'START' });
  const completedJob = transitionJob(runningJob, {
    type: 'COMPLETE',
    result: execution.result
  });
  const downloadAdapter = new MemoryDownloadsAdapter();
  const manager = new DownloadManager({ adapter: downloadAdapter });
  const downloadResult = await manager.downloadJob(completedJob);

  // Then: safely downloaded as local data URI without network call
  assert.equal(downloadResult.status, 'success');
  assert.equal(downloadAdapter.downloads.length, 1);
  assert.ok(downloadAdapter.downloads[0]?.url.startsWith('data:image/png;base64,'));
});
