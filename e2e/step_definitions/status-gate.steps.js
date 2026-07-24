'use strict';

/**
 * Step definitions for the ACCOUNT-STATUS APPEAL-GATE banner (status-gate.feature).
 *
 * The banner (src/app/account-status/) renders off the caller's OWN status as
 * read from {@code GET /bff/me} by AccountStatusService — NOT off the seeded
 * hug.session (the additive SnapSession.status field carries no enforcement).
 * The host-only stack has no BFF, so that read 404s and FAILS OPEN to `active`
 * (banner hidden). To drive the suspended/banned states HONESTLY we mock the
 * /bff/me response at the NETWORK level via Chrome DevTools (Nightwatch
 * .mockNetworkResponse): the real HttpClient + AccountStatusService + component
 * pipeline parses a real HTTP response — nothing inside the app is stubbed.
 *
 * Every scenario that registers a /bff/me mock MUST carry @bff-status-mock so
 * the After hook below restores the host-only default (404 -> fail-open active):
 * a CDP network mock outlives the scenario within a webdriver session, and a
 * leaked `suspended` body would bleed a banner into unrelated features.
 */

const { After, Given, Then, When } = require('@cucumber/cucumber');
const assert = require('assert');

/** Same-origin admin-bff own-status endpoint the host re-reads (see
 *  src/app/account-status/account-status.service.ts ME_ENDPOINT). Nightwatch
 *  prefixes launchUrl onto a leading-slash intercept URL, and the CDP match is
 *  EXACT — which is what HttpClient GET '/bff/me' resolves to. */
const ME_PATH = '/bff/me';

/** Register (or overwrite — the CDP mock map is keyed by exact URL) the /bff/me
 *  mock. Register BEFORE the journey's `I go to "/"` reload: the status read
 *  fires once, in StatusGateComponent.ngOnInit. */
async function mockMe(status, body) {
  await browser.mockNetworkResponse(ME_PATH, {
    status,
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

Given(
  /^the BFF reports my account status as "(active|suspended|banned)"$/,
  async function (status) {
    await mockMe(200, JSON.stringify({ status }));
  },
);

Given(
  /^the BFF reports my account status as "(suspended|banned)" with reason "([^"]*)"$/,
  async function (status, reason) {
    await mockMe(200, JSON.stringify({ status, reason }));
  },
);

/** A TIMED suspension: /bff/me carries `until` (ISO instant the curtailment
 *  lifts) alongside the reason. The banner's detail sentence weaves the expiry in
 *  ("…suspended until <date>…") — a path status-gate previously never mocked. */
Given(
  /^the BFF reports my account suspended until "([^"]*)" with reason "([^"]*)"$/,
  async function (until, reason) {
    await mockMe(200, JSON.stringify({ status: 'suspended', until, reason }));
  },
);

/** The fail-open path: a 5xx from /bff/me must degrade to `active` (no banner)
 *  rather than blocking the app or falsely accusing the caller. */
Given('the BFF cannot report my account status', async function () {
  await mockMe(500, '');
});

/** THEN the account-status gate shows the {suspended|banned} banner — the
 *  role="alert" region with the state-specific data-status marker + headline. */
Then(
  /^the account-status gate shows the "(suspended|banned)" banner$/,
  async function (expected) {
    await browser.waitForElementVisible('[data-testid="status-gate"]', 5000);
    const meta = await browser.execute(() => {
      const el = document.querySelector('[data-testid="status-gate"]');
      return el
        ? {
            status: el.getAttribute('data-status'),
            role: el.getAttribute('role'),
            title: (el.querySelector('[data-testid="status-gate-title"]')?.textContent ?? '').trim(),
          }
        : null;
    });
    assert.ok(meta, 'status-gate banner must be present');
    assert.strictEqual(meta.status, expected, `banner must carry data-status="${expected}"`);
    assert.strictEqual(meta.role, 'alert', 'banner must be a role="alert" live region');
    const heading = expected === 'banned' ? 'Your account is banned' : 'Your account is suspended';
    assert.strictEqual(meta.title, heading, `banner headline must read "${heading}"`);
  },
);

/** THEN the account-status banner detail includes {string} — the explanatory
 *  sentence (status-gate-detail). Used to assert the timed-suspension phrasing
 *  ("suspended until") without pinning the locale-formatted date text. */
Then('the account-status banner detail includes {string}', async function (fragment) {
  const text = await browser.execute(
    () => (document.querySelector('[data-testid="status-gate-detail"]')?.textContent ?? '').trim(),
  );
  assert.ok(
    text.includes(fragment),
    `Expected the banner detail to include "${fragment}" but it read "${text}"`,
  );
});

Then('the account-status banner shows the reason {string}', async function (reason) {
  const text = await browser.execute(
    () => (document.querySelector('[data-testid="status-gate-reason"]')?.textContent ?? '').trim(),
  );
  assert.ok(
    text.includes(reason),
    `Expected the banner reason to include "${reason}" but it read "${text}"`,
  );
});

/** THEN the banner offers the appeal route — the real router link to the
 *  login remote's appeal surface (APPEAL_ROUTE in status-gate.component.ts). */
Then('the account-status banner links to the appeal page', async function () {
  const href = await browser.execute(
    () => document.querySelector('a[data-testid="status-gate-appeal"]')?.getAttribute('href') ?? '',
  );
  assert.strictEqual(href, '/login/appeal', `Expected the appeal link href "/login/appeal" but got "${href}"`);
});

When('I dismiss the account-status banner', async function () {
  await browser.waitForElementVisible('[data-testid="status-gate-dismiss"]', 5000);
  await browser.click('[data-testid="status-gate-dismiss"]');
});

Then('the account-status banner is gone', async function () {
  await browser.waitForElementNotPresent('[data-testid="status-gate"]', 5000);
});

/** THEN no account-status banner is shown — the NEGATIVE gate (active / failed
 *  read / anonymous). To keep this honest (not "asserted before the read even
 *  resolved"), we first wait for the shell to be interactive (the nav renders),
 *  then hold the absence over a bounded observation window: the mocked /bff/me
 *  resolves in milliseconds, so a banner that WOULD render has ample time to,
 *  and a single instant sample could not catch a late appearance. */
Then('no account-status banner is shown', async function () {
  await browser.waitForElementVisible('nav', 5000);
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const present = await browser.execute(
      () => !!document.querySelector('[data-testid="status-gate"]'),
    );
    assert.ok(!present, 'Expected NO status-gate banner to render');
    await new Promise((r) => setTimeout(r, 150));
  }
});

/** Restore the host-only default: /bff/me 404s -> AccountStatusService fails
 *  OPEN to active -> no banner. Keyed by the same exact URL, so this overwrites
 *  whatever body the scenario registered. */
After({ tags: '@bff-status-mock' }, async function () {
  await browser.mockNetworkResponse(ME_PATH, {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  });
});
