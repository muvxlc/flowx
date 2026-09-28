import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob } from '../../src/queue/index.ts';
import {
  MetaMockAdapter,
  isMockArtifactUrl,
  isDownloadableArtifact,
  type MetaMockResult,
} from '../../src/providers/meta/index.ts';
import {
  sampleRefA,
  sampleRefB,
  sampleRefC
} from '../import/fixtures.ts';

test('M1: Image Text-Only mode executes cleanly in mock adapter', async () => {
  // Given: text-only image job
  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Nordic pine forest in morning mist, golden hour',
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: returns completed image artifact with idempotency key
  assert.equal(response.status, 'completed');
  assert.ok(response.result, 'Expected result to be present');
  assert.equal(response.result.mediaType, 'image');
  assert.equal(response.result.mimeType, 'image/png');
  assert.ok(response.result.idempotencyKey.length > 0);
  assert.ok(response.result.mediaUrl.includes('mock://meta-ai/'));
  assert.equal((response.result as MetaMockResult).downloadable, false);
  assert.equal((response.result as MetaMockResult).isMockArtifact, true);
  assert.equal(isDownloadableArtifact(response.result), false);
  assert.equal(response.result.width, 1024);
  assert.equal(response.result.height, 1024);
});

test('M2: Image Single-Ref mode executes with shared reference', async () => {
  // Given: single-ref image job with reference ID
  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'image',
    mode: 'single-ref',
    prompt: 'Cyberpunk engineer portrait in neon alley',
    referenceId: sampleRefA.id,
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: completes successfully retaining reference context
  assert.equal(response.status, 'completed');
  assert.ok(response.result);
  assert.equal(response.result.mediaType, 'image');
  assert.equal(response.result.mimeType, 'image/png');
  assert.ok(response.result.mediaUrl.includes(sampleRefA.id));
  assert.equal((response.result as MetaMockResult).downloadable, false);
  assert.equal((response.result as MetaMockResult).isMockArtifact, true);
});

test('M3: Image Paired-Ref mode executes with 1:1 reference', async () => {
  // Given: paired-ref image job with designated paired asset
  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'image',
    mode: 'paired-ref',
    prompt: 'Futuristic hover car gliding over illuminated highway',
    referenceId: sampleRefB.id,
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: completes successfully reflecting paired asset
  assert.equal(response.status, 'completed');
  assert.ok(response.result);
  assert.equal(response.result.mediaType, 'image');
  assert.ok(response.result.mediaUrl.includes(sampleRefB.id));
  assert.equal((response.result as MetaMockResult).downloadable, false);
  assert.equal((response.result as MetaMockResult).isMockArtifact, true);
});

test('M4: Video Text-Only mode generates video without starting frame', async () => {
  // Given: text-only video job
  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'video',
    mode: 'text-only',
    prompt: 'Cinematic slow camera pan over misty mountain ridge',
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: returns completed video artifact with duration and mp4 mime
  assert.equal(response.status, 'completed');
  assert.ok(response.result);
  assert.equal(response.result.mediaType, 'video');
  assert.equal(response.result.mimeType, 'video/mp4');
  assert.ok(response.result.durationSeconds && response.result.durationSeconds > 0);
  assert.ok(response.result.mediaUrl.endsWith('.mp4'));
  assert.equal((response.result as MetaMockResult).downloadable, false);
  assert.equal((response.result as MetaMockResult).isMockArtifact, true);
  assert.equal(isDownloadableArtifact(response.result), false);
});

test('M5: Video Single-Ref mode animates single reference image', async () => {
  // Given: single-ref video job animating sampleRefA
  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'video',
    mode: 'single-ref',
    prompt: 'Gentle camera zoom in on character eyes as neon lights flicker',
    referenceId: sampleRefA.id,
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: completes video artifact referencing starting asset
  assert.equal(response.status, 'completed');
  assert.ok(response.result);
  assert.equal(response.result.mediaType, 'video');
  assert.equal(response.result.mimeType, 'video/mp4');
  assert.ok(response.result.mediaUrl.includes(sampleRefA.id));
  assert.equal((response.result as MetaMockResult).downloadable, false);
  assert.equal((response.result as MetaMockResult).isMockArtifact, true);
});

test('M6: Video Paired-Ref mode animates corresponding starting frame', async () => {
  // Given: paired-ref video job animating sampleRefC
  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'video',
    mode: 'paired-ref',
    prompt: 'Temple bells gently swinging in evening breeze with river reflection',
    referenceId: sampleRefC.id,
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: completes video artifact linked to paired asset
  assert.equal(response.status, 'completed');
  assert.ok(response.result);
  assert.equal(response.result.mediaType, 'video');
  assert.equal(response.result.mimeType, 'video/mp4');
  assert.ok(response.result.mediaUrl.includes(sampleRefC.id));
  assert.equal((response.result as MetaMockResult).downloadable, false);
  assert.equal((response.result as MetaMockResult).isMockArtifact, true);
});
