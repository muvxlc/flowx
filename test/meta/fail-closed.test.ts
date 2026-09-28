import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob } from '../../src/queue/index.ts';
import {
  MetaMockAdapter,
  isLiveAllowed,
  assertLivePermitted,
  type MetaAdapterOptions
} from '../../src/providers/meta/index.ts';

test('Gate G0: live Meta AI adapter is strictly BLOCKED', () => {
  // Given: Gate G0 status check
  const allowed = isLiveAllowed();

  // Then: live automation is not permitted
  assert.equal(allowed, false, 'Gate G0 must forbid live automation');

  // When / Then: live execution assertion throws fail-closed error
  assert.throws(
    () => assertLivePermitted(),
    /Gate G0 BLOCKED.*Meta Terms of Service/i
  );
});

test('Fail-closed: changed UI or missing selector halts and flags needs-review', async () => {
  // Given: adapter configured with changed-ui simulated state
  const adapter = new MetaMockAdapter({ simulatedState: 'changed-ui' });
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Prompt on updated DOM',
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: halts closed without false success
  assert.equal(response.status, 'needs-review');
  assert.equal(response.code, 'UI_CHANGED');
  assert.ok(response.error?.includes('selector'));
  assert.equal(response.retryable, false);
});

test('Fail-closed: login required halts queue with paused state', async () => {
  // Given: adapter configured with login-required simulated state
  const adapter = new MetaMockAdapter({ simulatedState: 'login-required' });
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Prompt requiring authentication',
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: fails closed to paused state, never silently retries
  assert.equal(response.status, 'paused');
  assert.equal(response.code, 'AUTH_REQUIRED');
  assert.ok(response.error?.includes('login'));
  assert.equal(response.retryable, false);
});

test('Fail-closed: challenge or CAPTCHA halts queue with paused state', async () => {
  // Given: adapter configured with challenge simulated state
  const adapter = new MetaMockAdapter({ simulatedState: 'challenge' });
  const job = createJob({
    media: 'video',
    mode: 'text-only',
    prompt: 'Video prompt hitting challenge',
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: fails closed to paused state, zero blind retries
  assert.equal(response.status, 'paused');
  assert.equal(response.code, 'CHALLENGE_DETECTED');
  assert.ok(response.error?.includes('challenge'));
  assert.equal(response.retryable, false);
});

test('Fail-closed: rate limit (429) pauses queue cleanly', async () => {
  // Given: adapter configured with rate-limited simulated state
  const adapter = new MetaMockAdapter({ simulatedState: 'rate-limited' });
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Rapid generation request',
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: pauses queue
  assert.equal(response.status, 'paused');
  assert.equal(response.code, 'RATE_LIMITED');
  assert.ok(response.error?.includes('429'));
});

test('Fail-closed: upstream timeout (>180s) marks needs-review', async () => {
  // Given: adapter configured with timeout simulated state
  const adapter = new MetaMockAdapter({ simulatedState: 'timeout' });
  const job = createJob({
    media: 'video',
    mode: 'single-ref',
    prompt: 'Stuck video generation',
    referenceId: 'ref_sample_01',
    provider: 'meta'
  });

  // When: executed
  const response = await adapter.execute(job);

  // Then: flags needs-review instead of infinite loop
  assert.equal(response.status, 'needs-review');
  assert.equal(response.code, 'TIMEOUT');
  assert.ok(response.error?.includes('timeout'));
});

test('Duplicate submission: concurrent submission of same job is rejected', async () => {
  // Given: adapter running a simulated slow job
  const adapter = new MetaMockAdapter({ latencyMs: 50 });
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Concurrent duplicate test',
    provider: 'meta'
  });

  // When: submitting the same job concurrently twice
  const firstPromise = adapter.execute(job);
  const secondPromise = adapter.execute(job);

  const [firstRes, secondRes] = await Promise.all([firstPromise, secondPromise]);

  // Then: one completes, and the other is rejected as duplicate submission
  assert.equal(firstRes.status, 'completed');
  assert.equal(secondRes.status, 'failed');
  assert.equal(secondRes.code, 'DUPLICATE_SUBMISSION');
});

test('Idempotent execution: repeated execution of completed job returns cached result', async () => {
  // Given: adapter with completed job
  const adapter = new MetaMockAdapter();
  const job = createJob({
    media: 'image',
    mode: 'text-only',
    prompt: 'Idempotency test',
    provider: 'meta'
  });

  // When: executed once
  const first = await adapter.execute(job);
  assert.equal(first.status, 'completed');

  // And: executed a second time with the completed job
  job.result = first.result;
  job.idempotencyKey = first.result?.idempotencyKey;
  const second = await adapter.execute(job);

  // Then: returns identical result without re-executing
  assert.equal(second.status, 'completed');
  assert.equal(second.result?.idempotencyKey, first.result?.idempotencyKey);
  assert.equal(second.result?.mediaUrl, first.result?.mediaUrl);
});
