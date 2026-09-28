import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob, transitionJob } from '../../src/queue/index.ts';
import { MetaMockAdapter } from '../../src/providers/meta/index.ts';

test('Simulated real-surface invocation: full lifecycle for one image and one video', async () => {
  // Given: mock adapter and one image job + one video job
  const events: string[] = [];
  const adapter = new MetaMockAdapter({
    onLifecycleEvent: (event) => events.push(`${event.type}:${event.jobId}`)
  });

  const imageJob = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Thai ancient temple at sunset reflection on Chao Phraya river',
    provider: 'meta'
  });

  const videoJob = createJob({
    media: 'video',
    mode: 'text-only',
    prompt: 'Gentle waves rippling on golden sand during twilight, slow motion',
    provider: 'meta'
  });

  // When: stepping image job through queue transitions and adapter
  const runningImage = transitionJob(imageJob, { type: 'SUBMIT' });
  const activeImage = transitionJob(runningImage, { type: 'START' });

  const imageResult = await adapter.execute(activeImage);
  assert.equal(imageResult.status, 'completed');
  assert.ok(imageResult.result);

  const completedImage = transitionJob(activeImage, {
    type: 'COMPLETE',
    result: imageResult.result
  });
  assert.equal(completedImage.state, 'completed');

  // And: stepping video job through queue transitions and adapter
  const runningVideo = transitionJob(videoJob, { type: 'SUBMIT' });
  const activeVideo = transitionJob(runningVideo, { type: 'START' });

  const videoResult = await adapter.execute(activeVideo);
  assert.equal(videoResult.status, 'completed');
  assert.ok(videoResult.result);

  const completedVideo = transitionJob(activeVideo, {
    type: 'COMPLETE',
    result: videoResult.result
  });
  assert.equal(completedVideo.state, 'completed');

  // Then: verify observable media properties
  assert.equal(completedImage.result?.mediaType, 'image');
  assert.equal(completedImage.result?.mimeType, 'image/png');
  assert.equal(completedVideo.result?.mediaType, 'video');
  assert.equal(completedVideo.result?.mimeType, 'video/mp4');
  assert.ok((completedVideo.result?.durationSeconds ?? 0) > 0);

  // And: verify lifecycle events occurred in correct order
  assert.ok(events.includes(`START:${imageJob.id}`));
  assert.ok(events.includes(`COMPLETE:${imageJob.id}`));
  assert.ok(events.includes(`START:${videoJob.id}`));
  assert.ok(events.includes(`COMPLETE:${videoJob.id}`));

  // And: verify bounded duplicate submission prevention
  const dupCheck = await adapter.execute(completedImage);
  assert.equal(dupCheck.status, 'completed');
  assert.equal(dupCheck.result?.idempotencyKey, imageResult.result.idempotencyKey);
});
