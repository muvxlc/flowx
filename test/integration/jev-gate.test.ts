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
import { QueueManager } from '../../src/queue/queue.ts';
import { MockJevClient } from '../../src/jev/client.ts';
import {
  FIXTURE_SYSTEMONE_CHOICE_VALID,
  FIXTURE_SYSTEMONE_SCORE_VALID,
  FIXTURE_SYSTEMONE_NOUL_VALID,
  FIXTURE_SYSTEMONE_LOW_CONFIDENCE,
  FIXTURE_MALFORMED_NON_OBJECT,
} from '../jev/fixtures.ts';

const BASE_CONFIG: JevGateConfig = {
  enabled: true,
  consent: true,
  modelId: 'UNKNOWN',
  minConfidence: DEFAULT_CONFIDENCE_THRESHOLD,
  scoreThreshold: DEFAULT_SCORE_THRESHOLD,
  rubric: DEFAULT_JEV_GATE_RUBRIC,
};

test('JevGate: Disabled Jev routes to deterministic fallback', async () => {
  const gate = new JevGate({ ...BASE_CONFIG, enabled: false });

  const validJob = createJob({ prompt: 'Sunset beach with calm ocean waves' });
  const validResult = await gate.evaluateJob(validJob);
  assert.equal(validResult.status, 'reviewed');
  assert.equal(validResult.isFallback, true);
  assert.equal(validResult.fallbackType, 'disabled_deterministic');
  assert.equal(validResult.job.state, 'pending');

  const blankJob = createJob({ prompt: '   ' });
  const blankResult = await gate.evaluateJob(blankJob);
  assert.equal(blankResult.status, 'needs-review');
  assert.equal(blankResult.isFallback, true);
  assert.equal(blankResult.job.state, 'needs-review');
  assert.ok(blankResult.reason?.includes('Empty prompt'));
});

test('JevGate: Consent denied routes human to needs-review', async () => {
  const gate = new JevGate({ ...BASE_CONFIG, consent: false });
  const job = createJob({ prompt: 'Studio portrait of a cybernetic cat' });
  const client = new MockJevClient({
    consent: false,
    fixture: FIXTURE_SYSTEMONE_SCORE_VALID,
  });

  const result = await gate.evaluateJob(job, client, {
    type: 'score',
    questionId: 'q_prompt_score',
  });

  assert.equal(result.status, 'needs-review');
  assert.equal(result.isFallback, true);
  assert.equal(result.fallbackType, 'consent_denied');
  assert.equal(result.job.state, 'needs-review');
  assert.ok(result.reason?.includes('Consent'));
});

test('JevGate: Consented typed score decision maps to reviewed or needs-review', async () => {
  const gate = new JevGate(BASE_CONFIG);

  const jobHigh = createJob({ prompt: 'Detailed botanical illustration of orchid' });
  const clientHigh = new MockJevClient({
    consent: true,
    fixture: FIXTURE_SYSTEMONE_SCORE_VALID,
  });
  const resHigh = await gate.evaluateJob(jobHigh, clientHigh, {
    type: 'score',
    questionId: 'q_prompt_score',
  });
  assert.equal(resHigh.status, 'reviewed');
  assert.equal(resHigh.job.state, 'pending');
  assert.equal(resHigh.decision?.value, 0.88);

  const jobLow = createJob({ prompt: 'Vague blur' });
  const clientLow = new MockJevClient({
    consent: true,
    fixture: {
      answers: {
        q_score: { type: 'score', value: 0.45, confidence: 0.95 },
      },
    },
  });
  const resLow = await gate.evaluateJob(jobLow, clientLow, {
    type: 'score',
    questionId: 'q_score',
  });
  assert.equal(resLow.status, 'needs-review');
  assert.equal(resLow.job.state, 'needs-review');
  assert.equal(resLow.isFallback, true);
  assert.equal(resLow.fallbackType, 'low_score');
});

test('JevGate: Consented typed noul and choice decisions map cleanly', async () => {
  const gate = new JevGate(BASE_CONFIG);

  const jobChoice = createJob({ prompt: 'Portrait shot of mountain guide' });
  const clientChoice = new MockJevClient({
    consent: true,
    fixture: FIXTURE_SYSTEMONE_CHOICE_VALID,
  });
  const resChoice = await gate.evaluateJob(jobChoice, clientChoice, {
    type: 'choice',
    questionId: 'q_mode_choice',
    options: ['portrait', 'landscape'],
  });
  assert.equal(resChoice.status, 'reviewed');
  assert.equal(resChoice.decision?.value, 'portrait');

  const jobNoul = createJob({ prompt: 'Clean studio photo' });
  const clientNoul = new MockJevClient({
    consent: true,
    fixture: FIXTURE_SYSTEMONE_NOUL_VALID,
  });
  const resNoul = await gate.evaluateJob(jobNoul, clientNoul, {
    type: 'noul',
    questionId: 'q_needs_human_review',
  });
  assert.equal(resNoul.status, 'reviewed');

  const clientNoulFlagged = new MockJevClient({
    consent: true,
    fixture: {
      answers: {
        q_flag: { type: 'noul', value: true, confidence: 0.95, label: 'unsafe' },
      },
    },
  });
  const resNoulFlagged = await gate.evaluateJob(jobNoul, clientNoulFlagged, {
    type: 'noul',
    questionId: 'q_flag',
  });
  assert.equal(resNoulFlagged.status, 'needs-review');
  assert.equal(resNoulFlagged.job.state, 'needs-review');
});

test('JevGate: Low confidence and malformed response route human to needs-review', async () => {
  const gate = new JevGate(BASE_CONFIG);

  const jobLowConf = createJob({ prompt: 'Ambiguous prompt' });
  const clientLowConf = new MockJevClient({
    consent: true,
    fixture: FIXTURE_SYSTEMONE_LOW_CONFIDENCE,
  });
  const resLowConf = await gate.evaluateJob(jobLowConf, clientLowConf, {
    type: 'choice',
    questionId: 'q_mode_choice',
    options: ['video', 'image'],
  });
  assert.equal(resLowConf.status, 'needs-review');
  assert.equal(resLowConf.job.state, 'needs-review');
  assert.equal(resLowConf.isFallback, true);

  const jobMalformed = createJob({ prompt: 'Malformed test' });
  const clientMalformed = new MockJevClient({
    consent: true,
    fixture: FIXTURE_MALFORMED_NON_OBJECT,
  });
  const resMalformed = await gate.evaluateJob(jobMalformed, clientMalformed, {
    type: 'choice',
    questionId: 'q_test',
    options: ['a', 'b'],
  });
  assert.equal(resMalformed.status, 'needs-review');
  assert.equal(resMalformed.job.state, 'needs-review');
});

test('JevGate: QueueManager integration routes unreviewed jobs to human before execution', async () => {
  const gate = new JevGate(BASE_CONFIG);
  const queue = new QueueManager();

  const job1 = createJob({ prompt: 'High quality reviewed prompt' });
  const job2 = createJob({ prompt: 'Ambiguous prompt needing human review' });

  const client1 = new MockJevClient({
    consent: true,
    fixture: FIXTURE_SYSTEMONE_SCORE_VALID,
  });
  const client2 = new MockJevClient({
    consent: true,
    fixture: FIXTURE_SYSTEMONE_LOW_CONFIDENCE,
  });

  const res1 = await gate.evaluateJob(job1, client1, {
    type: 'score',
    questionId: 'q_prompt_score',
  });
  const res2 = await gate.evaluateJob(job2, client2, {
    type: 'choice',
    questionId: 'q_mode_choice',
  });

  queue.addJob(res1.job);
  queue.addJob(res2.job);

  const status = queue.getQueueStatus();
  assert.equal(status.pending, 1);
  assert.equal(status.needsReview, 1);
  assert.equal(status.completed, 0);
});
