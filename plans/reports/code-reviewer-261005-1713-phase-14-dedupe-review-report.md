# Code Review: Phase 14 duplicate check

## Scope
- Files: schema (`chapters.ts`, `moderation.ts`), migration `0002_dedupe_fingerprints.sql` + meta, `schema.int.test.ts`, shared `limits/queues/index` (+tests), `packages/core/src/dedupe/*`, `content/hooks.ts` (+test), `outbox.int.test.ts`, `core/index.ts`, `testing/story-fixture.ts`, worker `content-router.ts`, `publishing-worker.ts` (+int test), `processors/{fingerprint-chapter,backfill-fingerprints}.ts` (+tests)
- LOC: ~230 changed in tracked files, ~750 new
- Focus: uncommitted diff + untracked files
- Probes (scratchpad clone, nothing in repo touched): int probe with three authors and out-of-order fingerprinting; unit probes for invisible-character evasion and scattered edits; `drizzle-kit generate` drift check (no drift); narrow suites rerun in repo (unit 12/12, int 7/7)

## Overall Assessment
Hash/MinHash/SimHash/LSH math is correct and consistent between the computed path (Int32Array reinterpretation) and the reused DB path (signed `integer[]`). The no-transaction deviation is sound (each run upserts before it queries, so two simultaneous copies cannot both miss each other). Migration matches the schema, the partial unique index and `ON CONFLICT DO NOTHING` work as designed, touchpoints (outbox drain, router, schedulers) are wired correctly. One confirmed correctness gap in which report gets filed, and one evasion hole in a function that is about to be frozen.

## Critical Issues
None.

## High Priority

### H1. One report per run: a real copy can be permanently missed when fingerprinting happens out of publish order
`packages/core/src/dedupe/fingerprint-chapter.ts:143-165`. A run files at most one report: it takes the single best non-dismissed match across *all* targets. When the checked chapter is the earlier one of several pairs, or its best match is a pair whose target is another chapter that already has an open report, the conflict is swallowed (`already_reported`) and the other targets are never reported. Their fingerprints are fresh, so the backfill never re-checks them.

Confirmed by probe (real Postgres): O (original), C1 (copy of O with ~2.5% words changed, published 2nd), C2 (exact copy of O, published 3rd). Fingerprint order C2, C1, O:
- C2: no candidates, `stored`
- C1: sees C2, pair target = C2 (later) → report on C2 (matched C1)
- O: candidates C2 (J=1.0, target C2) and C1 (J=0.80, target C1) → picks C2 → `already_reported`
- Result: only `{target C2, matched C1}`; C1, a copy of O at J=0.80, has no report, ever.

Out-of-order fingerprinting is not exotic: the first backfill after deploy fingerprints every existing chapter with `CONTENT_CONCURRENCY = 4`, and failed/lost jobs are re-run by the hourly backfill after newer chapters were checked. Violates the success criterion "copy of another author's chapter → exactly one duplicate report" for C1.

Fix: group above-threshold, non-dismissed matches by `targetId`, keep the best match per target, insert one row per target in a single multi-row `INSERT … ON CONFLICT DO NOTHING RETURNING id`; status `reported` if any row inserted. Add the three-chapter scenario above as an int test.

## Medium Priority

### M1. Zero-width / format characters fully defeat the check, and the normalizer is declared FROZEN
`packages/core/src/dedupe/normalize.ts:3-17`. `​` (ZWSP), `­` (soft hyphen) and other `\p{Cf}` characters are not `\p{L}\p{M}\p{N}`, so `NON_WORD` turns them into a space and splits every word. Probe: inserting one ZWSP or soft hyphen inside each word → estimated Jaccard **0**. Invisible to readers, survives Tiptap and `sanitize-html`. Fullwidth digits/letters also → 0 (NFC does not fold them).

Because `normalizeForDedupe` is frozen and the backfill only recomputes on `content_hash` change, fixing this after production fingerprints exist requires clearing `chapter_fingerprints`. Cheapest moment is now: strip `\p{Cf}` to empty before `NON_WORD`, and use `NFKC` instead of `NFC` (NFKC also composes Vietnamese). Update the snapshot tests accordingly.

### M2. "10% edited still flagged" test only covers clustered edits; scattered edits evade at ~5%
`packages/core/src/dedupe/dedupe.test.ts:69-78` edits 4 contiguous blocks of 50 words, which breaks few 5-word shingles. Probe on 2,000 words: one word changed in 40 → J 0.82; in 20 → **0.65 (missed)**; in 10 → 0.40. The plan's Critical scenario "sửa 10% từ → Jaccard ≥ 0,7" only holds for clustered edits. This is a property of the approved parameters (5-shingle, J ≥ 0.7), not a code bug, but the test name overstates coverage. Rename the test to say "clustered", and record "1 word in 20 changed evades" next to the known half-chapter limit for the phase 15 mod docs.

## Low Priority

- L1. `fingerprint-chapter.ts:104-123` `LIMIT 200` without `ORDER BY`: if a chapter shares band keys with >200 live chapters (widely copied text, boilerplate chapters), the true best match can be outside the arbitrary 200. Acceptable per plan; consider noting it.
- L2. `fingerprint-chapter.int.test.ts:59-68`: the `Promise.all` "concurrent" runs happen after the report already exists and all reuse the stored fingerprint, so they prove `ON CONFLICT` on a committed row, not a first-insert race or deviation (1) (two simultaneous copies). The unique index makes the race safe anyway; the test name claims more than it proves.
- L3. `hooks.test.ts:50` weakened from `toEqual(jobs)` to `jobs.slice(0, 2)`: an unexpected extra job for story/user changes would no longer fail that test (the new fingerprint tests only filter by name).
- L4. `apps/worker/src/processors/fingerprint-chapter.ts:21-24` logs `bestJaccard`, which can belong to a dismissed pair rather than the reported one.
- L5. `backfill-fingerprints.ts`: a chapter whose job fails deterministically is re-enqueued every hour forever (failed jobs kept 7 days → ~170 failed entries per bad chapter in Redis), and since every run restarts from the first id, ≥5,000 such chapters would starve the rest. Unlikely with Postgres-only processing; worth a comment or a skip once the processor proves a doc unprocessable.
- L6. Partial index `reports_open_auto_key` assumes `open` is the only unhandled status and `dismissed` the only "don't reopen" status. Phase 15 must not introduce e.g. `in_review` (would allow a second auto report) and should decide whether `resolved` pairs are also excluded in `dismissedPairs` (`fingerprint-chapter.ts:199`). Also: a mod reopening a dismissed auto report while another auto report on that target is open will hit a unique violation.
- L7. `dedupe.test.ts:80-86` 200 ms wall-clock assertion measures only minhash+LSH (not normalize/docToText) and can flake on a loaded CI runner.

## Deliberate deviations
1. No wrapping transaction: correct. Upsert-before-query in autocommit guarantees at least one of two simultaneous copies sees the other; a transaction would allow both to miss. Stale-write race (old content upsert landing after new) self-heals via `content_hash` + backfill.
2. Target = later published (tie → larger id): correct and stable; `publishedAt` is kept on republish (`publish-chapter.ts:57`), so direction never flips. But see H1: it needs per-target inserts to be complete.
3. Dismissed pairs skipped, next-best reported: matches the requirement; keyed on `(target, matched)`, consistent with (2).
4. Shingles always recomputed: needed for `minShingles`; cost negligible.

## Acceptance criteria
- Copy by another author → one report, not hidden: met for in-order publishing; **not met** in the H1 out-of-order case.
- Missing/stale fingerprint backfilled ≤ 1 h: met (keyset, `IS DISTINCT FROM`, 10×500, `addBulk` without `jobId`, scheduler registered, int-tested).
- No `jobId`; repeated/concurrent runs no duplicate report: met (partial unique index + `ON CONFLICT DO NOTHING`, schema int test proves constraint).
- Migration 0002: matches schema (drift check clean), `USING gin`, partial `WHERE` present; checkbox not ticked: correct.
- English-only code/comments/test names: met for new code.
- No public API / exported contract breakage; `ContentChange` unchanged; new exports only.

## Recommended Actions
1. H1: per-target report inserts + three-chapter int test.
2. M1: strip `\p{Cf}`, switch to NFKC, refresh snapshots, before any production fingerprint exists.
3. M2: rename the edit test; add the scattered-edit limit to the phase 15 mod docs list.
4. L2/L3 test hygiene when convenient.

## Metrics
- Type coverage: strict TS, no `any`; one cast `row.docJson as EditorDocJson` (trusted server-written data)
- Tests: dedupe unit 12/12, int 7/7 (rerun); gate reported green
- Lint issues: 0 reported

## Score: 7/10

## Unresolved Questions
- Phase 15: which report statuses besides `dismissed` should suppress re-reporting the same pair?
