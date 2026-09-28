import test from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../../../src/queue/types.ts';
import { renderQueueView } from '../../../src/ui/queue/index.ts';

function createMockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_' + Math.random().toString(36).substring(2, 9),
    media: 'image',
    mode: 'text-only',
    prompt: 'Sample visual prompt',
    provider: 'meta',
    settings: { aspectRatio: '1:1' },
    state: 'pending',
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

test('Jev UI Truthfulness: unreviewed jobs show "not evaluated", no score, and G1 blocked notice', () => {
  const unreviewedJobs: Job[] = [
    createMockJob({ id: 'job_pending_raw', state: 'pending', prompt: 'Sunset beach' }),
    createMockJob({ id: 'job_completed_raw', state: 'completed', prompt: 'City skyline' }),
    createMockJob({ id: 'job_running_raw', state: 'running', prompt: 'Cyberpunk market' }),
  ];

  const html = renderQueueView({ jobs: unreviewedJobs });

  // MUST NOT contain the hardcoded static Jev 94/100 or static choice
  assert.equal(html.includes('94/100'), false, 'Must not contain hardcoded 94/100 score');
  assert.equal(html.includes('photorealistic (94/100)'), false, 'Must not claim static photorealistic (94/100)');

  // All 3 unreviewed jobs must explicitly state 'not evaluated'
  const notEvalMatches = html.match(/not evaluated/gi) ?? [];
  assert.ok(notEvalMatches.length >= 3, 'Every unreviewed job must show "not evaluated"');

  // Must mention G1 blocked
  assert.ok(html.includes('G1 blocked') || html.includes('G1 BLOCKED'), 'Must communicate G1 blocked');

  // Must have accessible screen reader status
  assert.ok(html.includes('aria-label=') && html.toLowerCase().includes('not evaluated'), 'Accessible screen reader status for unreviewed');
});

test('Jev UI Truthfulness: approved mock metadata renders clearly simulated and mock reviewed with G1 blocked', () => {
  const reviewedJobScore = createMockJob({
    id: 'job_mock_score',
    prompt: 'Detailed Thai orchid illustration',
    settings: {
      customParameters: {
        jevGate: {
          status: 'reviewed',
          decision: {
            decisionType: 'score',
            questionId: 'q_prompt_score',
            value: 0.88,
            confidence: 0.95,
          },
          evaluatedAt: 1727500000000,
          modelId: 'UNKNOWN',
        },
      },
    },
  });

  const reviewedJobChoice = createMockJob({
    id: 'job_mock_choice',
    prompt: 'Mountain landscape at sunrise',
    settings: {
      customParameters: {
        jevGate: {
          status: 'reviewed',
          decision: {
            decisionType: 'choice',
            questionId: 'q_mode_choice',
            value: 'cinematic',
            confidence: 0.92,
          },
          evaluatedAt: 1727500000000,
          modelId: 'UNKNOWN',
        },
      },
    },
  });

  const html = renderQueueView({ jobs: [reviewedJobScore, reviewedJobChoice] });

  // Must indicate mock reviewed
  assert.ok(html.toLowerCase().includes('mock reviewed'), 'Must state mock reviewed');

  // Must clearly render simulated
  assert.ok(html.toLowerCase().includes('simulated'), 'Must clearly indicate simulated');

  // Must note G1 blocked
  assert.ok(html.includes('G1 blocked') || html.includes('G1 BLOCKED'), 'Must note G1 blocked');

  // Rendered score should reflect actual decision value (e.g. 88/100 or 0.88), not hardcoded 94/100
  assert.equal(html.includes('94/100'), false, 'Must not claim hardcoded 94/100');
  assert.ok(html.includes('88') || html.includes('0.88'), 'Displays actual mock score 88');
  assert.ok(html.includes('cinematic'), 'Displays actual mock choice value');
});

test('Jev UI Truthfulness: error and low confidence show "needs review" without positive score', () => {
  const lowConfJob = createMockJob({
    id: 'job_low_conf',
    state: 'needs-review',
    prompt: 'Vague blur or video maybe',
    error: 'Low confidence: 0.42 < 0.70',
    settings: {
      customParameters: {
        jevGate: {
          status: 'needs-review',
          fallbackType: 'low_confidence',
          reason: 'Low confidence evaluation',
        },
      },
    },
  });

  const errorJob = createMockJob({
    id: 'job_gate_error',
    state: 'needs-review',
    prompt: 'Malformed input',
    error: 'Jev decision failed [AUTH_FAILURE]: 401 Unauthorized',
  });

  const html = renderQueueView({ jobs: [lowConfJob, errorJob] });

  // Both must indicate needs review
  const needsReviewMatches = html.match(/needs review/gi) ?? [];
  assert.ok(needsReviewMatches.length >= 2, 'Must display "needs review" for both jobs');

  // Must NOT show positive score like 94/100
  assert.equal(html.includes('94/100'), false, 'Must not show fake positive score 94/100');
  assert.ok(html.includes('G1 blocked') || html.includes('G1 BLOCKED'), 'Must communicate G1 blocked');
});

test('Jev UI Truthfulness: XSS escapes Thai content, errors, and screen reader attributes', () => {
  const maliciousThaiJob = createMockJob({
    id: 'job_thai_xss',
    state: 'needs-review',
    prompt: 'ภาพวาดวัดอรุณราชวราราม <script>alert("xss")</script> "test\'&',
    error: 'ข้อผิดพลาดความกำกึ่ง <img src=x onerror=alert(1)>',
    settings: {
      customParameters: {
        jevGate: {
          status: 'needs-review',
          fallbackType: 'thai_ambiguity',
          reason: 'ข้อความภาษาไทยกำกึ่ง <svg onload=alert(2)>',
        },
      },
    },
  });

  const html = renderQueueView({
    jobs: [maliciousThaiJob],
    inspectingJobId: 'job_thai_xss',
  });

  // Verify Thai characters preserved
  assert.ok(html.includes('ภาพวาดวัดอรุณราชวราราม'), 'Thai prompt content preserved');

  // Verify XSS tags are strictly escaped
  assert.equal(html.includes('<script>'), false, 'Must escape <script>');
  assert.ok(html.includes('&lt;script&gt;'), 'Must have escaped &lt;script&gt;');
  assert.equal(html.includes('<img src=x'), false, 'Must escape <img');
  assert.ok(html.includes('&lt;img'), 'Must have escaped &lt;img');
  assert.equal(html.includes('<svg onload='), false, 'Must escape <svg');
  assert.ok(html.includes('&lt;svg'), 'Must have escaped &lt;svg');

  // Screen reader attributes must be valid and escaped
  assert.ok(html.includes('aria-label='), 'Has screen reader aria-label');
  assert.ok(html.toLowerCase().includes('needs review'), 'Screen reader includes truthful needs review status');
});
