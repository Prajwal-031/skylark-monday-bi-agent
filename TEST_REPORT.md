# Test Report — 19 Sep 2026

## Executed

`npm test` using Node's built-in test runner.

## Results

- Passed: 4
- Failed: 0
- Skipped: 0

## Covered critical scenarios

- Case/whitespace sector normalization.
- Currency parsing and null preservation.
- Valid, invalid, and ambiguous dates.
- Deterministic open-pipeline aggregation and missing-amount caveat.

## Not executed (blocked by absent source/deployment access)

- Live monday authentication, pagination, rate limit, timeout, malformed response, empty board, and schema-change tests.
- Board-specific metric validation and golden questions.
- Public deployment smoke test and clean-session test.

These are not passing claims; they require configured read access to actual boards.
