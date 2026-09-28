import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJevResponse,
  parseChoiceDecision,
  parseScoreDecision,
  parseNoulDecision,
} from '../../src/jev/parser.ts';
import {
  assertNoProviderStatusImpersonation,
  assertNoModelIdInference,
} from '../../src/jev/guard.ts';
import { JevError } from '../../src/jev/types.ts';
import {
  FIXTURE_SYSTEMONE_CHOICE_VALID,
  FIXTURE_SYSTEMONE_SCORE_VALID,
  FIXTURE_SYSTEMONE_NOUL_VALID,
  FIXTURE_SYSTEMONE_LOW_CONFIDENCE,
  FIXTURE_MALFORMED_NON_OBJECT,
  FIXTURE_MALFORMED_MISSING_ANSWERS,
  FIXTURE_MALFORMED_INVALID_TYPE,
  FIXTURE_MALFORMED_MISSING_CONFIDENCE,
  FIXTURE_IMPERSONATING_PROVIDER_STATUS,
} from './fixtures.ts';

test('Jev Parser: successfully parses valid choice decision', () => {
  const result = parseChoiceDecision(
    FIXTURE_SYSTEMONE_CHOICE_VALID,
    'q_mode_choice',
    { minConfidence: 0.7 }
  );

  assert.equal(result.decisionType, 'choice');
  assert.equal(result.questionId, 'q_mode_choice');
  assert.equal(result.value, 'portrait');
  assert.equal(result.confidence, 0.94);
  assert.equal(result.rationale, 'Aspect ratio 9:16 indicates portrait orientation');
});

test('Jev Parser: successfully parses valid score decision', () => {
  const result = parseScoreDecision(
    FIXTURE_SYSTEMONE_SCORE_VALID,
    'q_prompt_score',
    { minConfidence: 0.7 }
  );

  assert.equal(result.decisionType, 'score');
  assert.equal(result.questionId, 'q_prompt_score');
  assert.equal(result.value, 0.88);
  assert.equal(result.confidence, 0.91);
  assert.equal(result.rubric, 'Fidelity to user intent on 0.0-1.0 scale');
});

test('Jev Parser: successfully parses valid noul decision', () => {
  const result = parseNoulDecision(
    FIXTURE_SYSTEMONE_NOUL_VALID,
    'q_needs_human_review',
    { minConfidence: 0.7 }
  );

  assert.equal(result.decisionType, 'noul');
  assert.equal(result.questionId, 'q_needs_human_review');
  assert.equal(result.value, false);
  assert.equal(result.confidence, 0.97);
  assert.equal(result.label, 'safe_to_queue');
});

test('Jev Parser: rejects decisions below confidence threshold with LOW_CONFIDENCE error', () => {
  assert.throws(
    () => {
      parseChoiceDecision(FIXTURE_SYSTEMONE_LOW_CONFIDENCE, 'q_mode_choice', {
        minConfidence: 0.7,
      });
    },
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'LOW_CONFIDENCE');
      assert.match(err.message, /Confidence 0.42 is below threshold 0.7/);
      return true;
    }
  );
});

test('Jev Parser: rejects malformed responses (non-object or missing answers)', () => {
  assert.throws(
    () => parseJevResponse(FIXTURE_MALFORMED_NON_OBJECT),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );

  assert.throws(
    () => parseJevResponse(FIXTURE_MALFORMED_MISSING_ANSWERS),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );
});

test('Jev Parser: rejects malformed answers (unsupported type or missing confidence)', () => {
  assert.throws(
    () => parseJevResponse(FIXTURE_MALFORMED_INVALID_TYPE),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );

  assert.throws(
    () => parseJevResponse(FIXTURE_MALFORMED_MISSING_CONFIDENCE),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'MALFORMED_RESPONSE');
      return true;
    }
  );
});

test('Jev Parser: rejects missing/unknown question ID', () => {
  assert.throws(
    () => parseChoiceDecision(FIXTURE_SYSTEMONE_CHOICE_VALID, 'non_existent_question'),
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'UNKNOWN_ANSWER');
      return true;
    }
  );
});

test('Jev Guard: forbids score or decision from impersonating provider status', () => {
  assert.throws(
    () => {
      assertNoProviderStatusImpersonation(FIXTURE_IMPERSONATING_PROVIDER_STATUS.answers.q_status);
    },
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'PROVIDER_IMPERSONATION_DETECTED');
      return true;
    }
  );
});

test('Jev Guard: forbids inferring model ID when unverified (must stay UNKNOWN)', () => {
  // Should throw if code tries to infer/guess a model ID without explicit verification
  assert.throws(
    () => {
      assertNoModelIdInference('jev-latest', false);
    },
    (err: unknown) => {
      if (!(err instanceof JevError)) return false;
      assert.equal(err.code, 'MODEL_ID_INFERENCE_FORBIDDEN');
      return true;
    }
  );

  // UNKNOWN is accepted as unverified placeholder
  assert.doesNotThrow(() => {
    assertNoModelIdInference('UNKNOWN', false);
  });
});
