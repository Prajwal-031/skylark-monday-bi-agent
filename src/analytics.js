import { canonicalLabel, parseAmount, parseDate } from './normalization.js';

const OPEN = new Set(['open', 'new', 'qualified', 'proposal', 'negotiation', 'in progress', 'working on it', 'active', 'on hold']);
const WON = new Set(['won', 'closed won', 'complete', 'completed']);
const LOST = new Set(['lost', 'closed lost', 'cancelled', 'canceled']);
const valueOf = (item, columnId) => item.column_values.find((value) => value.id === columnId)?.text ?? null;
// A dedicated monday status column is generally the board's operational state;
// use it before a more granular stage field. Fall back to stage only when absent.
const statusOf = (item, map) => canonicalLabel(valueOf(item, map.fields.status) || valueOf(item, map.fields.stage));
const iso = (date) => date ? date.toISOString().slice(0, 10) : null;
const currentQuarter = (now) => ({ start: new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)), end: new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 + 3, 0, 23, 59, 59)) });

function baseResult(metric, retrievedAt) {
  return { status: 'SUPPORTED', metric, value: null, included_records: 0, excluded_records: 0, filters: {}, definition: '', data_quality: { missing_amount: 0, invalid_date: 0, missing_sector: 0, ambiguous_schema: 0 }, retrieved_at: retrievedAt, provenance: {} };
}

export function openPipeline(board, map, { sector = null, thisQuarter = false, now = new Date() } = {}) {
  const result = baseResult('open_pipeline', board.retrievedAt);
  result.definition = 'Sum of amounts for records with an explicitly recognized open stage/status.';
  result.provenance = { source_board: board.name, schema: map.fields };
  if (!map.fields.amount || (!map.fields.stage && !map.fields.status)) return { ...result, status: 'UNSUPPORTED', explanation: 'Amount and an unambiguous stage or status column are required.' };
  if (map.ambiguity.amount || map.ambiguity.stage || map.ambiguity.status) return { ...result, status: 'INSUFFICIENT_DATA', explanation: 'The board schema has ambiguous metric columns.', data_quality: { ...result.data_quality, ambiguous_schema: 1 } };
  const quarter = currentQuarter(now);
  let total = 0;
  for (const item of board.items) {
    const label = statusOf(item, map)?.toLowerCase();
    if (!OPEN.has(label)) continue;
    const itemSector = canonicalLabel(valueOf(item, map.fields.sector));
    if (sector && itemSector?.toLowerCase() !== sector.toLowerCase()) continue;
    if (sector && !itemSector) { result.excluded_records++; result.data_quality.missing_sector++; continue; }
    if (thisQuarter) {
      if (!map.fields.close_date) return { ...result, status: 'UNSUPPORTED', explanation: 'A close-date column is required for a current-quarter filter.' };
      const date = parseDate(valueOf(item, map.fields.close_date));
      if (!date) { result.excluded_records++; result.data_quality.invalid_date++; continue; }
      if (date < quarter.start || date > quarter.end) continue;
    }
    const amount = parseAmount(valueOf(item, map.fields.amount));
    if (amount === null) { result.excluded_records++; result.data_quality.missing_amount++; continue; }
    total += amount; result.included_records++;
  }
  result.value = total;
  result.filters = { sector, period: thisQuarter ? `${iso(quarter.start)}..${iso(quarter.end)}` : null };
  if (!total && !result.included_records && thisQuarter) result.explanation = `No recognized open deals with a valid close date fall within ${iso(quarter.start)} to ${iso(quarter.end)}.`;
  if (result.excluded_records) result.status = 'SUPPORTED_WITH_CAVEATS';
  return result;
}

export function pipelineBySector(board, map, options = {}) {
  const base = openPipeline(board, map, options);
  if (!['SUPPORTED', 'SUPPORTED_WITH_CAVEATS'].includes(base.status)) return base;
  if (!map.fields.sector) return { ...base, status: 'UNSUPPORTED', explanation: 'A sector column is required.' };
  const groups = new Map();
  for (const sector of new Set(board.items.map((item) => canonicalLabel(valueOf(item, map.fields.sector))).filter(Boolean))) {
    const result = openPipeline(board, map, { ...options, sector });
    if (result.value || result.included_records || result.excluded_records) groups.set(sector, { value: result.value, included_records: result.included_records, excluded_records: result.excluded_records });
  }
  return { ...base, metric: 'pipeline_by_sector', value: Object.fromEntries([...groups].sort((a, b) => b[1].value - a[1].value)) };
}

export function pipelineByStage(board, map) {
  const base = openPipeline(board, map);
  if (!['SUPPORTED', 'SUPPORTED_WITH_CAVEATS'].includes(base.status)) return base;
  if (!map.fields.stage) return { ...base, status: 'UNSUPPORTED', explanation: 'A deal-stage column is required.' };
  const groups = new Map();
  for (const item of board.items) {
    const state = statusOf(item, map)?.toLowerCase();
    if (!OPEN.has(state)) continue;
    const amount = parseAmount(valueOf(item, map.fields.amount));
    if (amount === null) continue;
    const stage = canonicalLabel(valueOf(item, map.fields.stage)) || 'Unspecified stage';
    groups.set(stage, (groups.get(stage) || 0) + amount);
  }
  return { ...base, metric: 'pipeline_by_stage', value: Object.fromEntries([...groups].sort((a, b) => b[1] - a[1])) };
}

export function wonRevenue(board, map) {
  const result = baseResult('won_revenue', board.retrievedAt);
  result.definition = 'Sum of deal amounts where the monday.com status is Won.';
  if (!map.fields.amount || !map.fields.status) return { ...result, status: 'UNSUPPORTED', explanation: 'Amount and status are required.' };
  for (const item of board.items) {
    if (statusOf(item, map)?.toLowerCase() !== 'won') continue;
    const amount = parseAmount(valueOf(item, map.fields.amount));
    if (amount === null) { result.excluded_records++; result.data_quality.missing_amount++; continue; }
    result.value = (result.value || 0) + amount; result.included_records++;
  }
  result.value ||= 0; result.provenance = { source_board: board.name, schema: map.fields };
  if (result.excluded_records) result.status = 'SUPPORTED_WITH_CAVEATS';
  return result;
}

export function workOrderOverview(board, map, { mode = 'active', now = new Date() } = {}) {
  const result = baseResult(`${mode}_work_orders`, board.retrievedAt);
  result.definition = mode === 'delayed' ? 'Work orders not marked completed whose probable end date is before today.' : mode === 'active' ? 'Count of work orders with an in-progress execution status: Ongoing, Working on it, Partial Completed, or Executed until current month.' : `Count of work orders marked ${mode}.`;
  if (!map.fields.status) return { ...result, status: 'UNSUPPORTED', explanation: 'A work-order status column is required.' };
  const completed = new Set(['completed', 'done']);
  const active = new Set(['ongoing', 'working on it', 'partial completed', 'executed until current month']);
  const records = [];
  for (const item of board.items) {
    const status = canonicalLabel(valueOf(item, map.fields.status))?.toLowerCase();
    let include = mode === 'completed' ? completed.has(status) : active.has(status);
    if (mode === 'delayed') {
      if (!map.fields.completion_date) return { ...result, status: 'UNSUPPORTED', explanation: 'A probable end-date column is required to identify delayed work orders.' };
      const end = parseDate(valueOf(item, map.fields.completion_date));
      include = !completed.has(status) && Boolean(end && end < now);
      if (!end) result.data_quality.invalid_date++;
    }
    if (include) records.push({ id: item.id, name: item.name, status: canonicalLabel(valueOf(item, map.fields.status)), sector: canonicalLabel(valueOf(item, map.fields.sector)), probable_end_date: map.fields.completion_date ? valueOf(item, map.fields.completion_date) : null });
  }
  result.value = records; result.included_records = records.length; result.provenance = { source_board: board.name, schema: map.fields };
  if (result.data_quality.invalid_date) result.status = 'SUPPORTED_WITH_CAVEATS';
  return result;
}

export function activeWorkOrdersBySector(board, map) {
  const base = workOrderOverview(board, map, { mode: 'active' });
  if (!['SUPPORTED', 'SUPPORTED_WITH_CAVEATS'].includes(base.status)) return base;
  const counts = {};
  for (const item of base.value) {
    const sector = item.sector || 'Unspecified sector';
    counts[sector] = (counts[sector] || 0) + 1;
  }
  return { ...base, metric: 'active_work_orders_by_sector', value: counts, definition: 'Count of active work orders by sector.' };
}

export function riskyDeals(board, map, { now = new Date() } = {}) {
  const result = baseResult('risky_deals', board.retrievedAt);
  result.definition = 'Open records with a past close date, missing close date, or missing amount.';
  if (!map.fields.close_date && !map.fields.amount) return { ...result, status: 'UNSUPPORTED', explanation: 'Close date or amount is required.' };
  const records = [];
  for (const item of board.items) {
    const label = statusOf(item, map)?.toLowerCase();
    if (label && !OPEN.has(label)) continue;
    const reasons = [];
    if (map.fields.close_date) { const date = parseDate(valueOf(item, map.fields.close_date)); if (!date) reasons.push('missing_or_invalid_close_date'); else if (date < now) reasons.push('past_close_date'); }
    const amount = map.fields.amount ? parseAmount(valueOf(item, map.fields.amount)) : null;
    if (map.fields.amount && amount === null) { reasons.push('missing_or_invalid_amount'); result.data_quality.missing_amount++; }
    if (reasons.length) records.push({ id: item.id, name: item.name, reasons, amount });
  }
  return { ...result, value: records, included_records: records.length, provenance: { source_board: board.name, schema: map.fields } };
}

export function topDealsByValue(board, map, { limit = 10 } = {}) {
  const result = baseResult('top_deals', board.retrievedAt);
  result.definition = `Highest ${limit} deal amounts, ordered descending.`;
  if (!map.fields.amount) return { ...result, status: 'UNSUPPORTED', explanation: 'An unambiguous deal-amount column is required.' };
  const records = [];
  for (const item of board.items) {
    const amount = parseAmount(valueOf(item, map.fields.amount));
    if (amount === null) { result.excluded_records++; result.data_quality.missing_amount++; continue; }
    records.push({ id: item.id, name: item.name, amount, sector: canonicalLabel(valueOf(item, map.fields.sector)), status: canonicalLabel(valueOf(item, map.fields.status)), stage: canonicalLabel(valueOf(item, map.fields.stage)) });
  }
  records.sort((a, b) => b.amount - a.amount);
  result.value = records.slice(0, Math.max(1, Math.min(limit, 50)));
  result.included_records = result.value.length;
  result.provenance = { source_board: board.name, schema: map.fields };
  if (result.excluded_records) result.status = 'SUPPORTED_WITH_CAVEATS';
  return result;
}
