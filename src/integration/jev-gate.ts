import type { Job } from '../queue/types.ts';
import { transitionJob } from '../queue/state.ts';
import {
  type ChoiceDecision,
  type ScoreDecision,
  type NoulDecision,
  type JevEvaluationResult,
  JevError,
} from '../jev/types.ts';
import { MockJevClient } from '../jev/client.ts';
import {
  assertNoProviderStatusImpersonation,
  assertNoModelIdInference,
  sanitizeSecret,
} from '../jev/guard.ts';
import { assertLiveJevPermitted } from '../jev/gate.ts';
import {
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_JEV_GATE_RUBRIC,
  PINNED_MODEL_ID,
  type JevGateConfig,
  type JevGateEvaluationOptions,
  type JevGateResult,
  type JevGateFallbackType,
} from './jev-gate-types.ts';

export * from './jev-gate-types.ts';

const THAI_AMBIGUITY_REGEX =
  /(หรือเปล่า|ไม่แน่ใจ|ก้ำกึ่ง|อะไรก็ได้|แล้วแต่|หรือวิดีโอก็ได้|รูปหรือวิดีโอ|อาจจะ)/;

function toNeedsReview(job: Job, reason: string): Job {
  if (job.state === 'draft') {
    return transitionJob(transitionJob(job, { type: 'SUBMIT' }), {
      type: 'MARK_NEEDS_REVIEW',
      reason,
    });
  }
  if (job.state === 'needs-review') {
    return { ...job, error: reason, updatedAt: Date.now() };
  }
  return transitionJob(job, { type: 'MARK_NEEDS_REVIEW', reason });
}

function toReviewed(job: Job, extra: Record<string, unknown>): Job {
  const base =
    job.state === 'draft'
      ? transitionJob(job, { type: 'SUBMIT' })
      : job.state === 'needs-review'
        ? transitionJob(job, { type: 'RESOLVE_REVIEW', approve: true })
        : job;
  return {
    ...base,
    settings: {
      ...base.settings,
      customParameters: { ...base.settings.customParameters, ...extra },
    },
    updatedAt: Date.now(),
  };
}

export class JevGate {
  private readonly config: JevGateConfig;

  constructor(config: JevGateConfig) {
    if (config.live) assertLiveJevPermitted();
    if (config.modelId !== undefined) assertNoModelIdInference(config.modelId, false);
    this.config = {
      ...config,
      modelId: PINNED_MODEL_ID,
      minConfidence: config.minConfidence ?? DEFAULT_CONFIDENCE_THRESHOLD,
      scoreThreshold: config.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD,
      rubric: config.rubric ?? DEFAULT_JEV_GATE_RUBRIC,
    };
  }

  getConfig(): JevGateConfig {
    return { ...this.config };
  }

  private fallback(
    job: Job,
    type: JevGateFallbackType,
    reason: string
  ): JevGateResult {
    return {
      status: 'needs-review',
      job: toNeedsReview(job, reason),
      isFallback: true,
      fallbackType: type,
      reason,
    };
  }

  private handleDeterministicFallback(job: Job): JevGateResult {
    if (job.prompt.trim().length === 0) {
      return this.fallback(job, 'disabled_deterministic', 'Empty prompt rejected by deterministic fallback');
    }
    return {
      status: 'reviewed',
      job: toReviewed(job, {
        jevGate: { status: 'reviewed', mode: 'deterministic_fallback', evaluatedAt: Date.now() },
      }),
      isFallback: true,
      fallbackType: 'disabled_deterministic',
      reason: 'Deterministic fallback: Jev disabled',
    };
  }

  async evaluateJob(
    job: Job,
    client?: MockJevClient | undefined,
    options?: JevGateEvaluationOptions | undefined
  ): Promise<JevGateResult> {
    if (!this.config.enabled) return this.handleDeterministicFallback(job);

    if (!this.config.consent) {
      return this.fallback(
        job,
        'consent_denied',
        'Consent required: User consent required before evaluating prompt metadata with Jev'
      );
    }

    if (/[\u0E00-\u0E7F]/.test(job.prompt) && THAI_AMBIGUITY_REGEX.test(job.prompt)) {
      return this.fallback(
        job,
        'thai_ambiguity',
        'Thai prompt contains ambiguous intent or modality requiring human review'
      );
    }

    const evalClient =
      client ??
      new MockJevClient({
        consent: this.config.consent,
        minConfidence: this.config.minConfidence,
        personalKey: this.config.personalKey,
      });

    const evalOpts: JevGateEvaluationOptions = options ?? {
      type: 'score',
      questionId: 'q_prompt_score',
      rubric: this.config.rubric,
    };

    try {
      const evalResult = await this.dispatchEvaluation(evalClient, job.prompt, evalOpts);
      if (evalResult.fallbackRequired) {
        const safeReason = sanitizeSecret(evalResult.fallback.reason, this.config.personalKey);
        const isLow = evalResult.error.code === 'LOW_CONFIDENCE';
        return this.fallback(job, isLow ? 'low_confidence' : 'error_fallback', safeReason);
      }

      const decision = evalResult.decision;
      assertNoProviderStatusImpersonation(decision);

      if (decision.decisionType === 'score') {
        const threshold = evalOpts.scoreThreshold ?? this.config.scoreThreshold!;
        if (decision.value < threshold) {
          return {
            ...this.fallback(job, 'low_score', `Score ${decision.value} below threshold ${threshold}`),
            decision,
          };
        }
      }

      if (decision.decisionType === 'noul' && decision.value === true) {
        return {
          ...this.fallback(job, 'low_score', `Prompt flagged for human review by Jev [${decision.label ?? 'flagged'}]`),
          decision,
        };
      }

      return {
        status: 'reviewed',
        job: toReviewed(job, {
          jevGate: { status: 'reviewed', decision, evaluatedAt: Date.now(), modelId: PINNED_MODEL_ID },
        }),
        decision,
        isFallback: false,
      };
    } catch (err: unknown) {
      const code = err instanceof JevError ? err.code : 'CLIENT_ERROR';
      const msg = err instanceof Error ? err.message : 'Unknown error during Jev decision gate execution';
      const safeMsg = sanitizeSecret(msg, this.config.personalKey);
      const isImpersonation = code === 'PROVIDER_IMPERSONATION_DETECTED';
      return this.fallback(
        job,
        isImpersonation ? 'impersonation_blocked' : 'error_fallback',
        `Jev decision failed [${code}]: ${safeMsg}`
      );
    }
  }

  private async dispatchEvaluation(
    client: MockJevClient,
    prompt: string,
    options: JevGateEvaluationOptions
  ): Promise<
    | JevEvaluationResult<ChoiceDecision>
    | JevEvaluationResult<ScoreDecision>
    | JevEvaluationResult<NoulDecision>
  > {
    const minConfidence = options.minConfidence ?? this.config.minConfidence;
    if (options.type === 'choice') {
      return client.evaluateChoice({
        questionId: options.questionId,
        question: 'Classify job prompt mode or options',
        options: options.options ?? [],
        prompt,
        minConfidence,
      });
    }
    if (options.type === 'score') {
      return client.evaluateScore({
        questionId: options.questionId,
        question: 'Evaluate prompt quality against rubric',
        rubric: options.rubric ?? this.config.rubric,
        prompt,
        minConfidence,
      });
    }
    return client.evaluateNoul({
      questionId: options.questionId,
      question: 'Evaluate whether prompt requires human review',
      prompt,
      minConfidence,
    });
  }
}
