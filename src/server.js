import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { executeQuestion, inspectSources } from './query.js';
import { MondaySourceError } from './monday.js';
import { MondayDataAdapter } from './monday.js';
import { config } from './config.js';

const responseHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
// The normal production path is same-origin. This header makes a locally previewed
// static page work against the local backend without putting a token in the browser.
const json = (response, status, body) => response.writeHead(status, { ...responseHeaders, 'Access-Control-Allow-Origin': '*' }).end(JSON.stringify(body));
const requestId = () => crypto.randomUUID();

const server = createServer(async (request, response) => {
  const id = requestId();
  try {
    if (request.method === 'OPTIONS') return response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
    if (request.method === 'GET' && request.url === '/api/health') return json(response, 200, { status: 'ok', request_id: id });
    if (request.method === 'GET' && request.url === '/api/boards') return json(response, 200, { request_id: id, boards: await new MondayDataAdapter().listBoards() });
    if (request.method === 'GET' && request.url === '/api/schema') return json(response, 200, { request_id: id, ...(await inspectSources()) });
    if (request.method === 'POST' && request.url === '/api/query') {
      let raw = ''; for await (const part of request) raw += part;
      const started = Date.now(); const { question } = JSON.parse(raw || '{}');
      const result = await executeQuestion(question);
      console.info(JSON.stringify({ request_id: id, event: 'query', query_length: String(question || '').length, metric: result.metric, status: result.status, elapsed_ms: Date.now() - started, cache: result.cache }));
      return json(response, 200, { request_id: id, result });
    }
    if (request.method === 'GET' && request.url === '/') {
      const html = await readFile(new URL('../public/index.html', import.meta.url));
      return response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    }
    return json(response, 404, { error: 'Not found', request_id: id });
  } catch (error) {
    const known = error instanceof MondaySourceError;
    console.error(JSON.stringify({ request_id: id, event: 'error', code: error.code || 'UNEXPECTED', message: error.message }));
    if (response.headersSent) return;
    return json(response, known ? 503 : 400, { request_id: id, result: { status: 'SOURCE_ERROR', explanation: known ? error.message : 'The request could not be processed.' } });
  }
});
server.listen(config.port, () => console.info(`Skylark BI Agent listening on http://localhost:${config.port}`));
