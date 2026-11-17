import { describe, expect, it } from 'vitest';
import { generateScenario, reconcile, toMicro, auditSeal } from './engine';

describe('integer reconciliation engine', () => {
  it('balances every built-in scenario without an unexplained plug', () => {
    for (const kind of ['default', 'stress', 'clean'] as const) {
      const result = reconcile(generateScenario(kind));
      expect(result.unexplainedMicro, kind).toBe(0n);
      expect(result.integrityFault, kind).toBe(false);
    }
  });
  it('detects the five next-month settlements', () => expect(reconcile(generateScenario('default')).anomalies.filter(item => item.status === 'NEXT_MONTH_SETTLEMENT')).toHaveLength(5));
  it('aggregates twenty four-decimal rounding drifts into $0.08', () => {
    const result = reconcile(generateScenario('default'));
    expect(result.roundingRows).toHaveLength(20);
    expect(result.roundingRows.reduce((sum, row) => sum + row.differenceMicro, 0n)).toBe(-800n);
  });
  it('detects one platform duplicate and two bank duplicates', () => expect(reconcile(generateScenario('default')).anomalies.filter(item => item.status === 'DUPLICATE_PLATFORM' || item.status === 'DUPLICATE_BANK')).toHaveLength(3));
  it('detects orphan refunds and the bank fee independently', () => {
    const statuses = reconcile(generateScenario('default')).anomalies.map(item => item.status);
    expect(statuses.filter(status => status === 'ORPHAN_REFUND')).toHaveLength(2);
    expect(statuses.filter(status => status === 'BANK_FEE_CHARGEBACK')).toHaveLength(1);
  });
  it('negative control exposes exactly $50.00', () => expect(reconcile(generateScenario('clean'), { injectUnexplained: true }).unexplainedMicro).toBe(toMicro('50.0000')));
  it('produces a deterministic seal for identical input', async () => {
    const first = await auditSeal(reconcile(generateScenario('clean')));
    const second = await auditSeal(reconcile(generateScenario('clean')));
    expect(first).toBe(second);
  });
});
