# Skylark Drones monday.com BI Agent

An intentionally small, defensible BI prototype: monday.com is the only runtime business-data source; the browser only talks to this backend; deterministic code calculates numbers; and every result carries status, data-quality, source, schema, and retrieval metadata.

## Phase 0 inspection (19 Sep 2026)

### A. Data findings
No Deals or Work Orders dataset was present in the supplied workspace or attachments. The workspace started empty. Therefore no columns, null rates, examples, duplicates, or data types could be honestly reported.

### B. Canonical data model
The runtime model is discovered from actual monday board columns. The adapter preserves `id`, `name`, `created_at`, and all raw column values. The mapping layer can map verified columns to `amount`, `sector`, `stage`, `status`, `close_date`, `owner`, `completion_date`, `start_date`, `work_order_value`, and `external_id`. A field is mapped only when exactly one matching title exists.

### C. Data-quality findings
No source records were available to measure. The implementation treats empty values as null, accepts unambiguous values only, rejects ambiguous numeric slash dates, preserves raw values, and exposes excluded records/counts. It does not turn missing amounts into zero.

### D. Supported metrics
After a board is configured and its schema supports them: open pipeline, open pipeline by sector, and risky deals (past/missing close date and missing amount). They use recognized, explicit open labels only.

### E. Unsupported / insufficient metrics
Weighted pipeline, won revenue, expected revenue, win rate, work-order metrics, leadership update, and cross-board conversion are not implemented because actual board fields and business definitions were not available to validate them. The API reports `UNSUPPORTED` or `INSUFFICIENT_DATA`; it never estimates.

### F. monday.com integration path
The selected path is the monday GraphQL API, behind `MondayDataAdapter`. It is deterministic, read-only, supports cursor pagination, has a server-side 15-second timeout, and returns clear errors for authentication/rate-limit/source failures. No monday MCP connector was available in this session. The initial request uses a board-scoped `items_page`; continuation uses `next_items_page` until its cursor is absent.

### G. Architecture
`Browser → Node HTTP backend → query router → deterministic analytics → normalization/schema mapping → MondayDataAdapter → monday.com GraphQL`.

### H. Key risks
The actual monday board names/IDs/schema, token authorization, stage vocabulary, currency, and date convention are unverified. The default GraphQL API version must be compatible with the connected monday account. Caching is a 30-second in-memory TTL, exposed as `cached` rather than described as live.

### I. Implementation plan
1. Configure two board IDs and a read-only token. 2. Inspect `/api/schema` and review mappings/ambiguities. 3. Align status vocabulary and metric contracts with leadership. 4. Add only verified metrics. 5. deploy with server-side secrets and run golden queries against live boards.

### J. Six-hour execution plan
Hour 1: credential setup, source discovery. Hour 2: approve schema and status vocabulary. Hours 3–4: implement verified revenue/operations metrics and tests. Hour 5: deployment and retries/rate-limit validation. Hour 6: golden-query, clean-session, and security audit.

### K. Required credentials / human actions
Provide a monday API token that can **read** the intended boards, their IDs, and confirmation of the desired API version. A deployment account/project plus server-side secret configuration are also required for a public URL. No valid credential or deployment target was provided, so this repository is not deployed and cannot be truthfully called connected/live.

## Local setup

Requires Node 18+ (tested with Node 24.20.0). Copy `.env.example` to `.env`, set values in your environment, then run:

```powershell
npm test
npm start
```

Open `http://localhost:3000`. Send `GET /api/schema` after configuration to inspect the runtime schema. Send `POST /api/query` with `{"question":"How's our Energy pipeline this quarter?"}` for a structured result.

## Metric contract: open pipeline

- Definition: sum of `amount` for a record with a recognized open stage/status (`open`, `new`, `qualified`, `proposal`, `negotiation`, `in progress`, or `active`).
- Required: an unambiguous amount column and at least one unambiguous stage/status column.
- Optional filters: exact normalized sector; current calendar quarter based on an unambiguous close date.
- Exclusions: non-open stages, mismatched filters, missing/invalid amounts, and missing/invalid dates when quarter-filtered.
- Output: status, value, included/excluded counts, filters, definition, data quality, source board/schema, timestamp, and cache state.

## Security and operations

`MONDAY_API_TOKEN` is read only by the backend and is never returned, logged, or bundled to the UI. `.env` is ignored. The adapter makes no mutation calls. Error responses are user-safe and stack traces are not exposed. Requests get a correlation ID and structured logs exclude secrets.

## Testing and limitations

`npm test` executes normalization and deterministic metric tests. See `TEST_REPORT.md`. Live integration, pagination, retry behavior, deployment, and clean-browser validation are deliberately unmarked until real credentials and boards are available.
