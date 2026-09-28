import { JevError } from './types.ts';

const FORBIDDEN_PROVIDER_STATUSES = new Set([
  'draft',
  'pending',
  'running',
  'completed',
  'failed',
  'paused',
  'needs-review',
]);

export function assertNoProviderStatusImpersonation(answer: unknown): void {
  if (typeof answer !== 'object' || answer === null) {
    return;
  }

  const record = answer as Record<string, unknown>;

  // Check for explicit provider status fields injected into decision
  if ('providerState' in record || 'providerStatus' in record) {
    throw new JevError(
      'PROVIDER_IMPERSONATION_DETECTED',
      'Security Violation: Jev answer attempts to declare provider execution state.'
    );
  }

  // Check if score or choice value impersonates provider terminal states
  if (
    typeof record.value === 'string' &&
    FORBIDDEN_PROVIDER_STATUSES.has(record.value.toLowerCase()) &&
    record.type === 'score'
  ) {
    throw new JevError(
      'PROVIDER_IMPERSONATION_DETECTED',
      `Security Violation: Jev score cannot claim provider status '${record.value}'.`
    );
  }
}

export function assertNoModelIdInference(modelId: string, isVerified: boolean): void {
  if (!isVerified && modelId !== 'UNKNOWN') {
    throw new JevError(
      'MODEL_ID_INFERENCE_FORBIDDEN',
      `Model ID inference forbidden: modelId '${modelId}' cannot be assumed or inferred when G1 contract is unverified. Must remain 'UNKNOWN'.`
    );
  }
}

export function sanitizeSecret(text: string, secret?: string): string {
  let cleaned = text;

  if (secret && secret.length > 0) {
    cleaned = cleaned.replaceAll(secret, '[REDACTED]');
  }

  // Sanitize Bearer tokens or sensitive headers
  cleaned = cleaned.replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]');

  return cleaned;
}
