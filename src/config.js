import { existsSync, readFileSync } from 'node:fs';

// Local convenience only: production platforms should inject environment variables.
// Existing process variables always win and this file is git-ignored.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const required = (name) => process.env[name]?.trim() || null;

export const config = Object.freeze({
  mondayToken: required('MONDAY_API_TOKEN'),
  dealsBoardId: required('MONDAY_DEALS_BOARD_ID') || required('DEALS_BOARD_ID'),
  workOrdersBoardId: required('MONDAY_WORK_ORDERS_BOARD_ID') || required('WORK_ORDERS_BOARD_ID'),
  mondayApiVersion: process.env.MONDAY_API_VERSION || '2025-10',
  bedrockApiKey: required('AWS_BEARER_TOKEN_BEDROCK') || required('AWS_BEDROCK_API_KEY'),
  bedrockRegion: process.env.AWS_BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
  bedrockModelId: process.env.AWS_BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-6',
  bedrockEnabled: process.env.AWS_BEDROCK_ENABLED === 'true',
  bedrockTimeoutMs: Number(process.env.AWS_BEDROCK_TIMEOUT_MS || 20_000),
  port: Number(process.env.PORT || 3000),
  // Live is the default. A deployment can opt into a short, explicitly labelled cache.
  cacheTtlMs: Number(process.env.CACHE_TTL_MS || 0)
});

export function missingMondayConfiguration() {
  return ['MONDAY_API_TOKEN', 'MONDAY_DEALS_BOARD_ID', 'MONDAY_WORK_ORDERS_BOARD_ID']
    .filter((name) => !({ MONDAY_API_TOKEN: config.mondayToken, MONDAY_DEALS_BOARD_ID: config.dealsBoardId, MONDAY_WORK_ORDERS_BOARD_ID: config.workOrdersBoardId })[name]);
}
