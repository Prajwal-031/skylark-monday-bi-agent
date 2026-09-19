import { config, missingMondayConfiguration } from './config.js';

export class MondaySourceError extends Error {
  constructor(message, code = 'SOURCE_ERROR') { super(message); this.code = code; }
}

async function request(query, variables) {
  if (!config.mondayToken) throw new MondaySourceError('monday.com is not configured. Missing: MONDAY_API_TOKEN.', 'NOT_CONFIGURED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: config.mondayToken, 'Content-Type': 'application/json', 'API-Version': config.mondayApiVersion },
      body: JSON.stringify({ query, variables })
    });
    if (response.status === 429) throw new MondaySourceError('monday.com rate limit reached. Please retry shortly.', 'RATE_LIMITED');
    if (response.status === 401 || response.status === 403) throw new MondaySourceError('monday.com authentication was rejected.', 'AUTH_FAILED');
    if (!response.ok) throw new MondaySourceError(`monday.com returned HTTP ${response.status}.`);
    const body = await response.json();
    if (body.errors?.length) throw new MondaySourceError(body.errors.map((error) => error.message).join('; '));
    return body.data;
  } catch (error) {
    if (error instanceof MondaySourceError) throw error;
    if (error.name === 'AbortError') throw new MondaySourceError('monday.com request timed out.');
    throw new MondaySourceError('Unable to contact monday.com.');
  } finally { clearTimeout(timeout); }
}

const firstPageQuery = `query ($boardId: ID!) { boards(ids: [$boardId]) { id name columns { id title type } items_page(limit: 500) { cursor items { id name created_at column_values { id text value type } } } } }`;
const nextPageQuery = `query ($cursor: String!) { next_items_page(cursor: $cursor, limit: 500) { cursor items { id name created_at column_values { id text value type } } } }`;

export class MondayDataAdapter {
  async listBoards() {
    const data = await request(`query { boards(limit: 100) { id name state } }`, {});
    return data.boards || [];
  }

  async getBoard(boardId) {
    if (!boardId) throw new MondaySourceError('The board ID is not configured.', 'NOT_CONFIGURED');
    const initial = await request(firstPageQuery, { boardId: String(boardId) });
    const board = initial.boards?.[0];
    if (!board) throw new MondaySourceError(`Board ${boardId} was not found.`);
    const items = [...(board.items_page?.items || [])];
    let cursor = board.items_page?.cursor;
    while (cursor) {
      const page = await request(nextPageQuery, { cursor });
      items.push(...(page.next_items_page?.items || []));
      cursor = page.next_items_page?.cursor;
    }
    return { id: board.id, name: board.name, columns: board.columns, items, retrievedAt: new Date().toISOString() };
  }
}
