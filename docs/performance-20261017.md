# Sanabil performance release 20261017-v13.7.0

## Evidence and limits
- Production pg_stat_statements: daily assignments 896 calls, mean 137.57 ms, maximum 6092.08 ms; circle session access 1023 calls, mean 46.32 ms, maximum 3176.87 ms. These are historical server execution timings, not browser latency.
- Largest active circle plan lookup: EXPLAIN ANALYZE before index 82.431 ms, 220 shared buffer hits; after index 3.036 ms, 99 hits and 4 reads. Planner uses plans_active_student_type_updated_idx and eliminates the repeated sort. Single samples are affected by cache/load and are not an end-to-end speedup estimate.
- No authenticated browser session was available for a real teacher/admin journey. Under-two-second p95 is a target, not a verified guarantee.

## Changes
- Partial active-plan index deployed with the migration optimize_active_student_plan_lookup.
- Concurrent independent session reads; preserve mandatory authorization and critical error propagation.
- Reuse lookup promise and its offline snapshot once per refresh.
- Automatic offline prefetch starts after 15 seconds, yields to user activity and foreground requests, and runs requests sequentially. Manual preparation retains all dates.
- Network reads return before optional snapshot disk writes; queued writes still await durable storage.
- ExcelJS loads only for spreadsheet operations, with shared loading promise and retry.
- Session-only operation timings and administrator performance view; no payloads, credentials or student records logged.
- Form submission immediately shows pending status; success still depends on the existing server confirmation.

## Validation
Node syntax and regression tests for user messaging, concurrent reads, critical failures and timing session isolation.
Deployment verifies live build, PWA assets, icons and performance integration.
Collect at least 20 successful samples per operation on representative devices/connections before interpreting p95; failed operations are reported separately.
