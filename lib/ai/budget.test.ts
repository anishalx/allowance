import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USER_ID } from '../db/seed';
import { spendAi } from './budget';

describe('public demo AI budget', () => {
  beforeEach(() => {
    process.env.PUBLIC_DEMO = '1';
    process.env.AI_UNITS_PER_VISITOR = '25';
    process.env.AI_UNITS_PER_DAY = '40';
    (globalThis as { __allowanceAiBudget?: unknown }).__allowanceAiBudget = undefined;
  });
  afterEach(() => {
    delete process.env.PUBLIC_DEMO;
    delete process.env.AI_UNITS_PER_VISITOR;
    delete process.env.AI_UNITS_PER_DAY;
  });

  it('caps each visitor', () => {
    expect(spendAi('u_v_a', 'agentRun')).toBeNull();
    expect(spendAi('u_v_a', 'agentRun')).toBeNull();
    expect(spendAi('u_v_a', 'agentRun')).toMatch(/Your demo has used/);
    expect(spendAi('u_v_a', 'audit')).toBeNull(); // 21 of 25 used
  });

  it('caps the whole demo, but never the owner', () => {
    spendAi('u_v_a', 'agentRun');
    spendAi('u_v_a', 'agentRun');
    spendAi('u_v_b', 'agentRun');
    expect(spendAi('u_v_c', 'agentRun')).toBeNull(); // 40 of 40
    expect(spendAi('u_v_d', 'compile')).toMatch(/live demo has used/);
    expect(spendAi(DEMO_USER_ID, 'agentRun')).toBeNull();
  });

  it('is off outside the public demo', () => {
    delete process.env.PUBLIC_DEMO;
    for (let i = 0; i < 10; i++) expect(spendAi('u_v_a', 'agentRun')).toBeNull();
  });
});
