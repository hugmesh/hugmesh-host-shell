# hugmesh.net — e2e (Nightwatch 3 + Cucumber)

A Gherkin e2e harness for the **host shell**, the top-level federation container
that mounts the role-home and social remotes. It lives in `e2e/features` and
`e2e/step_definitions`, and Nightwatch 3's built-in Cucumber runner drives it
(`nightwatch.conf.js`).

## Framework deviation from the platform convention (KNOWN, TRACKED)

The e2e suites of the other HugMesh UI repos (`admin-ui`, `mod-ui`, `mastodon-ui`,
`matrix-ui`, `user-ui`, `wiki-ui`, `tube-ui`, `owncast-ui`, `login-ui`,
`forum-ui`, `character-studio-ui`, `superadmin-service-catalog-ui`,
`hugmesh-games`) run **Playwright + playwright-bdd**. `bddgen` compiles the `.feature` files into
generated Playwright specs. A `not @cluster` tag filter in `playwright.config.ts`
keeps live-stack-only scenarios out of the default (offline) run. A CI
`e2e:bdd`-style job proves the suite **compiles and is discoverable** (`bddgen` +
`playwright test --list`) without a live cluster.

This repo predates that convention and still runs **Nightwatch 3 +
`@cucumber/cucumber`**. The shape is the same (feature files, step definitions, a
tag-based live/offline split), but the toolchain, the runner and the CI
compile-proof differ. The deviation is intentional and tracked. A full framework
migration is **out of scope for this workstream**: it is too large to land
alongside a tag-convention pass. What follows is the as-is mapping and the scoped
migration plan.

### What Nightwatch+Cucumber gates live-stack-only scenarios with today

- **`@cluster`** (renamed from `@integration` to match the platform-wide tag; same
  semantics) marks every scenario that needs the federation REMOTES served from
  their own dev servers or nginx at the manifest URLs (ports 4203-4206), plus a host
  server with a real SPA fallback. That is an integrated, live environment, not a
  mocked host-only run. Five whole features carry the tag at the `Feature:` level
  (`role-routing.feature`, `role-home-content.feature`,
  `home-announcements.feature`, `appeal-redirect.feature`,
  `home-services-cards.feature`). Three more features tag single scenarios
  (`role-games.feature`, `role-service-grants.feature`,
  `role-change-midsession.feature`). A ninth, `role-authgate.feature`, documents
  the split inline without carrying scenarios that need it.
- **`@skip`** is the manual-skip convention of Nightwatch and Cucumber. It is part
  of the base filter, `not @skip and not @cluster`. Nothing carries it today. Use
  it to disable a scenario for a while without deleting it.
- `@bff-status-mock`, `@capabilities-mock`, `@session-mock`, `@announcements-mock`
  and `@notifications-mock` are **not** live/offline gates. They mark a scenario that
  registers a network-level HTTP mock, so the After-hook restores the default. They
  appear in `status-gate.feature`, `home-services-cards.feature`,
  `role-registration.feature`, `role-change-midsession.feature`,
  `home-announcements.feature` and `notifications-bell-toast.feature`, and are
  orthogonal to the cluster split.
- The filter lives in `nightwatch.conf.js` (`test_runner.options.tags`). It does
  what playwright-bdd's `defineBddConfig({ tags })` does. `npm run e2e` runs the
  default offline subset (`not @skip and not @cluster`). `npm run e2e:integration`
  overrides it with `--tag cluster` to run the live-stack-only set (or, offline,
  to parse it with a dry run).
- The CI `e2e:host` job (`.gitlab-ci.yml`) always runs the default `npm run e2e`
  subset: host-only, no served remotes. That matches the platform posture: the
  offline set runs in CI, and the `@cluster` set is opt-in against a real
  deployment. This repo has no dedicated compile-only job (see below).

### The compile-proof gap

The platform convention's CI job proves the *whole* suite, `@cluster` set
included, compiles and is discoverable without running anything live (`bddgen` +
`playwright test --list`). This repo's `e2e:host` job has no such step. It only
*runs* the default (non-cluster) subset against a real headless Chrome and a built
app. The `@cluster` scenarios get a side-effect check: Cucumber's `require` pass
loads every step definition file whatever scenarios run. But no step proves it, and
no artifact shows that the `@cluster` set parses and every step resolves.

A local equivalent exists in the framework itself. It should become a CI step, in
the real migration or sooner. The `@cucumber/cucumber` CLI supports `--dry-run`,
which parses every `.feature`, resolves every step against `step_definitions` and
reports undefined or ambiguous steps. It needs **no browser, no chromedriver and no
built app**. Run on 2026-10-07:

```bash
npm ci
# Default (offline) subset — mirrors what `npm run e2e` executes:
npx cucumber-js e2e/features --require e2e/step_definitions \
  --tags 'not @skip and not @cluster' --dry-run --format summary
# => 52 scenarios (52 skipped), 457 steps (457 skipped)

# Whole suite, no filter — proves every .feature file compiles:
npx cucumber-js e2e/features --require e2e/step_definitions \
  --dry-run --format summary
# => 83 scenarios (83 skipped), 678 steps (678 skipped)

# @cluster-only subset — mirrors `npm run e2e:integration` (--tag cluster):
npx cucumber-js e2e/features --require e2e/step_definitions \
  --tags '@cluster' --dry-run --format summary
# => 31 scenarios (31 skipped), 221 steps (221 skipped)
```

52 + 31 = 83. The tag partition is exhaustive, and every scenario in every feature
file parses and resolves. The counts grow as scenarios land, so re-run the commands
above instead of trusting these numbers. The `--dry-run` command is a candidate CI
step: an `e2e:host:dry-run` job with no `hugmesh-x86` runner, docker or Chrome
dependency. It is not wired into `.gitlab-ci.yml`. CI changes beyond the tag rename
wait for the migration follow-up below, so this workstream stays a tag-vocabulary
fix and not a CI redesign.

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
3. **Rewrite the step definitions** (`e2e/step_definitions/*.steps.js`) from
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

Estimated effort: about the same as writing a *fresh* e2e harness for this repo,
with step 3 the bulk of it. This is not a config-only swap, and the suite is large
(83 scenarios today). Track it as its own workstream. Do not fold it into future
tag-convention or CI-hygiene passes.

## Run

```bash
npm install
npm run e2e              # default (offline) subset — not @skip and not @cluster
npm run e2e:integration  # @cluster subset — needs the federation remotes served
                          # from their own dev servers (fe-gateway integrated env)
npm run e2e:nginx        # builds the image and runs the nightwatch `nginx` env
                          # against it on :8081 (scripts/e2e-nginx.sh; needs docker)
```

### If `npm run e2e` fails with "session not created" (issue #74)

`package.json` pins a `chromedriver` devDependency, and `npm install` and `npm ci`
install exactly that pin whatever Chrome is on the machine. A chromedriver **major**
bump (dependabot makes these routinely) can land ahead of, or behind, your installed
`google-chrome-stable`. Nightwatch's `chrome` env (`server_path: ''`, meaning "use
whatever `node_modules/chromedriver` resolved to") then launches the mismatched
driver, and the session fails at once:

```
session not created: This version of ChromeDriver only supports Chrome version 153
```

**GitLab CI never hits this.** Its `e2e:host` job runs
`DETECT_CHROMEDRIVER_VERSION=true npm ci`, so the `chromedriver` package's own
install step re-resolves the driver against the Chrome the CI image just installed
and ignores the pin in `package.json`. A local `npm install` or `npm ci` does not
set that variable, so it always takes the bare pin. **This is the one place with no
browser-matching step.**

Measured 2026-09-18 on this box (node v26.8.1 / npm 11.19.0, Chrome 151.0.7922.169;
`chromedriver` was pinned `^153.0.0` then, and `package.json` now pins `^154.0.1`):

```bash
$ npm ci
$ ./node_modules/chromedriver/lib/chromedriver/chromedriver --version
ChromeDriver 153.0.8010.36 (...)        # mismatched — npm run e2e would fail here

$ DETECT_CHROMEDRIVER_VERSION=true npm rebuild chromedriver
$ ./node_modules/chromedriver/lib/chromedriver/chromedriver --version
ChromeDriver 151.0.7922.138 (...)       # now matches the installed Chrome

# and a real WebDriver session against it now succeeds (HTTP 200, a live
# Chrome process attaches) where it would return HTTP 500 ("session not
# created", the WebDriver spec's error status) on the mismatched driver
```

**Fix locally**, same mechanism CI uses:

```bash
# Fresh install (matches the CI command exactly):
DETECT_CHROMEDRIVER_VERSION=true npm ci

# Or, if node_modules already exists and you just want to re-resolve the
# driver without a full reinstall:
DETECT_CHROMEDRIVER_VERSION=true npm rebuild chromedriver
```

Then re-run `npm run e2e` / `npm run e2e:integration` as usual.

`DETECT_CHROMEDRIVER_VERSION=true` is **not** set repo-wide (for example in
`.npmrc`), because the `Dockerfile` build stage also copies `.npmrc`
(`COPY package*.json .npmrc ./`) and has no Chrome to detect. That is why this stays
a documented local command and not a blanket config change. Issue #74 tracks the
option to revisit that decision.

## Validate OFFLINE (no cluster, no browser)

```bash
npm install
npx cucumber-js e2e/features --require e2e/step_definitions \
  --tags 'not @skip and not @cluster' --dry-run --format summary
```
