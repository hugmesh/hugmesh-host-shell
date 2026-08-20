# hugmesh.net — e2e (Nightwatch 3 + Cucumber)

Gherkin-readable e2e harness for the **host shell** (the top-level federation
container that mounts the role-home / social remotes). `e2e/features` +
`e2e/step_definitions`, driven by Nightwatch 3's built-in Cucumber test
runner (`nightwatch.conf.js`).

## Framework deviation from the platform convention (KNOWN, TRACKED)

Every other HugMesh repo's e2e suite (`admin-ui`, `mod-ui`, `mastodon-ui`,
`matrix-ui`, `user-ui`, `wiki-ui`, `tube-ui`, `owncast-ui`, `login-ui`,
`hugmesh.games`) runs **Playwright + playwright-bdd**: `.feature` files
compiled by `bddgen` into generated Playwright specs, with a `not @cluster`
tag filter in `playwright.config.ts` gating live-stack-only scenarios out of
the default/offline run, and a CI `e2e:bdd`-style job that proves the suite
**compiles + discovers** (`bddgen` + `playwright test --list`) without ever
needing a live cluster.

This repo predates that convention and still runs **Nightwatch 3 +
`@cucumber/cucumber`**: the same Gherkin-first shape (feature files, step
definitions, a tag-based live/offline split), but a different toolchain,
runner, and CI compile-proof mechanism. This is an intentional, tracked
deviation — not an oversight — and is **out of scope to fix by a full
framework migration in this workstream** (too large a change to land
alongside a tag-convention pass). What follows is the as-is mapping plus the
scoped migration plan.

### What Nightwatch+Cucumber gates live-stack-only scenarios with today

- **`@cluster`** (renamed from `@integration` in this pass — same semantics,
  aligned vocabulary with the platform-wide tag) marks every scenario that
  needs the federation REMOTES served from their own dev servers / nginx at
  the manifest URLs (ports 4203-4206) plus a host server with a real SPA
  fallback — i.e. an integrated/live environment, not just a mocked host-only
  run. Five whole features carry the tag at the `Feature:` level
  (`role-routing.feature`, `role-home-content.feature`,
  `home-announcements.feature`, `appeal-redirect.feature`,
  `home-services-cards.feature`); a sixth (`role-authgate.feature`) documents
  the split inline without itself carrying scenarios that need it.
- **`@skip`** is Nightwatch/Cucumber's existing manual-skip convention
  (defined in the base filter, `not @skip and not @cluster`, though nothing
  currently carries it — reserved for a scenario that needs to be temporarily
  disabled without deleting it).
- `@bff-status-mock` / `@capabilities-mock` are **not** live/offline gates —
  they're local-only "this scenario registers a network-level HTTP mock, run
  the After-hook restore" markers (`status-gate.feature`,
  `role-registration.feature`), orthogonal to the cluster split.
- The filter lives in `nightwatch.conf.js` (`test_runner.options.tags`), the
  Nightwatch/Cucumber equivalent of playwright-bdd's `defineBddConfig({
  tags })`. `npm run e2e` runs the default (`not @skip and not @cluster`)
  offline subset; `npm run e2e:integration` overrides with `--tag cluster` to
  run (or, offline, dry-run-parse) the live-stack-only set.
- CI (`.gitlab-ci.yml` `e2e:host` job) always runs the default `npm run e2e`
  subset — host-only, no served remotes — exactly mirroring the platform's
  "offline set runs in CI, `@cluster`/live set is opt-in against a real
  deployment" posture, just without a dedicated compile-only job (see below).

### The compile-proof gap

The platform convention's CI job proves the *whole* suite (including the
`@cluster` set) compiles and is discoverable, without executing anything
live (`bddgen` + `playwright test --list`). This repo's `e2e:host` CI job
does not have an equivalent step — it only *runs* the default (non-cluster)
subset against a real headless Chrome + built app; the `@cluster` scenarios
are compile-checked incidentally (Cucumber's `require` pass loads every step
definition file regardless of which scenarios execute) but there is no
explicit proof step and no artifact showing the `@cluster` set parses/every
step resolves.

A local, framework-native equivalent exists and should be added as a CI step
in the real migration (or as a smaller near-term fix): `@cucumber/cucumber`'s
own CLI supports `--dry-run`, which parses every `.feature`, resolves every
step against `step_definitions`, and reports undefined/ambiguous steps —
with **no browser, no chromedriver, no built app** required. Verified during
this pass:

```bash
npm ci
# Default (offline) subset — mirrors what `npm run e2e` executes:
npx cucumber-js e2e/features --require e2e/step_definitions \
  --tags 'not @skip and not @cluster' --dry-run --format summary
# => 33 scenarios (33 skipped), 294 steps (294 skipped)

# Whole suite, no filter — proves every .feature file compiles:
npx cucumber-js e2e/features --require e2e/step_definitions \
  --dry-run --format summary
# => 56 scenarios (56 skipped), 451 steps (451 skipped)

# @cluster-only subset — mirrors `npm run e2e:integration` (--tag cluster):
npx cucumber-js e2e/features --require e2e/step_definitions \
  --tags '@cluster' --dry-run --format summary
# => 23 scenarios (23 skipped), 157 steps (157 skipped)
```

33 + 23 = 56, confirming the tag partition is exhaustive and every scenario
in every feature file parses and resolves cleanly (re-verified 2026-07-16;
these counts grow as new scenarios land — e.g. the account-status
appeal-gate and role-matrix waves — so re-run the commands above rather than
trusting these numbers indefinitely). This `--dry-run` command
is a candidate follow-up CI step (a `e2e:host:dry-run` job with no
`hugmesh-x86` runner / docker / Chrome dependency) but was not wired into
`.gitlab-ci.yml` in this pass — CI changes beyond the tag rename are left to
the migration follow-up below so this workstream stays a scoped tag-vocabulary
fix, not a CI redesign.

### What a real migration to playwright-bdd would require

Scoped as an actionable follow-up (not attempted here):

1. **Add the toolchain.** `npm i -D @playwright/test playwright-bdd` (or
   equivalent pinned versions matching the platform's other repos — see
   `hugmesh-admin-ui/e2e/package.json` for the proven version set) and a
   `playwright.config.ts` with `defineBddConfig({ features:
   'e2e/features/**/*.feature', steps: [...], tags: 'not @cluster' })`,
   mirroring `matrix-ui`/`admin-ui`/`mod-ui`.
2. **Port `nightwatch.conf.js` → `playwright.config.ts`.** The
   `test_settings.chrome.desiredCapabilities` headless-Chrome args map to
   Playwright's `use: { ... }` + `devices['Desktop Chrome']`; screenshots/
   video/trace map to `screenshot`/`video`/`trace` (see any migrated repo's
   config for the exact shape this platform standardizes on).
3. **Rewrite `e2e/step_definitions/role.steps.js` step definitions** from
   Nightwatch's `browser.*` chainable API (`browser.waitForElementVisible`,
   `browser.click`, `browser.assert.*`) to Playwright's `page.*` /
   `expect(page.locator(...))` API. This is the bulk of the migration effort
   — every step in every `.steps.js` file needs a rewrite, not just a
   mechanical find/replace (Nightwatch's implicit-wait assertions vs
   Playwright's `expect.poll`/auto-waiting locators have different failure
   semantics that the "honest absence" assertions in this suite's DENY
   scenarios rely on getting right).
4. **`.feature` files themselves need NO changes** — Gherkin is
   framework-agnostic; every `.feature` in `e2e/features/` ports as-is to
   `playwright-bdd`'s `bddgen` compiler. The `@cluster`/`@skip` tags already
   match the target convention after this workstream's rename.
5. **Replace the CI job.** `.gitlab-ci.yml`'s `e2e:host` job's docker-run
   Chrome+chromedriver install dance is replaced by the platform-standard
   `mcr.microsoft.com/playwright:v1.55.1-jammy` image + `npx bddgen` +
   `npx playwright test --list` (compile-proof, `allow_failure: true`,
   `changes: [e2e/**/*]`-gated) job shape used by every already-migrated repo
   — see `hugmesh-matrix-ui/.gitlab-ci.yml`'s `e2e:bdd` job for the
   template to copy.
6. **Drop `nightwatch`, `@nightwatch/*`, `cucumber`, `@cucumber/cucumber`,
   `cucumber-html-reporter`, `cucumber-pretty`** and the custom
   `html-reporter.js`/`.hbs` from `package.json` / `e2e/` once the port is
   verified working end-to-end against a real deployment (not before — the
   Nightwatch suite must stay green until its replacement is proven).

Estimated effort: comparable to authoring a *fresh* e2e harness for this repo
(step 3 dominates), not a config-only swap — this repo's suite is nontrivial
(50 scenarios today). Track as its own workstream; do not fold into future
tag-convention or CI-hygiene passes.

## Run

```bash
npm install
npm run e2e              # default (offline) subset — not @skip and not @cluster
npm run e2e:integration  # @cluster subset — needs the federation remotes served
                          # from their own dev servers (fe-gateway integrated env)
```

## Validate OFFLINE (no cluster, no browser)

```bash
npm install
npx cucumber-js e2e/features --require e2e/step_definitions \
  --tags 'not @skip and not @cluster' --dry-run --format summary
```
