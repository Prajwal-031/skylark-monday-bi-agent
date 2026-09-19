# Decision Log

## Assumptions and source truth

The workspace contained no repository, datasets, credentials, board IDs, or deploy configuration. No data findings are inferred from examples in the assignment. monday.com is the sole runtime data source; there is no static-data fallback.

## Architecture

A small Node backend was selected because this environment has Node 24 but no Python executable. Native `fetch` avoids adding packages before a source integration is validated. The browser calls only the backend. `MondayDataAdapter` isolates GraphQL and pagination; schema discovery and deterministic analytics are independent from transport.

## Integration and cache

GraphQL was selected over MCP because no monday MCP connector was available and the requirement is deterministic, paginated read retrieval. The adapter sends only read queries. A process-local 30-second TTL reduces repeated API calls. API responses label cache use explicitly; cached data is never called live.

## Metrics and quality

Only open pipeline, pipeline by sector, and risky deals have executable contracts. Stage semantics use a conservative explicit vocabulary. Empty amount is null, not zero. Ambiguous slash dates are rejected, not guessed. Schema aliases require exactly one match; ambiguity returns an explicit result state. Raw monday values remain available in retrieved records.

## Trade-offs and limitations

No LLM is present because no model credential was supplied and an LLM is not necessary for the implemented intent subset. This avoids ungrounded numerical claims. Work-order, revenue, weighted-pipeline, cross-board, and leadership-update outputs remain unsupported pending verified schemas and definitions. Retries/backoff are not yet added: they should be implemented and live-tested after API behavior is observable, rather than speculative. A hosted URL is not available without a deployment account and secrets.
