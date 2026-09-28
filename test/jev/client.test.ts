import test from 'node:test';
import assert from 'node:assert/strict';
import { MockJevClient } from '../../src/jev/client.ts';
import { JevError } from '../../src/jev/types.ts';
import { G1_VERDICT, assertLiveJevPermitted } from '../../src/jev/gate.ts';
import {
  FIXTURE_SYSTEMONE_CHOICE_VALID,
  FIXTURE_SYSTEMONE_SCORE_VALID,
  FIXTURE_SYSTEMONE_NOUL_VALID,
  DUMMY_KEY,
} from './fixtures.ts';

test('Jev Gate: G1 is BLOCKED and live client calls are prohibited', () => {
  assert.equal(G1_VERDICT.gate, 'G1');
  assert.equal(G1_VERDICT.status, 'BLOCKED');
  assert.equal(G1_VERDICT.allowLiveClient, false);
  assert.equal(G1_VERDICT.allowMockContract, true);

  assert.throws(
    () => assertLiveJevPermitted(),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'G1_BLOCKED');
      assert.match(err.message, /Gate G1 BLOCKED/);
      return true;
    }
  );
});

test('MockJevClient: executes observable choice decision in Node environment', async () => {
  const client = new MockJevClient({
    consent: true,
    minConfidence: 0.7,
    fixture: FIXTURE_SYSTEMONE_CHOICE_VALID,
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation for prompt',
    options: ['portrait', 'landscape', 'square'],
    prompt: 'A towering skyscraper in Bangkok under stormy clouds',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.decision.decisionType, 'choice');
    assert.equal(result.decision.value, 'portrait');
    assert.equal(result.decision.confidence, 0.94);
    assert.equal(result.fallbackRequired, false);
  }
});

test('MockJevClient: executes observable score decision in Node environment', async () => {
  const client = new MockJevClient({
    consent: true,
    minConfidence: 0.7,
    fixture: FIXTURE_SYSTEMONE_SCORE_VALID,
  });

  const result = await client.evaluateScore({
    questionId: 'q_prompt_score',
    question: 'Rate translation fidelity',
    rubric: '0.0 to 1.0 fidelity',
    prompt: 'แมวกำลังเล่นลูกบอลไหมพรม',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.decision.decisionType, 'score');
    assert.equal(result.decision.value, 0.88);
    assert.equal(result.decision.confidence, 0.91);
    assert.equal(result.fallbackRequired, false);
  }
});

test('MockJevClient: executes observable noul decision in Node environment', async () => {
  const client = new MockJevClient({
    consent: true,
    minConfidence: 0.7,
    fixture: FIXTURE_SYSTEMONE_NOUL_VALID,
  });

  const result = await client.evaluateNoul({
    questionId: 'q_needs_human_review',
    question: 'Check if prompt needs review',
    prompt: 'A tranquil river sunset',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.decision.decisionType, 'noul');
    assert.equal(result.decision.value, false);
    assert.equal(result.decision.confidence, 0.97);
    assert.equal(result.fallbackRequired, false);
  }
});

test('MockJevClient: fail-safe on AUTH_FAILURE (401) is observable without leaking key', async () => {
  const client = new MockJevClient({
    consent: true,
    simulatedError: {
      code: 'AUTH_FAILURE',
      message: '401 Unauthorized: API key required for remote API access',
      statusCode: 401,
    },
    personalKey: DUMMY_KEY,
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'AUTH_FAILURE');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
    // Verify personal key is NEVER in the error message or reason
    assert.doesNotMatch(result.error.message, new RegExp(DUMMY_KEY));
    assert.doesNotMatch(result.fallback.reason, new RegExp(DUMMY_KEY));
    assert.equal(result.fallback.transitionEvent.type, 'MARK_NEEDS_REVIEW');
  }
});

test('MockJevClient: fail-safe on TIMEOUT produces MARK_NEEDS_REVIEW', async () => {
  const client = new MockJevClient({
    consent: true,
    simulatedError: {
      code: 'TIMEOUT',
      message: 'Jev decision request timed out after 5000ms',
    },
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'TIMEOUT');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});

test('MockJevClient: fail-safe on RATE_LIMIT (429) produces MARK_NEEDS_REVIEW', async () => {
  const client = new MockJevClient({
    consent: true,
    simulatedError: {
      code: 'RATE_LIMIT',
      message: 'HTTP 429 Too Many Requests: Rate limit exceeded',
      statusCode: 429,
    },
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'RATE_LIMIT');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});

test('MockJevClient: fail-safe on CORS_OR_NETWORK_ERROR produces MARK_NEEDS_REVIEW', async () => {
  const client = new MockJevClient({
    consent: true,
    simulatedError: {
      code: 'CORS_OR_NETWORK_ERROR',
      message: 'CORS preflight failed: Access-Control-Allow-Origin header absent',
    },
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'CORS_OR_NETWORK_ERROR');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});

test('MockJevClient: fail-safe on MALFORMED_RESPONSE produces MARK_NEEDS_REVIEW', async () => {
  const client = new MockJevClient({
    consent: true,
    fixture: { corrupt: 'data' },
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'MALFORMED_RESPONSE');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});

test('MockJevClient: fail-safe on UNKNOWN_ANSWER produces MARK_NEEDS_REVIEW', async () => {
  const client = new MockJevClient({
    consent: true,
    fixture: FIXTURE_SYSTEMONE_CHOICE_VALID,
  });

  const result = await client.evaluateChoice({
    questionId: 'unknown_question_id',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'UNKNOWN_ANSWER');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});

test('MockJevClient: fail-safe on LOW_CONFIDENCE produces MARK_NEEDS_REVIEW', async () => {
  const client = new MockJevClient({
    consent: true,
    minConfidence: 0.85,
    fixture: {
      model: 'UNKNOWN',
      answers: {
        'q_mode_choice': {
          type: 'choice',
          value: 'portrait',
          confidence: 0.72, // Below 0.85
        },
      },
    },
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'LOW_CONFIDENCE');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});

test('MockJevClient: fails closed with CONSENT_REQUIRED when consent is denied', async () => {
  const client = new MockJevClient({
    consent: false,
    fixture: FIXTURE_SYSTEMONE_CHOICE_VALID,
  });

  const result = await client.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'test prompt',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, 'CONSENT_REQUIRED');
    assert.equal(result.fallback.action, 'MARK_NEEDS_REVIEW');
  }
});
