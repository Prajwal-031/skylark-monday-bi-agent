import test from 'node:test';
import assert from 'node:assert/strict';
import { openPipeline } from '../src/analytics.js';

test('uses an explicit status before a detailed non-standard stage', () => {
  const board = { name: 'Deals', retrievedAt: '2026-09-19T00:00:00Z', items: [{ id: '1', name: 'Deal', column_values: [{ id: 'amount', text: '250' }, { id: 'status', text: 'Open' }, { id: 'stage', text: 'B. Sales Qualified Leads' }] }] };
  const result = openPipeline(board, { fields: { amount: 'amount', status: 'status', stage: 'stage' }, ambiguity: {} });
  assert.equal(result.value, 250);
  assert.equal(result.included_records, 1);
});
