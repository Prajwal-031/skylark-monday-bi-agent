import test from 'node:test';
import assert from 'node:assert/strict';
import { openPipeline } from '../src/analytics.js';

const board = { name: 'Deals', retrievedAt: '2026-09-19T00:00:00Z', items: [
  { id: '1', name: 'A', column_values: [{ id: 'amount', text: '100' }, { id: 'stage', text: 'Open' }, { id: 'sector', text: ' ENERGY ' }, { id: 'close', text: '2026-09-20' }] },
  { id: '2', name: 'B', column_values: [{ id: 'amount', text: '' }, { id: 'stage', text: 'Open' }, { id: 'sector', text: 'Energy' }, { id: 'close', text: '2026-09-22' }] },
  { id: '3', name: 'C', column_values: [{ id: 'amount', text: '99' }, { id: 'stage', text: 'Won' }, { id: 'sector', text: 'Energy' }, { id: 'close', text: '2026-09-20' }] }
] };
const map = { fields: { amount: 'amount', stage: 'stage', sector: 'sector', close_date: 'close' }, ambiguity: {} };
test('open pipeline is deterministic and surfaces missing amount', () => { const r = openPipeline(board, map, { sector: 'Energy', now: new Date('2026-09-19T00:00:00Z') }); assert.equal(r.value, 100); assert.equal(r.status, 'SUPPORTED_WITH_CAVEATS'); assert.equal(r.data_quality.missing_amount, 1); });
