import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MockJevClient,
  LiveJevClient,
  createLiveJevClient,
} from '../../src/jev/client.ts';
import { JevError } from '../../src/jev/types.ts';
import {
  assertNoProviderStatusImpersonation,
  assertNoModelIdInference,
  sanitizeSecret,
} from '../../src/jev/guard.ts';
import { parseChoiceDecision } from '../../src/jev/parser.ts';

test('Probe: G1 BLOCKED - live network client calls are strictly prohibited', () => {
  // Creating LiveJevClient must throw G1_BLOCKED
  assert.throws(
    () => new LiveJevClient(),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'G1_BLOCKED');
      return true;
    }
  );

  assert.throws(
    () => createLiveJevClient(),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'G1_BLOCKED');
      return true;
    }
  );
});

test('Probe: zero live fetch calls executed during mock evaluation', async () => {
  let fetchCallCount = 0;
  const originalFetch = globalThis.fetch;

  // Intercept globalThis.fetch to detect any rogue outbound HTTP
  globalThis.fetch = (async () => {
    fetchCallCount++;
    throw new Error('ROGUE_FETCH_ATTEMPT');
  }) as typeof fetch;

  try {
    const client = new MockJevClient({
      consent: true,
      fixture: {
        answers: {
          q1: { type: 'choice', value: 'a', confidence: 0.9 },
        },
      },
    });

    const result = await client.evaluateChoice({
      questionId: 'q1',
      question: 'Test question',
      options: ['a', 'b'],
      prompt: 'dummy prompt',
    });

    assert.equal(result.success, true);
    assert.equal(fetchCallCount, 0, 'No fetch calls must ever be made by mock client');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Probe: score cannot impersonate provider terminal or execution status', async () => {
  const forgedFixtures = [
    { type: 'score', value: 'completed', confidence: 0.95 },
    { type: 'score', value: 'running', confidence: 0.9 },
    { type: 'score', value: 'failed', confidence: 0.9 },
    { type: 'score', value: 0.95, confidence: 0.9, providerState: 'completed' },
    { type: 'choice', value: 'a', confidence: 0.9, providerStatus: 'running' },
  ];

  for (const forged of forgedFixtures) {
    assert.throws(
      () => assertNoProviderStatusImpersonation(forged),
      (err: unknown) => {
        if (!(err instanceof JevError)) return false;
        assert.equal(err.code, 'PROVIDER_IMPERSONATION_DETECTED');
        return true;
      }
    );
  }

  // Also verify that MockJevClient safely catches impersonation and falls back to MARK_NEEDS_REVIEW
  const client = new MockJevClient({
    consent: true,
    fixture: {
      answers: {
        q_forged: { type: 'score', value: 'completed', confidence: 0.99 },
      },
    },
  });

  const result = await client.evaluateChoice({
    questionId: 'q_forged',
    question: 'Status check',
    options: ['completed', 'failed'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'PROVIDER_IMPERSONATION_DETECTED');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});

test('Probe: model ID inference is strictly rejected when unverified', () => {
  const forbiddenInferences = [
    'jev-latest',
    'system-one-v1',
    'gpt-4o',
    'claude-3-5-sonnet',
    'bangkhan/jev',
  ];

  for (const modelId of forbiddenInferences) {
    assert.throws(
      () => assertNoModelIdInference(modelId, false),
      (err: unknown) => {
        if (!(err instanceof JevError)) return false;
        assert.equal(err.code, 'MODEL_ID_INFERENCE_FORBIDDEN');
        return true;
      }
    );
  }

  // Exact 'UNKNOWN' is permitted for unverified state
  assert.doesNotThrow(() => assertNoModelIdInference('UNKNOWN', false));

  // If verified (post-G1 PASS with proof), model ID is permitted
  assert.doesNotThrow(() => assertNoModelIdInference('jev-latest', true));
});

test('Probe: personal API keys and Bearer tokens are redacted from all error channels', async () => {
  const secretKey = 'sk_live_secret_key_abcdef123456';
  const rawErrorMessage = `Unauthorized: Bearer ${secretKey} was rejected by 9router.bangkhan.com`;

  // Direct sanitizer test
  const sanitized = sanitizeSecret(rawErrorMessage, secretKey);
  assert.doesNotMatch(sanitized, new RegExp(secretKey));
  assert.match(sanitized, /\[REDACTED\]/);

  // Client fail-safe integration test
  const client = new MockJevClient({
    consent: true,
    personalKey: secretKey,
    simulatedError: {
      code: 'AUTH_FAILURE',
      message: `Failed auth with Bearer ${secretKey}`,
      statusCode: 401,
    },
  });

  const result = await client.evaluateChoice({
    questionId: 'q1',
    question: 'test question',
    options: ['x', 'y'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'AUTH_FAILURE');
    assert.equal(result.error.statusCode, 401);
    assert.doesNotMatch(result.error.message, new RegExp(secretKey));
    assert.doesNotMatch(result.fallback.reason, new RegExp(secretKey));
    assert.match(result.fallback.reason, /\[REDACTED\]/);
  }
});

test('Probe: handles extreme and invalid payloads safely without crashing', async () => {
  const client = new MockJevClient({
    consent: true,
    fixture: {
      answers: {
        q_empty: { type: 'choice', value: '', confidence: 0.8 },
      },
    },
  });

  const result = await client.evaluateChoice({
    questionId: 'q_empty',
    question: '',
    options: [],
    prompt: '',
  });

  // Returns typed decision with empty value cleanly
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.decision.value, '');
  }
});
