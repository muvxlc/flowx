import { JevError } from './types.ts';

export const G1_VERDICT = {
  gate: 'G1',
  status: 'BLOCKED',
  verdictDate: '2026-09-28',
  reason:
    '9router /v1/systemone enforces remote edge auth, route is unmapped in upstream 9router, verified model ID is UNKNOWN, and preflight CORS is absent.',
  allowLiveClient: false,
  allowMockContract: true,
} as const;

export function isLiveJevPermitted(): boolean {
  return G1_VERDICT.allowLiveClient;
}

export function assertLiveJevPermitted(): never {
  throw new JevError(
    'G1_BLOCKED',
    'Gate G1 BLOCKED: Live 9router Jev calls are prohibited pending verified endpoint contract and authorized credentials.'
  );
}
