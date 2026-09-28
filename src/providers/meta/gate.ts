export const G0_VERDICT = {
  gate: 'G0',
  status: 'BLOCKED',
  verdictDate: '2026-09-28',
  reason:
    'Meta Terms of Service (3.2.3) and Automated Data Collection Terms require express prior written permission. No authorization or test credentials exist.',
  allowLiveAutomation: false,
  allowMockAdapter: true,
} as const;

export function isLiveAllowed(): boolean {
  return G0_VERDICT.allowLiveAutomation;
}

export function assertLivePermitted(): never {
  throw new Error(
    `Gate G0 BLOCKED: Live Meta AI automation is strictly forbidden under Meta Terms of Service (Section 3.2.3). Only typed mock adapter is permitted.`
  );
}
