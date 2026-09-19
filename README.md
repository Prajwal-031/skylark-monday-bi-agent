# Skylark Intelligence

![Skylark Intelligence - Business Intelligence for a Higher Tomorrow](image.png)

An interactive founder-facing BI assistant for live monday.com sales and work-order data.

The app combines deterministic analytics with an optional Amazon Bedrock commentary layer. Deterministic code owns every filter, aggregation, date rule, currency value, risk count, and chart value. Bedrock can add qualitative interpretation, but it cannot invent, recalculate, or replace the numbers.

## Quick Start

Run these commands in PowerShell:

```powershell
cd "C:\Users\prajw\OneDrive\Documents\Project\Business-Intelligence-Agent"
npm install
Copy-Item .env.example .env
notepad .env
npm test
npm start
```

Add your monday.com token and board IDs to `.env`, then open [http://localhost:3000](http://localhost:3000). Keep the terminal running while using the dashboard. Stop the server with `Ctrl+C`.

For development with automatic server restarts:

```powershell
npm run dev
```

## What It Feels Like

Open `http://localhost:3000` and ask a question in plain language:

- `How is our pipeline looking?`
- `Which deals are risky?`
- `Show pipeline by sector`
- `What are the largest deals?`
- `Which work orders are delayed?`
- `How are operations doing?`

The interface is designed around one executive answer per question:

1. **Direct answer**: a short interpretation first.
2. **Key numbers**: the relevant totals and record counts.
3. **What stands out**: evidence-based stage, sector, or risk observations.
4. **Risks and caveats**: shown only when material.
5. **Detailed report**: an expandable view with deterministic visualizations.

For pipeline questions, the detailed report includes compact bar charts for the largest deal stages and sectors. The report can also include optional Bedrock commentary below the deterministic evidence.

## Current Pipeline Example

A live pipeline overview is synthesized from the relevant analytics only:

```text
Your current open pipeline is ₹68.82 Cr across 47 deals, led by Tender.
56 deals need attention. You have ₹9.50 Cr in won revenue for context.
```

Internal identifiers such as `open_pipeline`, `risky_deals`, and `pipeline_by_sector` stay in the backend evidence and are not shown as the user-facing answer.

## Architecture

```text
User question
  -> intent classification
  -> relevant analytics selection
  -> live monday.com retrieval
  -> deterministic calculations
  -> structured evidence
  -> optional Bedrock qualitative commentary
  -> one executive response + optional visual report
```

Runtime components:

- `public/index.html`: browser UI, question composer, response hierarchy, and report visualizations.
- `src/server.js`: same-origin HTTP server and JSON API.
- `src/query.js`: intent routing, analytics orchestration, response synthesis, and evidence collection.
- `src/analytics.js`: deterministic metrics and data-quality rules.
- `src/normalization.js`: amount, date, status, and label normalization.
- `src/schema.js`: mapping from live monday.com column titles to canonical fields.
- `src/monday.js`: read-only monday.com GraphQL adapter with cursor pagination and timeouts.
- `src/bedrock.js`: optional server-only Bedrock commentary request.

## Data Sources

monday.com is the only runtime business-data source. The application currently supports two configured boards:

- **Deals**: open pipeline, pipeline by stage, pipeline by sector, won revenue, top deals, and risky deals.
- **Work Orders**: active, completed, and delayed work-order views.

The schema is discovered from the live board columns. A field is used only when its mapping is unambiguous. Missing or invalid values remain visible as exclusions and caveats; they are never silently converted to zero.

## Setup

Requirements:

- Node.js 18 or later
- npm
- A monday.com read-capable API token
- IDs for the Deals and Work Orders boards
- Optional Bedrock bearer API key and model access

Install and configure:

```powershell
cd "C:\Users\prajw\OneDrive\Documents\Project\Business-Intelligence-Agent"
npm install
Copy-Item .env.example .env
notepad .env
```

Minimum `.env` configuration:

```env
MONDAY_API_TOKEN=your_monday_read_token
MONDAY_DEALS_BOARD_ID=your_deals_board_id
MONDAY_WORK_ORDERS_BOARD_ID=your_work_orders_board_id
MONDAY_API_VERSION=2025-10
PORT=3000
CACHE_TTL_MS=30000
```

Start the application:

```powershell
npm test
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Optional Bedrock Enhancement

Bedrock is deliberately optional. When enabled, it provides qualitative commentary such as concentration, momentum, and areas to watch. It does not own business calculations or chart values.

Amazon Bedrock API keys are bearer tokens. Keep the key in `.env` on the server and never place it in browser JavaScript, README files, screenshots, commits, or chat messages.

```env
AWS_BEDROCK_ENABLED=true
AWS_BEARER_TOKEN_BEDROCK=your_bedrock_api_key
AWS_BEDROCK_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
AWS_BEDROCK_TIMEOUT_MS=20000
```

The Bedrock path is fail-soft:

- Disabled or missing key: deterministic report still works.
- Timeout or service error: deterministic report still works.
- Numeric claims in model commentary: commentary is discarded.
- API key: never returned to the browser or logged.

For long-running production use, prefer short-lived keys or an AWS identity-based deployment role over a long-lived exploration key.

## API Endpoints

### Health

```http
GET /api/health
```

Returns a simple service status and request ID.

### Schema inspection

```http
GET /api/schema
```

Returns the live Deals and Work Orders board names, record counts, discovered fields, retrieval timestamps, and cache state.

### Business query

```http
POST /api/query
Content-Type: application/json

{"question":"How is our pipeline looking?"}
```

The response contains:

- deterministic result metadata for auditability
- `response.direct_answer`
- `response.key_numbers`
- `response.observations`
- `response.risks`
- `response.caveats`
- `response.visualization`
- optional `response.ai_analysis`
- `response.source_note`
- structured `evidence` used to support the answer

The browser renders `response`, not raw analytics tool names or raw JSON evidence.

## Security Rules

- `.env` is ignored and must remain local.
- monday.com and Bedrock credentials are server-only.
- The monday adapter makes read-only calls.
- Request logs include correlation IDs but exclude tokens and prompts containing credentials.
- Error responses are user-safe and do not expose stack traces.
- Rotate any credential that has been pasted into chat, committed, screenshotted, or shared outside the intended secret store.

## Validation

Run the full deterministic test suite:

```powershell
node --test
```

Check the backend:

```powershell
Invoke-WebRequest http://localhost:3000/api/health
Invoke-WebRequest http://localhost:3000/api/schema
```

Test a founder query:

```powershell
$body = @{ question = "How is our pipeline looking?" } | ConvertTo-Json
Invoke-WebRequest `
  -Uri http://localhost:3000/api/query `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

## Design Principles

- **Numbers are deterministic**: the model never calculates metrics.
- **Answers are synthesized**: one question produces one coherent executive response.
- **Evidence stays traceable**: source board, schema, retrieval time, status, and caveats are preserved.
- **Visuals stay honest**: charts use analytics output directly.
- **Missing data is explicit**: unavailable metrics are reported rather than guessed.
- **The interface is progressive**: concise answer first, detail on demand.
