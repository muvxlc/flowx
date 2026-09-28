import {
  JevError,
  type JevErrorCode,
  type ChoiceDecision,
  type ScoreDecision,
  type NoulDecision,
  type EvaluateChoiceRequest,
  type EvaluateScoreRequest,
  type EvaluateNoulRequest,
  type JevEvaluationResult,
  type JevFallbackResult,
  type MockJevClientOptions,
} from './types.ts';
import {
  parseChoiceDecision,
  parseScoreDecision,
  parseNoulDecision,
} from './parser.ts';
import { sanitizeSecret } from './guard.ts';
import { assertLiveJevPermitted } from './gate.ts';

export class MockJevClient {
  private readonly consent: boolean;
  private readonly minConfidence: number;
  private readonly personalKey?: string | undefined;
  private readonly fixture?: unknown;
  private readonly simulatedError?: MockJevClientOptions['simulatedError'] | undefined;

  constructor(options: MockJevClientOptions) {
    this.consent = options.consent;
    this.minConfidence = options.minConfidence ?? 0.7;
    this.personalKey = options.personalKey;
    this.fixture = options.fixture;
    this.simulatedError = options.simulatedError;
  }

  private createFallbackResult(err: unknown): JevFallbackResult {
    let code: JevErrorCode = 'CLIENT_ERROR';
    let rawMessage = 'Unknown client error during Jev decision';
    let statusCode: number | undefined;

    if (err instanceof JevError) {
      code = err.code;
      rawMessage = err.message;
      statusCode = err.statusCode;
    } else if (err instanceof Error) {
      rawMessage = err.message;
    }

    const safeMessage = sanitizeSecret(rawMessage, this.personalKey);
    const safeError = new JevError(code, safeMessage, statusCode);
    const safeReason = `Jev decision failed [${code}]: ${safeMessage}`;

    return {
      success: false,
      error: safeError,
      fallbackRequired: true,
      fallback: {
        action: 'MARK_NEEDS_REVIEW',
        reason: safeReason,
        transitionEvent: {
          type: 'MARK_NEEDS_REVIEW',
          reason: safeReason,
        },
      },
    };
  }

  private checkPreconditions(): void {
    if (!this.consent) {
      throw new JevError(
        'CONSENT_REQUIRED',
        'User consent required before evaluating prompt metadata with Jev.'
      );
    }

    if (this.simulatedError) {
      throw new JevError(
        this.simulatedError.code,
        this.simulatedError.message,
        this.simulatedError.statusCode
      );
    }
  }

  async evaluateChoice(
    request: EvaluateChoiceRequest
  ): Promise<JevEvaluationResult<ChoiceDecision>> {
    try {
      this.checkPreconditions();

      const minConf = request.minConfidence ?? this.minConfidence;
      const decision = parseChoiceDecision(this.fixture, request.questionId, {
        minConfidence: minConf,
      });

      return {
        success: true,
        decision,
        fallbackRequired: false,
      };
    } catch (err) {
      return this.createFallbackResult(err);
    }
  }

  async evaluateScore(
    request: EvaluateScoreRequest
  ): Promise<JevEvaluationResult<ScoreDecision>> {
    try {
      this.checkPreconditions();

      const minConf = request.minConfidence ?? this.minConfidence;
      const decision = parseScoreDecision(this.fixture, request.questionId, {
        minConfidence: minConf,
      });

      return {
        success: true,
        decision,
        fallbackRequired: false,
      };
    } catch (err) {
      return this.createFallbackResult(err);
    }
  }

  async evaluateNoul(
    request: EvaluateNoulRequest
  ): Promise<JevEvaluationResult<NoulDecision>> {
    try {
      this.checkPreconditions();

      const minConf = request.minConfidence ?? this.minConfidence;
      const decision = parseNoulDecision(this.fixture, request.questionId, {
        minConfidence: minConf,
      });

      return {
        success: true,
        decision,
        fallbackRequired: false,
      };
    } catch (err) {
      return this.createFallbackResult(err);
    }
  }
}

/**
 * Live client placeholder - explicitly blocked by Gate G1.
 * Calling or creating this will always fail closed.
 */
export class LiveJevClient {
  constructor() {
    assertLiveJevPermitted();
  }
}

export function createLiveJevClient(): never {
  assertLiveJevPermitted();
}
