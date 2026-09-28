import type { Job } from '../queue/types.ts';
import type { JevDecision } from '../jev/types.ts';

export const DEFAULT_SCORE_THRESHOLD = 0.7;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_JEV_GATE_RUBRIC = 'Fidelity to user intent on 0.0-1.0 scale';
export const PINNED_MODEL_ID = 'UNKNOWN';

export type JevGateFallbackType =
  | 'disabled_deterministic'
  | 'consent_denied'
  | 'low_confidence'
  | 'low_score'
  | 'thai_ambiguity'
  | 'error_fallback'
  | 'impersonation_blocked';

export interface JevGateConfig {
  readonly enabled: boolean;
  readonly consent: boolean;
  readonly live?: boolean | undefined;
  readonly modelId?: string | undefined;
  readonly minConfidence?: number | undefined;
  readonly scoreThreshold?: number | undefined;
  readonly rubric?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly personalKey?: string | undefined;
}

export interface JevGateEvaluationOptions {
  readonly type: 'score' | 'choice' | 'noul';
  readonly questionId: string;
  readonly options?: readonly string[] | undefined;
  readonly rubric?: string | undefined;
  readonly minConfidence?: number | undefined;
  readonly scoreThreshold?: number | undefined;
}

export interface JevGateResult {
  readonly status: 'reviewed' | 'needs-review';
  readonly job: Job;
  readonly decision?: JevDecision | undefined;
  readonly isFallback: boolean;
  readonly fallbackType?: JevGateFallbackType | undefined;
  readonly reason?: string | undefined;
}
