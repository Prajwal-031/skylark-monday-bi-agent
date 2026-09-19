import { config } from './config.js';
import { MondayDataAdapter } from './monday.js';
import { discoverSchema } from './schema.js';
import { openPipeline, pipelineBySector, pipelineByStage, riskyDeals, topDealsByValue, wonRevenue, workOrderOverview } from './analytics.js';
import { generateBedrockCommentary } from './bedrock.js';

const cache = new Map();
async function board(kind) {
  const id = kind === 'deals' ? config.dealsBoardId : config.workOrdersBoardId;
  const cached = cache.get(kind);
  if (cached && Date.now() - cached.cachedAt < config.cacheTtlMs) return { ...cached, cacheHit: true };
  const value = await new MondayDataAdapter().getBoard(id);
  const entity = kind === 'deals' ? 'deals' : 'work_orders';
  const entry = { board: value, schema: discoverSchema(value.columns, entity), cachedAt: Date.now() };
  cache.set(kind, entry);
  return { ...entry, cacheHit: false };
}

const supported = result => ['SUPPORTED', 'SUPPORTED_WITH_CAVEATS'].includes(result?.status);
const crore = value => `₹${(Number(value || 0) / 1e7).toFixed(2)} Cr`;
const metricLabel = metric => ({ open_pipeline: 'Open pipeline', won_revenue: 'Won revenue', risky_deals: 'At-risk deals', pipeline_by_sector: 'Pipeline by sector', pipeline_by_stage: 'Pipeline by deal stage', active_work_orders: 'Active work orders', delayed_work_orders: 'Delayed work orders' }[metric] || 'Analysis');

function evidenceCaveats(results) {
  const caveats = [];
  for (const result of results) {
    if (result?.data_quality?.missing_amount) caveats.push(`${result.data_quality.missing_amount} record(s) were excluded because the amount was missing or invalid.`);
    if (result?.data_quality?.invalid_date) caveats.push(`${result.data_quality.invalid_date} record(s) had an invalid or missing date.`);
    if (result?.status === 'INSUFFICIENT_DATA' || result?.status === 'UNSUPPORTED') caveats.push(result.explanation);
  }
  return [...new Set(caveats)].filter(Boolean).slice(0, 3);
}

export function synthesizePipelineAnswer({ pipeline, stage, sector, risk, won }) {
  const evidence = [pipeline, stage, sector, risk, won].filter(Boolean);
  if (!supported(pipeline)) return { direct_answer: pipeline?.explanation || 'I could not reliably calculate the current open pipeline.', key_numbers: [], observations: [], risks: [], caveats: evidenceCaveats(evidence), source_note: 'Based on live monday.com data.' };
  const topSectors = supported(sector) ? Object.entries(sector.value || {}).sort((a, b) => b[1].value - a[1].value).slice(0, 3) : [];
  const topStages = supported(stage) ? Object.entries(stage.value || {}).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  const riskValue = supported(risk) ? risk.value.reduce((total, item) => total + (item.amount || 0), 0) : null;
  const riskCount = supported(risk) ? risk.included_records : null;
  const direct = `Your current open pipeline is ${crore(pipeline.value)} across ${pipeline.included_records} deals${topSectors[0] ? `, led by ${topSectors[0][0]}` : ''}. ${riskCount === null ? 'Deal-risk coverage could not be calculated reliably.' : `${riskCount} deals need attention.`}${supported(won) ? ` You have ${crore(won.value)} in won revenue for context.` : ''}`;
  const observations = [];
  if (topStages.length) observations.push(`The largest stage is ${topStages[0][0]} at ${crore(topStages[0][1])}.`);
  if (topSectors.length) observations.push(`The largest sectors are ${topSectors.map(([name, item]) => `${name} (${crore(item.value)})`).join(', ')}.`);
  if (riskCount) observations.push(`${riskCount} open deals meet the risk rules${riskValue ? `, representing ${crore(riskValue)} of parsed deal value` : ''}.`);
  return {
    direct_answer: direct,
    key_numbers: [`Open pipeline: ${crore(pipeline.value)} | ${pipeline.included_records} deals`, ...(supported(won) ? [`Won revenue: ${crore(won.value)} | ${won.included_records} deals`] : []), ...(riskCount !== null ? [`At-risk deals: ${riskCount}${riskValue ? ` | ${crore(riskValue)} parsed value` : ''}`] : []), ...(topSectors.length ? [`Largest pipeline sectors: ${topSectors.map(([name, item]) => `${name} ${crore(item.value)}`).join(' · ')}`] : [])].slice(0, 5),
    observations: observations.slice(0, 4),
    risks: riskCount ? [`Review the ${riskCount} open deals with past or missing close dates or missing amounts.`] : [],
    caveats: evidenceCaveats(evidence),
    visualization: {
      charts: [
        ...(topStages.length ? [{ title: 'Open pipeline by stage', items: topStages.map(([label, value]) => ({ label, value })) }] : []),
        ...(topSectors.length ? [{ title: 'Open pipeline by sector', items: topSectors.map(([label, item]) => ({ label, value: item.value })) }] : [])
      ]
    },
    source_note: 'Based on live monday.com data from the Deals board.'
  };
}

function simpleAnswer(result) {
  if (!supported(result)) return { direct_answer: result.explanation || 'I could not answer that reliably.', key_numbers: [], observations: [], risks: [], caveats: evidenceCaveats([result]), source_note: 'Based on live monday.com data.' };
  const label = metricLabel(result.metric);
  const direct = Array.isArray(result.value) ? `${label}: ${result.included_records} records.` : `${label}: ${typeof result.value === 'number' ? crore(result.value) : 'calculated from the available records'}.`;
  return { direct_answer: direct, key_numbers: [`${label}: ${Array.isArray(result.value) ? result.included_records : crore(result.value)}`], observations: [], risks: [], caveats: evidenceCaveats([result]), source_note: 'Based on live monday.com data.' };
}

async function pipelineBrief(source, options) {
  const pipeline = openPipeline(source.board, source.schema, options);
  const stage = pipelineByStage(source.board, source.schema);
  const sector = pipelineBySector(source.board, source.schema, options);
  const risk = riskyDeals(source.board, source.schema, options);
  const won = wonRevenue(source.board, source.schema);
  return { result: pipeline, response: synthesizePipelineAnswer({ pipeline, stage, sector, risk, won }), evidence: { pipeline, stage, sector, risk, won } };
}

export async function executeQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return { status: 'UNSUPPORTED', explanation: 'Please ask a business question.' };
  const lower = text.toLowerCase();
  const broadPipeline = /how is (our |the )?pipeline|business overview|how are sales doing|business performing|what should i worry about/.test(lower);
  const operationsIntent = /work order|operations?|delayed|completed|active work|execution/.test(lower) && !broadPipeline;
  const source = await board(operationsIntent ? 'work_orders' : 'deals');
  const sectorValues = source.schema.fields.sector ? [...new Set(source.board.items.map(item => item.column_values.find(value => value.id === source.schema.fields.sector)?.text).filter(Boolean))] : [];
  const sector = sectorValues.find(value => lower.includes(String(value).trim().toLowerCase())) || null;
  const options = { sector, thisQuarter: /this quarter|current quarter/.test(lower) };
  if (broadPipeline) {
    const brief = await pipelineBrief(await board('deals'), options);
    brief.response.ai_analysis = await generateBedrockCommentary(brief.response);
    return { ...brief.result, response: brief.response, evidence: brief.evidence, intent: 'pipeline_overview', cache: 'live_retrieval' };
  }
  let result;
  if (/(top|largest|highest)\s*(\d+)?\s*deals?|top deals?|deals?\s+by\s+(deal )?(value|amount)/.test(lower)) result = topDealsByValue(source.board, source.schema, { limit: Number(lower.match(/\btop\s+(\d+)/)?.[1] || 10) });
  else if (/delayed|overdue|late/.test(lower)) result = workOrderOverview(source.board, source.schema, { mode: 'delayed' });
  else if (/completed|finished/.test(lower)) result = workOrderOverview(source.board, source.schema, { mode: 'completed' });
  else if (/active work|ongoing work|work order|execution/.test(lower)) result = workOrderOverview(source.board, source.schema, { mode: 'active' });
  else if (/won revenue|won deals|revenue|sales won/.test(lower)) result = wonRevenue(source.board, source.schema);
  else if (/stage|funnel/.test(lower)) result = pipelineByStage(source.board, source.schema);
  else if (/sector|vertical|industry|performance|break.*down/.test(lower)) result = pipelineBySector(source.board, source.schema, options);
  else if (/risk|risky|stale|past close|missing close/.test(lower)) result = riskyDeals(source.board, source.schema, options);
  else if (/pipeline/.test(lower)) result = openPipeline(source.board, source.schema, options);
  else result = { status: 'UNSUPPORTED', explanation: 'I can answer questions about pipeline, sectors, deal risk, revenue, and work-order execution.' };
  return { ...result, response: simpleAnswer(result), cache: source.cacheHit ? 'cached' : 'live_retrieval' };
}

export async function inspectSources() {
  const [deals, workOrders] = await Promise.all(['deals', 'work_orders'].map(async kind => { const source = await board(kind); return { kind, board: { id: source.board.id, name: source.board.name, records: source.board.items.length }, schema: source.schema, retrieved_at: source.board.retrievedAt, cache: source.cacheHit ? 'cached' : 'live_retrieval' }; }));
  return { deals, work_orders: workOrders };
}
