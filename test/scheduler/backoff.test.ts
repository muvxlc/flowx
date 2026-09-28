import test from 'node:test';
import assert from 'node:assert';
import {
  calculateBackoffDelay,
  BoundedBackoffTracker,
} from '../../src/scheduler/index.ts';

test('Backoff - exponential delay with upper bound cap', () => {
  const baseMs = 1000;
  const maxMs = 16000;
  const factor = 2;

  assert.strictEqual(calculateBackoffDelay(0, baseMs, maxMs, factor), 1000);
  assert.strictEqual(calculateBackoffDelay(1, baseMs, maxMs, factor), 2000);
  assert.strictEqual(calculateBackoffDelay(2, baseMs, maxMs, factor), 4000);
  assert.strictEqual(calculateBackoffDelay(3, baseMs, maxMs, factor), 8000);
  assert.strictEqual(calculateBackoffDelay(4, baseMs, maxMs, factor), 16000);
  assert.strictEqual(calculateBackoffDelay(5, baseMs, maxMs, factor), 16000, 'Should cap at maxMs');
  assert.strictEqual(calculateBackoffDelay(10, baseMs, maxMs, factor), 16000, 'Should remain capped');
});

test('BackoffTracker - tracks failures and resets on success', () => {
  const tracker = new BoundedBackoffTracker({
    baseBackoffMs: 500,
    maxBackoffMs: 4000,
    backoffFactor: 2,
  });

  assert.strictEqual(tracker.getAttemptCount(), 0);
  assert.strictEqual(tracker.getCurrentDelay(), 0);

  // Failure 1
  let delay = tracker.recordFailure();
  assert.strictEqual(delay, 500);
  assert.strictEqual(tracker.getAttemptCount(), 1);

  // Failure 2
  delay = tracker.recordFailure();
  assert.strictEqual(delay, 1000);
  assert.strictEqual(tracker.getAttemptCount(), 2);

  // Failure 3
  delay = tracker.recordFailure();
  assert.strictEqual(delay, 2000);

  // Failure 4
  delay = tracker.recordFailure();
  assert.strictEqual(delay, 4000);

  // Failure 5 (capped)
  delay = tracker.recordFailure();
  assert.strictEqual(delay, 4000);

  // Success
  tracker.recordSuccess();
  assert.strictEqual(tracker.getAttemptCount(), 0);
  assert.strictEqual(tracker.getCurrentDelay(), 0);
});
