import {
  JevError,
  type ChoiceDecision,
  type ScoreDecision,
  type NoulDecision,
} from './types.ts';
import { assertNoProviderStatusImpersonation } from './guard.ts';

const VALID_DECISION_TYPES = new Set(['choice', 'score', 'noul']);

export interface ParsedJevResponse {
  readonly model?: string | undefined;
  readonly state?: string | undefined;
  readonly answers: Readonly<Record<string, Record<string, unknown>>>;
  readonly usage?: Readonly<Record<string, unknown>> | undefined;
}

export function parseJevResponse(raw: unknown): ParsedJevResponse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new JevError('MALFORMED_RESPONSE', 'Invalid Jev response: root must be a non-null object.');
  }

  const record = raw as Record<string, unknown>;

  if (!('answers' in record) || typeof record.answers !== 'object' || record.answers === null || Array.isArray(record.answers)) {
    throw new JevError('MALFORMED_RESPONSE', "Invalid Jev response: missing or invalid 'answers' object.");
  }

  const answers = record.answers as Record<string, unknown>;

  for (const [key, val] of Object.entries(answers)) {
    if (typeof val !== 'object' || val === null || Array.isArray(val)) {
      throw new JevError('MALFORMED_RESPONSE', `Invalid answer for '${key}': must be a JSON object.`);
    }

    const answerRecord = val as Record<string, unknown>;

    if (!('type' in answerRecord) || typeof answerRecord.type !== 'string') {
      throw new JevError('MALFORMED_RESPONSE', `Invalid answer for '${key}': missing string 'type'.`);
    }

    if (!VALID_DECISION_TYPES.has(answerRecord.type)) {
      throw new JevError(
        'MALFORMED_RESPONSE',
        `Unsupported decision type '${answerRecord.type}' for question '${key}'.`
      );
    }

    if (!('confidence' in answerRecord) || typeof answerRecord.confidence !== 'number') {
      throw new JevError(
        'MALFORMED_RESPONSE',
        `Missing or invalid numeric 'confidence' for question '${key}'.`
      );
    }

    assertNoProviderStatusImpersonation(answerRecord);
  }

  return {
    model: typeof record.model === 'string' ? record.model : undefined,
    state: typeof record.state === 'string' ? record.state : undefined,
    answers: answers as Record<string, Record<string, unknown>>,
    usage: typeof record.usage === 'object' && record.usage !== null ? (record.usage as Record<string, unknown>) : undefined,
  };
}

export function parseChoiceDecision(
  raw: unknown,
  questionId: string,
  options?: { minConfidence?: number }
): ChoiceDecision {
  const parsed = parseJevResponse(raw);
  const answer = parsed.answers[questionId];

  if (!answer) {
    throw new JevError(
      'UNKNOWN_ANSWER',
      `Question '${questionId}' was not answered in Jev response.`
    );
  }

  if (answer.type !== 'choice') {
    throw new JevError(
      'MALFORMED_RESPONSE',
      `Expected choice answer for '${questionId}', got '${answer.type}'.`
    );
  }

  const confidence = answer.confidence as number;
  const minConfidence = options?.minConfidence ?? 0.7;

  if (confidence < minConfidence) {
    throw new JevError(
      'LOW_CONFIDENCE',
      `Confidence ${confidence} is below threshold ${minConfidence} for question '${questionId}'.`
    );
  }

  return {
    decisionType: 'choice',
    questionId,
    value: String(answer.value ?? ''),
    confidence,
    rationale: typeof answer.rationale === 'string' ? answer.rationale : undefined,
  };
}

export function parseScoreDecision(
  raw: unknown,
  questionId: string,
  options?: { minConfidence?: number }
): ScoreDecision {
  const parsed = parseJevResponse(raw);
  const answer = parsed.answers[questionId];

  if (!answer) {
    throw new JevError(
      'UNKNOWN_ANSWER',
      `Question '${questionId}' was not answered in Jev response.`
    );
  }

  if (answer.type !== 'score') {
    throw new JevError(
      'MALFORMED_RESPONSE',
      `Expected score answer for '${questionId}', got '${answer.type}'.`
    );
  }

  if (typeof answer.value !== 'number') {
    throw new JevError(
      'MALFORMED_RESPONSE',
      `Expected numeric value for score '${questionId}', got '${typeof answer.value}'.`
    );
  }

  const confidence = answer.confidence as number;
  const minConfidence = options?.minConfidence ?? 0.7;

  if (confidence < minConfidence) {
    throw new JevError(
      'LOW_CONFIDENCE',
      `Confidence ${confidence} is below threshold ${minConfidence} for question '${questionId}'.`
    );
  }

  return {
    decisionType: 'score',
    questionId,
    value: answer.value,
    confidence,
    rubric: typeof answer.rubric === 'string' ? answer.rubric : undefined,
  };
}

export function parseNoulDecision(
  raw: unknown,
  questionId: string,
  options?: { minConfidence?: number }
): NoulDecision {
  const parsed = parseJevResponse(raw);
  const answer = parsed.answers[questionId];

  if (!answer) {
    throw new JevError(
      'UNKNOWN_ANSWER',
      `Question '${questionId}' was not answered in Jev response.`
    );
  }

  if (answer.type !== 'noul') {
    throw new JevError(
      'MALFORMED_RESPONSE',
      `Expected noul answer for '${questionId}', got '${answer.type}'.`
    );
  }

  const confidence = answer.confidence as number;
  const minConfidence = options?.minConfidence ?? 0.7;

  if (confidence < minConfidence) {
    throw new JevError(
      'LOW_CONFIDENCE',
      `Confidence ${confidence} is below threshold ${minConfidence} for question '${questionId}'.`
    );
  }

  return {
    decisionType: 'noul',
    questionId,
    value: typeof answer.value === 'boolean' ? answer.value : String(answer.value ?? ''),
    confidence,
    label: typeof answer.label === 'string' ? answer.label : undefined,
  };
}
