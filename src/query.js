import { config } from './config.js';
import { MondayDataAdapter } from './monday.js';
import { discoverSchema } from './schema.js';
import { openPipeline, pipelineBySector, pipelineByStage, riskyDeals, topDealsByValue, wonRevenue, workOrderOverview, activeWorkOrdersBySector } from './analytics.js';

const cache = new Map();
async function board(kind) {
  const id = kind === 'deals' ? config.dealsBoardId : config.workOrdersBoardId;
  const cached = cache.get(kind);
  if (cached && Date.now() - cached.cachedAt < config.cacheTtlMs) return { ...cached, cacheHit: true };
  const value = await new MondayDataAdapter().getBoard(id);
  const entity = kind === 'deals' ? 'deals' : 'work_orders';
  const entry = { board: value, schema: discoverSchema(value.columns, entity), cachedAt: Date.now() };
  cache.set(kind, entry); return { ...entry, cacheHit: false };
}

export async function executeQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return { status: 'UNSUPPORTED', explanation: 'Please ask a business question.' };
  const lower = text.toLowerCase();
  const operationsIntent = /work order|operations?|delayed|completed|active work|execution/.test(lower);
  const source = await board(operationsIntent ? 'work_orders' : 'deals');
  const sectorValues = source.schema.fields.sector ? [...new Set(source.board.items.map(item => item.column_values.find(value => value.id === source.schema.fields.sector)?.text).filter(Boolean))] : [];
  const sector = sectorValues.find(value => lower.includes(String(value).trim().toLowerCase())) || null;
  const options = { sector, thisQuarter: /this quarter|current quarter/.test(lower) };
  let result;
  if (/(top|largest|highest)\s*(\d+)?\s*deals?|top deals?|deals?\s+by\s+(deal )?(value|amount)/.test(lower)) {
    const limit = Number(lower.match(/\btop\s+(\d+)/)?.[1] || 10);
    result = topDealsByValue(source.board, source.schema, { limit });
  } else if (/compare.*(sales|pipeline).*(execution|work)|sales.*(execution|work)/.test(lower)) {
    const deals = await board('deals'); const work = await board('work_orders');
    const sales = pipelineBySector(deals.board, deals.schema, {}); const execution = activeWorkOrdersBySector(work.board, work.schema);
    const sectors = new Set([...Object.keys(sales.value || {}), ...Object.keys(execution.value || {})]);
    const value = Object.fromEntries([...sectors].map(name => [name, { open_pipeline: sales.value?.[name]?.value || 0, active_work_orders: execution.value?.[name] || 0 }]));
    result = { status: sales.status === 'SUPPORTED_WITH_CAVEATS' || execution.status === 'SUPPORTED_WITH_CAVEATS' ? 'SUPPORTED_WITH_CAVEATS' : 'SUPPORTED', metric: 'sales_execution_by_sector', value, included_records: sales.included_records + execution.included_records, excluded_records: sales.excluded_records + execution.excluded_records, definition: 'Sector-level comparison of open deal pipeline and active work orders. This is not a record-level conversion calculation.', data_quality: sales.data_quality, retrieved_at: deals.board.retrievedAt, provenance: { deals_board: deals.board.name, work_orders_board: work.board.name }, cache: deals.cacheHit && work.cacheHit ? 'cached' : 'live_retrieval' };
  } else if (/leadership update|how is the business|business doing/.test(lower)) {
    const deals = await board('deals'); const work = await board('work_orders');
    const pipeline = openPipeline(deals.board, deals.schema, {}); const active = workOrderOverview(work.board, work.schema, { mode: 'active' }); const delayed = workOrderOverview(work.board, work.schema, { mode: 'delayed' });
    result = { status: [pipeline, active, delayed].some(item => item.status === 'SUPPORTED_WITH_CAVEATS') ? 'SUPPORTED_WITH_CAVEATS' : 'SUPPORTED', metric: 'leadership_update', value: { open_pipeline: pipeline.value, active_work_orders: active.included_records, delayed_work_orders: delayed.included_records }, included_records: pipeline.included_records + active.included_records, excluded_records: pipeline.excluded_records, definition: 'Combined live sales pipeline and work-order operating snapshot.', data_quality: pipeline.data_quality, retrieved_at: deals.board.retrievedAt, provenance: { deals_board: deals.board.name, work_orders_board: work.board.name }, cache: deals.cacheHit && work.cacheHit ? 'cached' : 'live_retrieval' };
  } else if (/\benergy\b/.test(lower) && !sector) result = { status: 'INSUFFICIENT_DATA', metric: 'open_pipeline', explanation: 'Energy is not a recognized sector value in the current Deals board, so no sector-wide answer was substituted.' };
  else if (/delayed|overdue|late/.test(lower)) result = workOrderOverview(source.board, source.schema, { mode: 'delayed' });
  else if (/completed|finished/.test(lower)) result = workOrderOverview(source.board, source.schema, { mode: 'completed' });
  else if (/active work|ongoing work|work order|execution/.test(lower)) result = workOrderOverview(source.board, source.schema, { mode: 'active' });
  else if (/won revenue|won deals|revenue|sales won/.test(lower)) result = wonRevenue(source.board, source.schema);
  else if (/stage|funnel/.test(lower)) result = pipelineByStage(source.board, source.schema);
  else if (/sector|vertical|industry|performance|break.*down/.test(lower)) result = pipelineBySector(source.board, source.schema, options);
  else if (/risk|risky|stale|past close|missing close/.test(lower)) result = riskyDeals(source.board, source.schema, options);
  else if (/pipeline/.test(lower)) result = openPipeline(source.board, source.schema, options);
  else result = { status: 'UNSUPPORTED', metric: null, explanation: 'Supported questions currently cover open pipeline, pipeline by sector, and risky deals. Other metrics remain unavailable until their actual board schema is verified.' };
  return { ...result, cache: source.cacheHit ? 'cached' : 'live_retrieval' };
}

export async function inspectSources() {
  const [deals, workOrders] = await Promise.all(['deals', 'work_orders'].map(async (kind) => {
    const source = await board(kind); return { kind, board: { id: source.board.id, name: source.board.name, records: source.board.items.length }, schema: source.schema, retrieved_at: source.board.retrievedAt, cache: source.cacheHit ? 'cached' : 'live_retrieval' };
  }));
  return { deals, work_orders: workOrders };
}
