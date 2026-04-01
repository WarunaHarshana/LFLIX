## Plan: LFLIX Full Implementation Roadmap

This plan delivers production-readiness in three execution phases: stabilize core reliability first, then improve architecture/performance, then harden security/mobile/release quality. It is designed to reduce regressions while keeping feature delivery moving.

**Diagrams (Draw.io)**
- Master roadmap: [diagrams/implementation-master-roadmap.drawio](diagrams/implementation-master-roadmap.drawio)
- Phase roadmap: [diagrams/implementation-phases.drawio](diagrams/implementation-phases.drawio)
- Workstream dependencies: [diagrams/implementation-workstreams.drawio](diagrams/implementation-workstreams.drawio)
- Risk to mitigation map: [diagrams/implementation-risks.drawio](diagrams/implementation-risks.drawio)

**Exported Diagrams (SVG/PNG)**
- Master roadmap: [diagrams/implementation-master-roadmap.drawio.svg](diagrams/implementation-master-roadmap.drawio.svg) | [diagrams/implementation-master-roadmap.drawio.png](diagrams/implementation-master-roadmap.drawio.png)
- Phase roadmap: [diagrams/implementation-phases.drawio.svg](diagrams/implementation-phases.drawio.svg) | [diagrams/implementation-phases.drawio.png](diagrams/implementation-phases.drawio.png)
- Workstream dependencies: [diagrams/implementation-workstreams.drawio.svg](diagrams/implementation-workstreams.drawio.svg) | [diagrams/implementation-workstreams.drawio.png](diagrams/implementation-workstreams.drawio.png)
- Risk to mitigation map: [diagrams/implementation-risks.drawio.svg](diagrams/implementation-risks.drawio.svg) | [diagrams/implementation-risks.drawio.png](diagrams/implementation-risks.drawio.png)

**Diagram Previews**
![Master roadmap](diagrams/implementation-master-roadmap.drawio.png)

![Phase roadmap](diagrams/implementation-phases.drawio.png)

![Workstream dependencies](diagrams/implementation-workstreams.drawio.png)

![Risk to mitigation map](diagrams/implementation-risks.drawio.png)

**Steps**
1. Phase 1: Reliability Foundation (Weeks 1-3)
2. Create a quality baseline by introducing automated testing for scanner parsing, metadata shaping, and high-traffic API routes. This is the gate for all later refactors. *blocks phases 2-3 risk-wise*
3. Implement structured logging with request correlation IDs and consistent error envelopes across API routes. Add centralized capture for operational errors and retry context.
4. Introduce schema-based request validation for mutation endpoints (auth, setup, scan, refresh, folders, stream, downloads) to remove ad-hoc validation drift.
5. Add transaction-safe mutation wrappers for multi-step operations (scan/refresh/delete/recovery paths) to avoid partial writes and orphan states.
6. Establish CI quality gates for pull requests: install, type-check, lint baseline, tests, and build.
7. Define and publish a defect triage workflow with severity definitions and required repro metadata.
8. Phase 2: Architecture and Performance (Weeks 4-6)
9. Add cache policy for high-frequency endpoints (discover/trending/search/episode metadata/content lists) with explicit TTLs, invalidation triggers, and stale-fallback behavior. *depends on logging from 3*
10. Extract domain state into a store architecture (library/discover/player/modals/downloads) and reduce oversized page-level state concentration.
11. Introduce a typed API client abstraction with consistent retry, timeout, cancellation, and error normalization.
12. Improve download lifecycle reliability with persisted queue state and restart recovery semantics for in-progress items.
13. Normalize UI loading/error/empty-state patterns across major surfaces to improve consistency and reduce user confusion.
14. Add performance guardrails: query timing instrumentation, API p50/p95 dashboards, and route-level budgets.
15. Phase 3: Security, Mobile, and Release Hardening (Weeks 7-9)
16. Add rate limiting and auth hardening (PIN attempt throttling, lockout windows, sensitive-route guards).
17. Audit route authorization and data exposure paths; enforce least-privilege behavior on sensitive handlers.
18. Consolidate shared UI primitives into a documented component standard to reduce duplication and improve delivery speed.
19. Unify mobile/web runtime behavior by reducing split launcher logic and aligning Capacitor integration with the primary app flow.
20. Add release automation: versioning policy, changelog generation, smoke test checklist, and rollback protocol.
21. Conduct end-to-end stabilization sprint covering scan, playback, episode metadata, discover, watchlist, and downloads.

**Execution Detail (Per Phase)**
1. Week 1 goals:
2. Test framework setup, first test suite for scanner and metadata, and logging scaffolding.
3. Week 2 goals:
4. Validation schemas + transaction wrappers + targeted API route adoption.
5. Week 3 goals:
6. CI enforcement, triage workflow, and reliability signoff review.
7. Week 4 goals:
8. Cache layer rollout for discover/trending/search with metrics.
9. Week 5 goals:
10. State/store migration for library and discover domains; typed API client integration.
11. Week 6 goals:
12. Download recovery persistence and UX-state normalization completion.
13. Week 7 goals:
14. Security controls (rate limiting/auth hardening) and authorization audit.
15. Week 8 goals:
16. Mobile-flow unification and component standardization.
17. Week 9 goals:
18. Release automation and full-system smoke tests with go/no-go checklist.

**Relevant files**
- app/page.tsx — current high-complexity state surface to decompose in Phase 2.
- app/api/auth/login/route.ts — auth throttling and lockout controls.
- app/api/setup/route.ts — request validation and sensitive setup hardening.
- app/api/scan/route.ts — mutation validation + transaction boundaries.
- app/api/refresh/route.ts — transactional refresh and observability.
- app/api/rescan/route.ts — consistency with scan/refresh reliability standards.
- app/api/episodes/route.ts — response contracts and typed client compatibility.
- app/api/search/route.ts — cache policy and timeout/retry improvements.
- app/api/discover/route.ts — cache + rate control strategy.
- app/api/trending/route.ts — cache TTL and stale fallback handling.
- lib/scanner.ts — parsing correctness, transaction safety, and test coverage.
- lib/metadata.ts — metadata fetch reliability, fallbacks, and cache-safe semantics.
- lib/db.ts — transaction helpers, schema-safe migration and integrity checks.
- lib/downloader.ts — persisted queue and restart recovery.
- middleware.ts — request-level security guards and rate-limit integration.
- app/components/DiscoverPage.tsx — normalized loading/error states and API client adoption.
- app/components/EpisodeModal.tsx — UI state consistency with typed data contracts.
- mobile/index.html — mobile launcher consolidation scope.
- capacitor.config.ts — runtime alignment for mobile integration.
- package.json — scripts for test, lint, type-check, and release workflow.

**Verification**
1. Reliability verification:
2. Inject controlled failures into scan/refresh/delete flows and confirm transaction rollback prevents partial writes.
3. Quality verification:
4. CI blocks merge when type-check/tests/build fail; baseline suite runs within agreed runtime budget.
5. API verification:
6. Contract tests validate request schema handling and standardized error envelopes.
7. Performance verification:
8. Compare pre/post p50 and p95 latencies for discover, search, and content list endpoints; confirm cache hit-rate target.
9. Security verification:
10. Simulate brute-force and burst traffic; verify throttling/lockout behavior and audit logs.
11. Download verification:
12. Restart during active downloads and confirm deterministic recovery behavior.
13. Mobile verification:
14. Validate consistent behavior on desktop web + Android Capacitor path for core journeys.
15. Release verification:
16. Dry-run release pipeline with smoke checklist and rollback rehearsal.

**KPIs (Track Weekly)**
- Automated coverage for critical modules (scanner, metadata, core API routes).
- API latency (p50/p95) for discover/search/content endpoints.
- Cache hit ratio for discover/trending/search workloads.
- Download resume success rate after restart.
- Failed-auth attempts blocked and logged within lockout policy.
- Mean time to detect and triage production errors.
- Change failure rate for merged pull requests.

**Decisions**
- Prioritize reliability and observability before broad feature expansion.
- Use incremental migrations and scoped rollouts instead of big-bang rewrites.
- Keep backward-compatible API contracts during state and client refactors.
- Treat mobile alignment as a hardening phase after core reliability/performance foundations.

**Scope Boundaries**
- Included:
- Reliability, performance, security, architecture cleanup, mobile alignment, release process.
- Excluded:
- Large visual redesign, new content providers, and major feature expansion unrelated to platform hardening.

**Risks and Mitigations**
1. Risk: Refactor churn slows delivery.
2. Mitigation: enforce phase gates and ship in small vertical slices.
3. Risk: Cache invalidation bugs show stale metadata.
4. Mitigation: explicit invalidation rules tied to scan/refresh mutations + fallback on miss.
5. Risk: Security controls impact legitimate users.
6. Mitigation: tune thresholds with staged rollout and observability.
7. Risk: Mobile unification introduces regressions.
8. Mitigation: retain compatibility mode during transition and test parity checklists.

**Milestones and Exit Criteria**
1. End of Phase 1:
2. Tests + validation + transactions + logging + CI live; critical-path reliability issues triaged.
3. End of Phase 2:
4. Cache/store/client/persistence delivered with measured latency and stability gains.
5. End of Phase 3:
6. Security hardening, mobile alignment, release automation, and smoke-governed release readiness achieved.
