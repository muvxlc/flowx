/**
 * Test fixtures for Task 10: 9router / Jev System One Mock Contract.
 * Conforms to G1 findings: contract fixtures only, no real keys, dummy_secret only.
 */

export const DUMMY_KEY = 'dummy_secret_key_12345';

// Valid System One fixture: choice
export const FIXTURE_SYSTEMONE_CHOICE_VALID = {
  model: 'UNKNOWN',
  state: 'Queue job needs classification: portrait vs landscape',
  answers: {
    'q_mode_choice': {
      type: 'choice',
      value: 'portrait',
      confidence: 0.94,
      rationale: 'Aspect ratio 9:16 indicates portrait orientation',
    },
  },
  usage: {
    inputTokens: 38,
    outputTokens: 12,
  },
};

// Valid System One fixture: score
export const FIXTURE_SYSTEMONE_SCORE_VALID = {
  model: 'UNKNOWN',
  state: 'Evaluate prompt quality for Thai translation fidelity',
  answers: {
    'q_prompt_score': {
      type: 'score',
      value: 0.88,
      confidence: 0.91,
      rubric: 'Fidelity to user intent on 0.0-1.0 scale',
    },
  },
  usage: {
    inputTokens: 45,
    outputTokens: 10,
  },
};

// Valid System One fixture: noul (binary / boolean filter condition)
export const FIXTURE_SYSTEMONE_NOUL_VALID = {
  model: 'UNKNOWN',
  state: 'Check if prompt contains disallowed keywords or sensitive themes',
  answers: {
    'q_needs_human_review': {
      type: 'noul',
      value: false,
      confidence: 0.97,
      label: 'safe_to_queue',
    },
  },
  usage: {
    inputTokens: 30,
    outputTokens: 8,
  },
};

// Low confidence fixture (< 0.70 threshold)
export const FIXTURE_SYSTEMONE_LOW_CONFIDENCE = {
  model: 'UNKNOWN',
  state: 'Ambiguous prompt routing',
  answers: {
    'q_mode_choice': {
      type: 'choice',
      value: 'video',
      confidence: 0.42,
      rationale: 'Uncertain whether motion is requested',
    },
  },
};

// Malformed fixtures
export const FIXTURE_MALFORMED_NON_OBJECT = 'not valid json string or object';
export const FIXTURE_MALFORMED_MISSING_ANSWERS = {
  model: 'UNKNOWN',
  usage: {},
};
export const FIXTURE_MALFORMED_INVALID_TYPE = {
  answers: {
    'q1': {
      type: 'unsupported_type_xyz',
      value: 'foo',
      confidence: 0.9,
    },
  },
};
export const FIXTURE_MALFORMED_MISSING_CONFIDENCE = {
  answers: {
    'q1': {
      type: 'choice',
      value: 'image',
    },
  },
};

// 401 Unauthorized fixture from 9router dashboardGuard
export const FIXTURE_9ROUTER_401_RESPONSE = {
  status: 401,
  body: {
    error: 'API key required for remote API access',
  },
};

// 429 Rate Limit fixture
export const FIXTURE_9ROUTER_429_RESPONSE = {
  status: 429,
  body: {
    error: 'Rate limit exceeded: 60 requests per minute',
  },
};

// Provider status impersonation attempt fixture
export const FIXTURE_IMPERSONATING_PROVIDER_STATUS = {
  answers: {
    'q_status': {
      type: 'score',
      value: 'completed', // Score attempting to claim provider job state 'completed'
      confidence: 0.99,
      providerState: 'completed',
    },
  },
};
