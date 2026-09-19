import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizePipelineAnswer } from '../src/query.js';

const result = (metric, value, included_records, extra = {}) => ({ status: 'SUPPORTED', metric, value, included_records, data_quality: {}, ...extra });

test('pipeline synthesis gives one founder-readable answer from structured evidence', () => {
  const response = synthesizePipelineAnswer({
    pipeline: result('open_pipeline', 688200000, 47),
    stage: result('pipeline_by_stage', { Proposal: 300000000, Negotiation: 200000000 }),
    sector: result('pipeline_by_sector', { Tender: { value: 532000000 }, Railways: { value: 52000000 } }),
    risk: result('risky_deals', [{ amount: 18400000 }], 1),
    won: result('won_revenue', 95000000, 64)
  });
  assert.match(response.direct_answer, /₹68\.82 Cr/);
  assert.match(response.direct_answer, /47 deals/);
  assert.match(response.direct_answer, /₹9\.50 Cr/);
  assert.ok(response.key_numbers.every(item => !item.includes('open_pipeline')));
  assert.equal(response.key_numbers.length, 4);
  assert.match(response.observations[0], /Proposal/);
});
