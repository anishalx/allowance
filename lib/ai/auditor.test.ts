import { describe, expect, it } from 'vitest';
import { applyAudit } from './auditor';

describe('applyAudit', () => {
  it('never loosens the engine decision', () => {
    expect(applyAudit('deny', { verdict: 'consistent', riskScore: 0 }).decision).toBe('deny');
    expect(applyAudit('require_approval', { verdict: 'consistent', riskScore: 5 }).decision).toBe('require_approval');
  });

  it('escalates allow to approval when suspicious', () => {
    expect(applyAudit('allow', { verdict: 'suspicious', riskScore: 40 })).toEqual({ decision: 'require_approval', escalated: true });
  });

  it('escalates to deny when malicious or very high risk', () => {
    expect(applyAudit('allow', { verdict: 'malicious', riskScore: 30 }).decision).toBe('deny');
    expect(applyAudit('require_approval', { verdict: 'suspicious', riskScore: 85 }).decision).toBe('deny');
  });

  it('treats a high score as suspicious even if the label says consistent', () => {
    expect(applyAudit('allow', { verdict: 'consistent', riskScore: 60 }).decision).toBe('require_approval');
  });

  it('leaves consistent low-risk purchases alone', () => {
    expect(applyAudit('allow', { verdict: 'consistent', riskScore: 10 })).toEqual({ decision: 'allow', escalated: false });
  });
});
