'use strict';

/**
 * Step definitions for the ROLE-BASED host-shell journeys (authgate, role-home
 * routing, the universal nav + its role-gated entries, the profile modal, the nav
 * swap and sign-out). These complement basic.steps.js (which already defines the
 * shared `I go to {string}` + nav/title steps reused here).
 *
 * Driving the role WITHOUT a real Casdoor: every journey SEEDS localStorage under
 * the canonical "hug.session" key the login remote writes (see SessionService).
 * The host's SessionService reads that key on construction and on the
 * "snap-session-change" / cross-tab "storage" events, deriving the admin > mod >
 * user role signals the guards + nav read. So a JWT-shaped object with the right
 * roles[] is all the host needs to behave as that role — no remote auth server.
 *
 * SCOPE — these assert what the HOST shell controls: the resolved route/URL, the
 * nav state (which entries are present/gated), the page landmarks, the modal
 * focus contract and the session lifecycle. The role-home/social CONTENT itself is
 * a native-federation REMOTE served from its own dev server (manifest ports
 * 4203-4206); those servers are NOT up in a host-only run, so the remote's
 * rendered markup is asserted only in the @cluster features (skipped by
 * default — see role-home-content.feature) which require the integrated env.
 */

const { After, Before, Given, Then, When } = require('@cucumber/cucumber');
const assert = require('assert');

const SESSION_KEY = 'hug.session';

/** A JWT-shaped SnapSession carrying the roles[] the SessionService derives from.
 *  Matches the SnapSession contract (id/label/provider/roles/bffToken/…). The
 *  bffToken is a cosmetic three-segment JWT string — the host never verifies it,
 *  it only reads roles[] — so this is enough to drive the role end to end. */
function sessionFor(role) {
  const roles = {
    // A superadmin fixture carries the WHOLE cascade (SUPERADMIN > ADMIN > MOD >
    // USER): the platform delivers the cascade as lowercase role strings in
    // session.roles[], so a real superadmin session holds 'admin' and 'mod' too.
    // isSuperadmin() additionally unlocks the service consoles (wiki/owncast/tube)
    // even where isAdmin() alone would; role precedence still lands on /admin
    // (SessionService.role() resolves admin > mod > user).
    superadmin: ['superadmin', 'admin', 'mod', 'user'],
    // An admin fixture carries the mod role too: in this shell the Moderation
    // entry is gated on isMod() (roles includes 'mod'), so a full-privilege admin
    // who should see BOTH Admin and Moderation must hold 'mod'. Role precedence
    // (admin > mod > user) still resolves the role-home to /admin.
    admin: ['admin', 'mod', 'user'],
    mod: ['mod', 'user'],
    user: ['user'],
    // GAMES tiers (Phase 8/10). isGamesAdmin() is the DERIVED role
    // ROLE_GAMES ∩ (ROLE_ADMIN ∪ ROLE_MOD) — never granted directly — so a
    // games-admin fixture holds 'games' TOGETHER WITH 'mod'. A bare 'games'
    // member holds only 'games' (+ the baseline 'user'), so it must NOT earn the
    // games-admin tier (default-deny; see SessionService.isGamesAdmin).
    'games-admin': ['games', 'mod', 'user'],
    games: ['games', 'user'],
  }[role];
  assert.ok(roles, `Unknown role "${role}" (expected superadmin | admin | mod | user | games-admin | games)`);
  return {
    id: `e2e:${role}@hugmesh.test`,
    label: `${role}@hugmesh.test`,
    provider: 'google',
    roles,
    // A syntactically-shaped JWT (header.payload.signature); never verified host-side.
    bffToken: `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ roles })).toString('base64url')}.sig`,
    // Fully registered so the Mastodon/Matrix nav entries are enabled (registeredGuard).
    registrationComplete: true,
    matrix: { token: 'e2e-matrix', userId: `@${role}:hugmesh.test` },
    mastodon: { token: 'e2e-mastodon' },
  };
}

Before(async function () {
  this.browser = browser;
});

/** Seed (or clear) the hug.session localStorage key, then notify the in-page
 *  SessionService instances to re-read.
 *
 *  NOTE on serving: the host's e2e server (server.js / nginx) serves index.html
 *  only at the ROOT path — deep links (/login, /admin, …) 404 server-side with no
 *  SPA fallback — so we always land on '/' to get a same-origin app document the
 *  localStorage write can target. After seeding, the journey's `I go to "/"`
 *  reloads '/' and the freshly-constructed SessionService reads the seed. */
async function seedSession(session) {
  const cur = await browser.execute(() => window.location.href);
  if (!cur || cur.indexOf('http') !== 0) {
    await browser.navigateTo(browser.launchUrl + '/');
    await browser.waitForElementVisible('body', 5000);
  }
  await browser.execute(
    (key, value) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      // Broadcast so any already-constructed SessionService re-reads immediately.
      window.dispatchEvent(new Event('snap-session-change'));
    },
    [SESSION_KEY, session === null ? null : JSON.stringify(session)],
  );
}

/** GIVEN I have a/an {admin|mod|user} session — seed the JWT-shaped session BEFORE
 *  the journey navigates, so SessionService derives that role for the guards/nav.
 *  The optional a/an article keeps the Gherkin natural ("an admin", "a mod"). */
Given(/^I have an? (superadmin|admin|mod|user|games-admin|games) session$/, async function (role) {
  await seedSession(sessionFor(role));
});

/** GIVEN I have a {role} session with the {service} service grant — seed the base
 *  role fixture PLUS an additional PER-SERVICE access role (ROLE_WIKI / ROLE_TUBE
 *  / ROLE_OWNCAST). These per-service grants are siblings of the cascade tiers: a
 *  MOD granted ROLE_WIKI reaches the Wiki console the cascade alone would not, a
 *  plain USER granted ROLE_TUBE reaches Tube, etc. (SessionService.hasRole, the
 *  case-insensitive per-service check the menu + guards read). The base fixture
 *  (sessionFor) hardcodes only the four cascade role sets, so this step is what
 *  lets a scenario express the grant-based ALLOW side. */
Given(
  /^I have an? (superadmin|admin|mod|user) session with the "([^"]+)" service grant$/,
  async function (role, grant) {
    const session = sessionFor(role);
    // Store the grant as the lowercase in-session role string the login remote
    // persists; hasRole() matches case-insensitively on either form.
    session.roles = [...session.roles, grant.toLowerCase()];
    await seedSession(session);
  },
);

/** GIVEN I have a pending user session — an authenticated identity that has NOT
 *  completed registration (registrationComplete:false). Registration is what
 *  mints the per-service Matrix/Mastodon tokens, so the pending fixture carries
 *  none — matching the real pre-registration SnapSession the login remote writes.
 *  Drives the registeredGuard / menu enabled() gating (role-registration.feature). */
Given('I have a pending user session', async function () {
  const session = sessionFor('user');
  session.registrationComplete = false;
  delete session.matrix;
  delete session.mastodon;
  await seedSession(session);
});

/** GIVEN I have no session — explicitly clear the key (the anonymous authgate). */
Given('I have no session', async function () {
  await seedSession(null);
});

/** GIVEN I have a/an {suspended|banned} {role} session — seed a role session
 *  that ALSO carries a curtailed `status` (SnapSession.status, the field
 *  AccountStatusService syncs from the authoritative /bff/me read — see
 *  session.service.ts). Drives roleHomeGuard's short-circuit
 *  (guards/role-home.guard.ts): session.curtailed() reads THIS field
 *  synchronously, so seeding it directly (rather than mocking /bff/me, which
 *  only resolves asynchronously AFTER the guard has already redirected) is the
 *  only way to exercise the short-circuit itself end to end — see
 *  appeal-redirect.feature. Any role may be curtailed; the guard fires BEFORE
 *  the role redirect regardless of privilege (guards.spec.ts covers this at
 *  the unit level; this is the same contract exercised through real routing). */
Given(
  /^I have an? (suspended|banned) (superadmin|admin|mod|user) session$/,
  async function (status, role) {
    const session = sessionFor(role);
    session.status = status;
    await seedSession(session);
  },
);

/** WHEN my account status is restored to active — simulates the admin lifting
 *  the access-role suspension (hugmesh-admin-ui's Delegation "Lift" action)
 *  and the host re-syncing off the next authoritative `/bff/me` read
 *  (AccountStatusService.fetch patches SnapSession.status on change). Patches
 *  the ALREADY-SEEDED session in place (same id/roles), matching the real
 *  sync path: the user's identity/roles are unchanged, only status flips. */
When('my account status is restored to active', async function () {
  const cur = await browser.execute(
    (key) => localStorage.getItem(key),
    [SESSION_KEY],
  );
  assert.ok(cur, 'expected an existing seeded session to restore');
  const session = JSON.parse(cur);
  session.status = 'active';
  await seedSession(session);
});

/** Wait for Angular's router to settle on a path. Polls window.location.pathname
 *  because the route resolves client-side after the guard redirect chain. */
async function waitForPath(expected, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let actual = '';
  while (Date.now() < deadline) {
    actual = await browser.execute(() => window.location.pathname);
    if (actual === expected) return actual;
    await new Promise((r) => setTimeout(r, 100));
  }
  return actual;
}

/** THEN I am redirected to {string} / THEN the URL path is {string} — assert the
 *  host resolved the route (the authgate redirect or the role-home landing). */
Then('the URL path is {string}', async function (expected) {
  const actual = await waitForPath(expected);
  assert.strictEqual(actual, expected, `Expected to land on "${expected}" but URL path was "${actual}"`);
});

Then('I am redirected to {string}', async function (expected) {
  const actual = await waitForPath(expected);
  assert.strictEqual(actual, expected, `Expected redirect to "${expected}" but URL path was "${actual}"`);
});

/* --- The SIGNED-IN refusal landing (guards/role-guard.factory.ts) -------------
 * roleGuard sends a signed-in caller who lacks a role to /home?denied=<attempted
 * path>, so the landing can say WHICH console was refused; /login is reserved
 * for the ANONYMOUS visitor, who has a credential to supply. Answering an
 * authorization failure with /login tells a user who just signed in that they
 * are not signed in (operator report 2026-08-14; issue #88 for the two games
 * guards that kept doing it). Wording mirrors the generator's mined-identity
 * steps so the two layers read alike. */

/** THEN the URL carries a denied query naming {string} — polls, because the
 *  query lands through the same client-side redirect chain the path does. */
Then('the URL carries a denied query naming {string}', async function (attempted) {
  const deadline = Date.now() + 6000;
  let actual = null;
  while (Date.now() < deadline) {
    actual = await browser.execute(() => new URLSearchParams(window.location.search).get('denied'));
    if (actual === attempted) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const href = await browser.execute(() => window.location.href);
  assert.strictEqual(actual, attempted, `Expected ?denied=${attempted} but the URL was "${href}"`);
});

/** THEN the denied notice is visible — the landing must EXPLAIN the refusal
 *  (home/denied-notice.component.ts), not merely be somewhere else. Asserts the
 *  notice is DRAWN, not just present in the DOM: a box that starts inside the
 *  viewport, at least a sentence wide and a line tall. Measured 2026-09-30 in the
 *  1280x1024 e2e window the alert spans the home container at 1114x86px, so the
 *  floors below catch a collapsed, hidden or off-screen rendering without
 *  pinning the layout. */
Then('the denied notice is visible', async function () {
  await browser.waitForElementVisible('[data-testid="denied-notice"]', 6000);
  const box = await browser.execute(() => {
    const el = document.querySelector('[data-testid="denied-notice"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
  assert.ok(box, 'denied notice must be in the DOM');
  assert.ok(box.width >= 320, `denied notice must be at least 320px wide, got ${box.width}px`);
  assert.ok(box.height >= 40, `denied notice must be at least 40px tall, got ${box.height}px`);
  assert.ok(
    box.x >= 0 && box.x < box.viewportW && box.y >= 0 && box.y < box.viewportH,
    `denied notice must start inside the viewport, got (${box.x}, ${box.y}) in ${box.viewportW}x${box.viewportH}`,
  );
  assert.ok(/was not available/.test(box.text), `denied notice must name the refused console, got "${box.text}"`);
});

/** THEN the navigation does/does not contain a {testid} entry — the role-gating
 *  invariant at the UI level. Looks up by the stable data-testid the nav renders. */
Then('the navigation has a {string} entry', async function (testid) {
  // Poll: after `I go to "/"` the host attempts the role-home loadChildren, which
  // fails without the remote served and can leave the menu transiently re-rendering.
  // Wait for the entry to settle rather than sampling once.
  const deadline = Date.now() + 5000;
  let present = false;
  while (Date.now() < deadline) {
    present = await browser.execute(
      (id) => !!document.querySelector(`[data-testid="${id}"]`),
      [testid],
    );
    if (present) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(present, `Expected a nav entry with data-testid="${testid}"`);
});

Then('the navigation has no {string} entry', async function (testid) {
  const present = await browser.execute(
    (id) => !!document.querySelector(`[data-testid="${id}"]`),
    [testid],
  );
  assert.ok(!present, `Expected NO nav entry with data-testid="${testid}"`);
});

/* --- Universal-nav ENABLED/DISABLED state (registration + install-state gates) ---
 * The menu renders an entry as a real routerLink <a> when enabled() and as a
 * disabled <button aria-disabled="true" disabled> with a visible .field-help
 * reason ("<testid>-help", wired via aria-describedby) when gated — visible but
 * greyed + EXPLAINED, never hidden and never a dead link (menu.component.ts). */

/** Poll for the entry to settle as the given TAG (the menu re-renders while the
 *  capability fetch and the role-home loadChildren resolve). */
async function waitForNavEntryTag(testid, tag, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let actual = '';
  while (Date.now() < deadline) {
    actual = await browser.execute(
      (id) => document.querySelector(`[data-testid="${id}"]`)?.tagName ?? '',
      [testid],
    );
    if (actual === tag) return actual;
    await new Promise((r) => setTimeout(r, 100));
  }
  return actual;
}

/** THEN the {testid} nav entry is an enabled link — a real anchor with an href
 *  (the routerLink), i.e. NOT the disabled-button rendering. */
Then('the {string} nav entry is an enabled link', async function (testid) {
  const tag = await waitForNavEntryTag(testid, 'A');
  assert.strictEqual(tag, 'A', `Expected "${testid}" to render as an enabled <a> routerLink but got <${tag || 'nothing'}>`);
  const href = await browser.execute(
    (id) => document.querySelector(`a[data-testid="${id}"]`)?.getAttribute('href') ?? '',
    [testid],
  );
  assert.ok(href.length > 0, `Expected the enabled "${testid}" link to carry an href`);
});

/** THEN the {testid} nav entry is disabled — the gated rendering: a real
 *  <button> that is BOTH natively disabled and aria-disabled (grey + inert). */
Then('the {string} nav entry is disabled', async function (testid) {
  const tag = await waitForNavEntryTag(testid, 'BUTTON');
  assert.strictEqual(tag, 'BUTTON', `Expected "${testid}" to render as a disabled <button> but got <${tag || 'nothing'}>`);
  const state = await browser.execute(
    (id) => {
      const el = document.querySelector(`button[data-testid="${id}"]`);
      return el ? { ariaDisabled: el.getAttribute('aria-disabled'), disabled: el.disabled } : null;
    },
    [testid],
  );
  assert.ok(state, `Expected a nav entry with data-testid="${testid}"`);
  assert.strictEqual(state.ariaDisabled, 'true', `"${testid}" must be aria-disabled="true"`);
  assert.strictEqual(state.disabled, true, `"${testid}" must be natively disabled`);
});

/** THEN the {testid} nav entry's helptext is {string} — the visible .field-help
 *  reason ("<testid>-help") explaining WHY the entry is disabled. Asserting the
 *  EXACT text distinguishes the registration gate ("Complete your registration…")
 *  from the install-state gate ("…not available on this deployment."). */
Then('the {string} nav entry explains {string}', async function (testid, expected) {
  const deadline = Date.now() + 5000;
  let text = '';
  while (Date.now() < deadline) {
    text = await browser.execute(
      (id) => (document.querySelector(`[data-testid="${id}-help"]`)?.textContent ?? '').trim(),
      [testid],
    );
    if (text === expected) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.strictEqual(text, expected, `Expected the "${testid}" helptext to read "${expected}" but got "${text}"`);
});

/* --- Federation install-state (public /api/federation/capabilities) mock ---
 * The host-only stack has no federation-api, so the capability fetch 404s and
 * EVERY optional service greys out by absence — which masks the REGISTRATION
 * gate this suite must isolate. These steps mock the PUBLIC capabilities read at
 * the network level via Chrome DevTools (Nightwatch .mockNetworkResponse), so
 * the real CapabilitiesService parses a real HTTP response — nothing in the app
 * is stubbed. Scenarios using this MUST carry @capabilities-mock so the After
 * hook below restores the 404 default (the CDP mock outlives a scenario within
 * a webdriver session). */

const CAPABILITIES_PATH = '/api/federation/capabilities';

Given(
  'the deployment reports the {string} and {string} services installed',
  async function (slugA, slugB) {
    await browser.mockNetworkResponse(CAPABILITIES_PATH, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { slug: slugA, installed: true },
        { slug: slugB, installed: true },
      ]),
    });
  },
);

/** Restore the host-only default (a failing capabilities read -> everything
 *  greys out by absence) so a leaked mock can never bleed install-state into a
 *  later scenario that asserts the degrade path. */
After({ tags: '@capabilities-mock' }, async function () {
  await browser.mockNetworkResponse(CAPABILITIES_PATH, {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  });
});

/* --- Account region (the authgate signal the HOST renders WITHOUT a remote) ---
 * The role-home/login routes are federation remotes whose loadChildren can't
 * resolve in a host-only run, so the URL never advances past '/'. What the host
 * DOES render from the session alone is the nav account region: anonymous shows a
 * "Sign in" link (nav-login); an authenticated identity shows the profile trigger.
 * These steps assert that session-driven authgate signal host-side; the actual
 * URL redirect is covered in the @cluster features. */

Then('the account region shows the sign-in affordance', async function () {
  await browser.waitForElementVisible('[data-testid="nav-login"]', 5000);
  const anon = await browser.execute(
    () =>
      !!document.querySelector('[data-testid="nav-login"]') &&
      !document.querySelector('[data-testid="profile-trigger"]'),
  );
  assert.ok(anon, 'anonymous session should show the Sign in link and no profile trigger');
});

Then('the account region shows the signed-in profile menu', async function () {
  await browser.waitForElementVisible('[data-testid="profile-trigger"]', 5000);
  const authed = await browser.execute(
    () =>
      !!document.querySelector('[data-testid="profile-trigger"]') &&
      !document.querySelector('[data-testid="nav-login"]'),
  );
  assert.ok(authed, 'authenticated session should show the profile trigger and no Sign in link');
});

/** WHEN I open the profile menu — click the aria-haspopup trigger. */
When('I open the profile menu', async function () {
  await browser.waitForElementVisible('[data-testid="profile-trigger"]', 5000);
  await browser.click('[data-testid="profile-trigger"]');
  await browser.waitForElementVisible('#profile-menu-list', 5000);
});

/** WHEN I open the profile menu with the keyboard — focus the trigger and press
 *  Enter on it. The trigger is a real <button>, so an Enter key event activates
 *  its native click — this exercises the keyboard-open path, not a synthetic
 *  click. sendKeys targets the element directly (more reliable across drivers
 *  than dispatching to whatever the session believes is the active element). */
When('I open the profile menu with the keyboard', async function () {
  await browser.waitForElementVisible('[data-testid="profile-trigger"]', 5000);
  await browser.execute(() => {
    document.querySelector('[data-testid="profile-trigger"]').focus();
  });
  await browser.sendKeys('[data-testid="profile-trigger"]', [browser.Keys.ENTER]);
  await browser.waitForElementVisible('#profile-menu-list', 5000);
});

Then('the profile menu is open', async function () {
  await browser.waitForElementVisible('#profile-menu-list', 5000);
  const expanded = await browser.execute(
    () => document.querySelector('[data-testid="profile-trigger"]')?.getAttribute('aria-expanded'),
  );
  assert.strictEqual(expanded, 'true', 'profile trigger should be aria-expanded=true');
});

Then('the profile menu contains {string}', async function (testid) {
  const present = await browser.execute(
    (id) => !!document.querySelector(`#profile-menu-list [data-testid="${id}"]`),
    [testid],
  );
  assert.ok(present, `Expected the profile menu to contain an item with data-testid="${testid}"`);
});

Then('the profile menu does not contain {string}', async function (testid) {
  const present = await browser.execute(
    (id) => !!document.querySelector(`#profile-menu-list [data-testid="${id}"]`),
    [testid],
  );
  assert.ok(!present, `Expected the profile menu NOT to contain an item with data-testid="${testid}"`);
});

/** WHEN I activate Profile — click the Profile item (opens the modal). */
When('I activate the {string} menu item', async function (testid) {
  await browser.waitForElementVisible(`[data-testid="${testid}"]`, 5000);
  await browser.click(`[data-testid="${testid}"]`);
});

/** PROFILE MODAL — role=dialog + aria-modal + focus moved INTO the dialog. */
Then('the profile modal is open', async function () {
  await browser.waitForElementVisible('[data-testid="profile-modal"]', 5000);
  const meta = await browser.execute(() => {
    const d = document.querySelector('[data-testid="profile-modal"]');
    return d
      ? { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal') }
      : null;
  });
  assert.ok(meta, 'profile modal element must be present');
  assert.strictEqual(meta.role, 'dialog', 'modal must be role="dialog"');
  assert.strictEqual(meta.modal, 'true', 'modal must be aria-modal="true"');
});

Then('focus is trapped inside the profile modal', async function () {
  // Poll: focus moves into the dialog from a queued microtask after the remote
  // load settles (it runs in the load promise's .finally), so allow a beat.
  const deadline = Date.now() + 4000;
  let inside = false;
  while (Date.now() < deadline) {
    inside = await browser.execute(() => {
      const dialog = document.querySelector('[data-testid="profile-modal"]');
      const active = document.activeElement;
      return !!dialog && (dialog === active || dialog.contains(active));
    });
    if (inside) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(inside, 'focus should be inside the profile modal after open');
});

/** WHEN I press Escape in the modal — dismiss the dialog. */
When('I press Escape in the profile modal', async function () {
  await browser.execute(() => {
    const dialog = document.querySelector('[data-testid="profile-modal"]');
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  });
});

Then('the profile modal is closed', async function () {
  await browser.waitForElementNotPresent('[data-testid="profile-modal"]', 5000);
});

/** THEN focus is released from the dialog. The modal restores focus to whatever
 *  opened it (onClose -> lastFocused.focus()); the opener here is the Profile
 *  menu ITEM, which the dropdown removed when it closed on activation, so the
 *  restore lands on <body> rather than the trigger. The WCAG 2.4.3 contract this
 *  asserts host-side is the one the host can keep without the now-detached opener:
 *  focus is no longer TRAPPED inside the (removed) dialog. */
Then('focus is released from the profile modal', async function () {
  const deadline = Date.now() + 3000;
  let released = false;
  while (Date.now() < deadline) {
    released = await browser.execute(() => {
      const dialog = document.querySelector('[data-testid="profile-modal"]');
      // Dialog gone => not trapped; if still present, focus must be outside it.
      return !dialog || !dialog.contains(document.activeElement);
    });
    if (released) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(released, 'focus should be released from the dialog after it closes');
});

/** WHEN I select the {Home|Mastodon|Matrix} nav entry — the universal-nav swap. */
When('I select the {string} nav entry', async function (testid) {
  await browser.waitForElementVisible(`[data-testid="${testid}"]`, 5000);
  await browser.click(`[data-testid="${testid}"]`);
});

/** THEN the {testid} nav entry is active — routerLinkActive marks the current. */
Then('the {string} nav entry is active', async function (testid) {
  const deadline = Date.now() + 4000;
  let active = false;
  while (Date.now() < deadline) {
    active = await browser.execute(
      (id) => document.querySelector(`[data-testid="${id}"]`)?.classList.contains('active') ?? false,
      [testid],
    );
    if (active) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(active, `Expected the nav entry "${testid}" to be marked active (routerLinkActive)`);
});

/** WHEN I sign out — open the menu then activate Sign out. */
When('I sign out', async function () {
  await browser.waitForElementVisible('[data-testid="profile-trigger"]', 5000);
  await browser.click('[data-testid="profile-trigger"]');
  await browser.waitForElementVisible('[data-testid="menu-logout"]', 5000);
  await browser.click('[data-testid="menu-logout"]');
});

Then('the session is cleared', async function () {
  const raw = await browser.execute(
    (key) => localStorage.getItem(key),
    [SESSION_KEY],
  );
  assert.strictEqual(raw, null, 'hug.session should be removed after sign out');
});

/* ------------------------------------------------------------------------- *
 * @cluster-only steps. These assert the federation REMOTE's RENDERED
 * content (the role-home page, the profile editor) — which only exists when the
 * remote dev servers are up at the manifest URLs (ports 4203-4206). They are
 * referenced solely by role-home-content.feature (@cluster), excluded from
 * the default host-only run; running them without the remotes up fails by design
 * (see the feature's HONEST DEFERRAL note).
 * ------------------------------------------------------------------------- */

/** Poll until the routed remote actually populated the page landmark. The host
 *  renders nothing at #maincontent itself for a role-home (the remote owns it), so
 *  non-trivial content here proves the remote mounted. */
Then('the role-home remote content eventually renders in {string}', async function (selector) {
  await browser.waitForElementVisible(selector, 15000);
  const deadline = Date.now() + 15000;
  let text = '';
  while (Date.now() < deadline) {
    text = await browser.execute(
      (sel) => (document.querySelector(sel)?.textContent || '').trim(),
      [selector],
    );
    if (text.length > 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(
    text.length > 0,
    `Expected the role-home remote to render content into "${selector}" (needs the remote dev server up)`,
  );
});

/** Poll until the modal body shows the remote profile editor (not the loading /
 *  empty state). Requires the user remote's ./profile module to load. */
Then('the profile modal body eventually renders the remote profile editor', async function () {
  const deadline = Date.now() + 15000;
  let rendered = false;
  while (Date.now() < deadline) {
    rendered = await browser.execute(() => {
      const body = document.querySelector('[data-testid="profile-modal"] .profile-modal__body');
      if (!body) return false;
      // Loading or error placeholders mean the remote has NOT rendered yet.
      if (body.querySelector('[data-testid="profile-modal-loading"]')) return false;
      if (body.querySelector('[data-testid="profile-modal-error"]')) return false;
      // The remote mounted via ngComponentOutlet -> a rendered host element.
      return (body.textContent || '').trim().length > 0;
    });
    if (rendered) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(
    rendered,
    'Expected the modal body to mount the user remote profile editor (needs the user remote dev server up)',
  );
});
