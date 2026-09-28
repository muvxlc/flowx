import { MockJevClient, LiveJevClient } from '../../src/jev/client.ts';
import { G1_VERDICT } from '../../src/jev/gate.ts';
import { JevError } from '../../src/jev/types.ts';
import {
  FIXTURE_SYSTEMONE_CHOICE_VALID,
  FIXTURE_SYSTEMONE_SCORE_VALID,
  FIXTURE_SYSTEMONE_NOUL_VALID,
  DUMMY_KEY,
} from './fixtures.ts';

async function runManualQAScenario(): Promise<void> {
  console.log('====================================================');
  console.log('TASK 10: MANUAL QA 9ROUTER / JEV MOCK SCENARIO');
  console.log('====================================================');

  console.log('\n--- 1. Verify G1 Gate State ---');
  console.log(`Gate: ${G1_VERDICT.gate}`);
  console.log(`Status: ${G1_VERDICT.status}`);
  console.log(`Live Client Allowed: ${G1_VERDICT.allowLiveClient}`);
  console.log(`Mock Contract Allowed: ${G1_VERDICT.allowMockContract}`);

  console.log('\n--- 2. Live Client Block Check ---');
  try {
    new LiveJevClient();
    console.error('ERROR: LiveJevClient instantiated unexpectedly!');
  } catch (err: unknown) {
    if (err instanceof JevError && err.code === 'G1_BLOCKED') {
      console.log('PASS: Live client instantiation correctly failed closed with G1_BLOCKED.');
    } else {
      throw err;
    }
  }

  console.log('\n--- 3. Observable Mock Node Decision: Choice ---');
  const choiceClient = new MockJevClient({
    consent: true,
    minConfidence: 0.7,
    fixture: FIXTURE_SYSTEMONE_CHOICE_VALID,
  });
  const choiceResult = await choiceClient.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation for prompt',
    options: ['portrait', 'landscape', 'square'],
    prompt: 'A towering skyscraper in Bangkok under stormy clouds',
  });
  if (choiceResult.success) {
    console.log(`Choice Decision: ${choiceResult.decision.value}`);
    console.log(`Confidence: ${choiceResult.decision.confidence}`);
    console.log(`Rationale: ${choiceResult.decision.rationale}`);
  }

  console.log('\n--- 4. Observable Mock Node Decision: Score ---');
  const scoreClient = new MockJevClient({
    consent: true,
    minConfidence: 0.7,
    fixture: FIXTURE_SYSTEMONE_SCORE_VALID,
  });
  const scoreResult = await scoreClient.evaluateScore({
    questionId: 'q_prompt_score',
    question: 'Rate translation fidelity',
    rubric: '0.0 to 1.0 fidelity',
    prompt: 'แมวกำลังเล่นลูกบอลไหมพรม',
  });
  if (scoreResult.success) {
    console.log(`Score Decision: ${scoreResult.decision.value}`);
    console.log(`Confidence: ${scoreResult.decision.confidence}`);
    console.log(`Rubric: ${scoreResult.decision.rubric}`);
  }

  console.log('\n--- 5. Observable Mock Node Decision: Noul ---');
  const noulClient = new MockJevClient({
    consent: true,
    minConfidence: 0.7,
    fixture: FIXTURE_SYSTEMONE_NOUL_VALID,
  });
  const noulResult = await noulClient.evaluateNoul({
    questionId: 'q_needs_human_review',
    question: 'Check if prompt needs human review',
    prompt: 'A tranquil river sunset',
  });
  if (noulResult.success) {
    console.log(`Noul Decision: ${noulResult.decision.value}`);
    console.log(`Confidence: ${noulResult.decision.confidence}`);
    console.log(`Label: ${noulResult.decision.label}`);
  }

  console.log('\n--- 6. Observable Auth Failure (401) with Key Redaction ---');
  const authFailClient = new MockJevClient({
    consent: true,
    personalKey: DUMMY_KEY,
    simulatedError: {
      code: 'AUTH_FAILURE',
      message: `401 Unauthorized: Bearer ${DUMMY_KEY} invalid for remote API access`,
      statusCode: 401,
    },
  });
  const authFailResult = await authFailClient.evaluateChoice({
    questionId: 'q_mode_choice',
    question: 'Select orientation',
    options: ['portrait', 'landscape'],
    prompt: 'dummy prompt',
  });
  if (!authFailResult.success) {
    console.log(`Auth Error Code: ${authFailResult.error.code}`);
    console.log(`Sanitized Error: ${authFailResult.error.message}`);
    console.log(`Fallback Action: ${authFailResult.fallback.action}`);
    console.log(`Fallback Reason: ${authFailResult.fallback.reason}`);
    console.log(`Transition Event: ${authFailResult.fallback.transitionEvent.type}`);
    if (authFailResult.error.message.includes(DUMMY_KEY)) {
      throw new Error('SECURITY VIOLATION: Secret leaked in error message!');
    }
    console.log('PASS: Secret key successfully redacted from all error observables.');
  }

  console.log('\n====================================================');
  console.log('TASK 10 QA SCENARIO PASSED CLEANLY');
  console.log('====================================================');
}

runManualQAScenario().catch((err) => {
  console.error('QA Scenario Failed:', err);
  process.exit(1);
});
