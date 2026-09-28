import type { JobTransitionEvent } from '../queue/types.ts';

export type JevErrorCode =
  | 'MALFORMED_RESPONSE'
  | 'UNKNOWN_ANSWER'
  | 'LOW_CONFIDENCE'
  | 'AUTH_FAILURE'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'CORS_OR_NETWORK_ERROR'
  | 'G1_BLOCKED'
  | 'CONSENT_REQUIRED'
  | 'PROVIDER_IMPERSONATION_DETECTED'
  | 'MODEL_ID_INFERENCE_FORBIDDEN'
  | 'CLIENT_ERROR';

export class JevError extends Error {
  readonly code: JevErrorCode;
  readonly statusCode?: number | undefined;

  constructor(code: JevErrorCode, message: string, statusCode?: number | undefined) {
    super(message);
    this.name = 'JevError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, JevError.prototype);
  }
}

export type JevDecisionType = 'choice' | 'score' | 'noul';

export interface ChoiceDecision {
  readonly decisionType: 'choice';
  readonly questionId: string;
  readonly value: string;
  readonly confidence: number;
  readonly rationale?: string | undefined;
}

export interface ScoreDecision {
  readonly decisionType: 'score';
  readonly questionId: string;
  readonly value: number;
  readonly confidence: number;
  readonly rubric?: string | undefined;
}

export interface NoulDecision {
  readonly decisionType: 'noul';
  readonly questionId: string;
  readonly value: boolean | string;
  readonly confidence: number;
  readonly label?: string | undefined;
}

export type JevDecision = ChoiceDecision | ScoreDecision | NoulDecision;

export interface EvaluateChoiceRequest {
  readonly questionId: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly prompt: string;
  readonly minConfidence?: number | undefined;
}

export interface EvaluateScoreRequest {
  readonly questionId: string;
  readonly question: string;
  readonly rubric?: string | undefined;
  readonly prompt: string;
  readonly minConfidence?: number | undefined;
}

export interface EvaluateNoulRequest {
  readonly questionId: string;
  readonly question: string;
  readonly label?: string | undefined;
  readonly prompt: string;
  readonly minConfidence?: number | undefined;
}

export interface JevFallbackAction {
  readonly action: 'MARK_NEEDS_REVIEW';
  readonly reason: string;
  readonly transitionEvent: JobTransitionEvent;
}

export interface JevSuccessResult<T extends JevDecision> {
  readonly success: true;
  readonly decision: T;
  readonly fallbackRequired: false;
}

export interface JevFallbackResult {
  readonly success: false;
  readonly error: JevError;
  readonly fallbackRequired: true;
  readonly fallback: JevFallbackAction;
}

export type JevEvaluationResult<T extends JevDecision> =
  | JevSuccessResult<T>
  | JevFallbackResult;

export interface SimulatedErrorConfig {
  readonly code: JevErrorCode;
  readonly message: string;
  readonly statusCode?: number | undefined;
}

export interface MockJevClientOptions {
  readonly consent: boolean;
  readonly minConfidence?: number | undefined;
  readonly personalKey?: string | undefined;
  readonly fixture?: unknown;
  readonly simulatedError?: SimulatedErrorConfig | undefined;
}
