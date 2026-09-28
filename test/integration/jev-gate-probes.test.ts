import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JevGate,
  type JevGateConfig,
  DEFAULT_JEV_GATE_RUBRIC,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from '../../src/integration/jev-gate.ts';
import { createJob } from '../../src/queue/state.ts';
import { MockJevClient } from '../../src/jev/client.ts';
import { JevError } from '../../src/jev/types.ts';
import {
  FIXTURE_SYSTEMONE_SCORE_VALID,
  FIXTURE_IMPERSONATING_PROVIDER_STATUS,
  DUMMY_KEY,
} from '../jev/fixtures.ts';

const BASE_CONFIG: JevGateConfig = {
  enabled: true,
  consent: true,
  modelId: 'UNKNOWN',
  minConfidence: DEFAULT_CONFIDENCE_THRESHOLD,
  scoreThreshold: DEFAULT_SCORE_THRESHOLD,
  rubric: DEFAULT_JEV_GATE_RUBRIC,
};

test('Probe: Gate G1 live network call is strictly BLOCKED', () => {
  assert.throws(
    () => new JevGate({ ...BASE_CONFIG, live: true }),
    (err: unknown) => {
      assert.ok(err instanceof JevError);
      assert.equal(err.code, 'G1_BLOCKED');
      return true;
    }
  );
});

test('Probe: Model ID inference is forbidden when unverified', () => {
  assert.throws(
    () => new JevGate({ ...BASE_CONFIG, modelId: 'jev-latest' }),
    (err: unknown) => {
      assert.ok(err instanceof JevError);
      assert.equal(err.code, 'MODEL_ID_INFERENCE_FORBIDDEN');
      return true;
    }
  );
});

test('Probe: Zero live network fetches executed', async () => {
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCount++;
    throw new Error('ROGUE_FETCH_BLOCKED');
  }) as typeof fetch;

  try {
    const gate = new JevGate(BASE_CONFIG);
    const job = createJob({ prompt: 'A cinematic drone shot over foggy pine forest' });
    const client = new MockJevClient({
      consent: true,
      fixture: FIXTURE_SYSTEMONE_SCORE_VALID,
    });

    const result = await gate.evaluateJob(job, client, {
      type: 'score',
      questionId: 'q_prompt_score',
    });

    assert.equal(result.status, 'reviewed');
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Probe: 401 Auth failure and timeout route human with secret redaction', async () => {
  const gate = new JevGate({ ...BASE_CONFIG, personalKey: DUMMY_KEY });

  const job401 = createJob({ prompt: 'Unauthorized prompt evaluation' });
  const client401 = new MockJevClient({
    consent: true,
    personalKey: DUMMY_KEY,
    simulatedError: {
      code: 'AUTH_FAILURE',
      message: `Invalid Bearer ${DUMMY_KEY} for 9router`,
      statusCode: 401,
    },
  });
  const res401 = await gate.evaluateJob(job401, client401, {
    type: 'score',
    questionId: 'q_prompt_score',
  });
  assert.equal(res401.status, 'needs-review');
  assert.equal(res401.job.state, 'needs-review');
  assert.ok(!res401.reason?.includes(DUMMY_KEY));
  assert.ok(res401.reason?.includes('[REDACTED]'));

  const clientTimeout = new MockJevClient({
    consent: true,
    simulatedError: {
      code: 'TIMEOUT',
      message: 'Decision call timed out after 5000ms',
    },
  });
  const resTimeout = await gate.evaluateJob(job401, clientTimeout, {
    type: 'score',
    questionId: 'q_prompt_score',
  });
  assert.equal(resTimeout.status, 'needs-review');
  assert.equal(resTimeout.job.state, 'needs-review');
});

test('Probe: Thai redacted fixture evaluation measures accuracy and routes ambiguity to human', async () => {
  const gate = new JevGate(BASE_CONFIG);

  const thaiFixtures = [
    {
      id: 'TH-01-CLEAR',
      prompt: 'ภาพวาดสีน้ำมันทิวทัศน์ทุ่งนาพระอาทิตย์ตก แสงอบอุ่น สไตล์คลาสสิก',
      clientFixture: { answers: { q_thai: { type: 'score', value: 0.92, confidence: 0.95 } } },
      expectedStatus: 'reviewed',
    },
    {
      id: 'TH-02-CLEAR',
      prompt: 'วิดีโออนิเมชันแมวเล่นลูกบอลกลางสายฝน มุมกล้องระดับสายตา 4k',
      clientFixture: { answers: { q_thai: { type: 'score', value: 0.89, confidence: 0.91 } } },
      expectedStatus: 'reviewed',
    },
    {
      id: 'TH-03-AMBIGUOUS-MODAL',
      prompt: 'รูปหรือวิดีโอก็ได้ ไม่แน่ใจ ลองดูให้หน่อย เอาอะไรก็ได้',
      clientFixture: { answers: { q_thai: { type: 'score', value: 0.55, confidence: 0.50 } } },
      expectedStatus: 'needs-review',
    },
    {
      id: 'TH-04-AMBIGUOUS-PARTICLE',
      prompt: 'ภาพวิวอาจจะสวย หรือเปล่า แล้วแต่เลย',
      clientFixture: { answers: { q_thai: { type: 'score', value: 0.60, confidence: 0.62 } } },
      expectedStatus: 'needs-review',
    },
    {
      id: 'TH-05-LOW-CONFIDENCE',
      prompt: 'แบบก้ำกึ่ง ไม่รู้จะบรรยายยังไงดี',
      clientFixture: { answers: { q_thai: { type: 'score', value: 0.40, confidence: 0.45 } } },
      expectedStatus: 'needs-review',
    },
  ];

  let correctCount = 0;
  for (const item of thaiFixtures) {
    const job = createJob({ prompt: item.prompt });
    const client = new MockJevClient({
      consent: true,
      fixture: item.clientFixture,
    });

    const res = await gate.evaluateJob(job, client, {
      type: 'score',
      questionId: 'q_thai',
    });

    assert.equal(res.status, item.expectedStatus);
    assert.equal(res.job.state, item.expectedStatus === 'reviewed' ? 'pending' : 'needs-review');
    correctCount++;
  }

  const accuracy = (correctCount / thaiFixtures.length) * 100;
  assert.equal(accuracy, 100);
});

test('Probe: Provider status spoofing is strictly prevented and routes to needs-review', async () => {
  const gate = new JevGate(BASE_CONFIG);
  const job = createJob({ prompt: 'Attempting to inject provider terminal status' });

  const clientImpersonating = new MockJevClient({
    consent: true,
    fixture: FIXTURE_IMPERSONATING_PROVIDER_STATUS,
  });

  const res = await gate.evaluateJob(job, clientImpersonating, {
    type: 'score',
    questionId: 'q_status',
  });

  assert.equal(res.status, 'needs-review');
  assert.equal(res.job.state, 'needs-review');
  assert.notEqual(res.job.state, 'completed');
  assert.notEqual(res.job.state, 'running');
  assert.ok(res.reason?.includes('PROVIDER_IMPERSONATION_DETECTED'));
});
