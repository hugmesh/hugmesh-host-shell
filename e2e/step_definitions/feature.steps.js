'use strict';

/**
 * Step definitions for the newer host-owned surfaces whose cross-user /
 * mid-session behaviour the existing role suites did not reach:
 *
 *  - MID-SESSION role change via the authoritative GET /bff/session hydrate
 *    (SessionService.hydrate re-reads roles on every snap-session-change), so a
 *    role granted/revoked while a user is browsing is picked up WITHOUT a
 *    re-login — the host's most consequential multi-user behaviour.
 *  - The NOTIFICATION BELL unread badge (60s poll of /bff/user/notifications) and
 *    the live SSE TOAST pipeline (/bff/user/notifications/events).
 *  - The GAMES remote mounts (the host asking for the 'games' remoteEntry).
 *  - The HOME ANNOUNCEMENTS banner (GET /bff/announcements/home) rendered in
 *    sandboxed null-origin srcdoc iframes.
 *
 * All state is driven by mocking the relevant BFF endpoint at the NETWORK level
 * via Chrome DevTools (Nightwatch .mockNetworkResponse) — the REAL service +
 * component pipeline parses a real HTTP response; nothing in the app is stubbed.
 * Scenarios registering a mock carry a @<endpoint>-mock tag so the matching After
 * hook restores the host-only default (a failing read) and no mock bleeds into a
 * later scenario. These COMPLEMENT role.steps.js / status-gate.steps.js (which
 * own the session seed + the /bff/me + capabilities mocks) — reused here.
 */

const { After, Given, Then, When } = require('@cucumber/cucumber');
const assert = require('assert');

/* --- Mid-session role change: the authoritative GET /bff/session hydrate ------ *
 * SessionService.hydrate() re-reads GET /bff/session on boot AND on every
 * snap-session-change broadcast, mapping the authoritative roles[] into the
 * in-memory session signal (WITHOUT touching the localStorage mirror). Every
 * OTHER suite relies on this read FAILING (404 host-only) so the localStorage
 * seed survives; THIS suite mocks a 200 so a role granted/revoked mid-session is
 * reflected reactively — the menu updates and the next role-home redirect
 * follows the NEW roles, all without a re-login.
 */

const SESSION_PATH = '/bff/session';

/** GIVEN the BFF session reports roles "<a,b,c>" — mock GET /bff/session with the
 *  authoritative roles the hydrate re-read will apply. id is a stable non-empty
 *  identity (hydrate rejects an empty id); registrationComplete stays true so the
 *  social nav gating is unchanged by the role flip. */
Given(/^the BFF session reports roles "([^"]*)"$/, async function (rolesCsv) {
  const roles = rolesCsv
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  await browser.mockNetworkResponse(SESSION_PATH, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'e2e:hydrated@hugmesh.test',
      roles,
      registrationComplete: true,
    }),
  });
});

/** WHEN the session-change broadcast fires — dispatch the same snap-session-change
 *  event a sibling in-page SessionService (or a login/registration completion)
 *  raises. The host's constructor listener re-runs hydrate(), which now reads the
 *  mocked /bff/session and updates the in-memory session signal. The reactive
 *  menu/guard re-evaluation is asserted by the polling steps below (hydrate is
 *  async, so a single instant sample would race the fetch). */
When('the session-change broadcast fires', async function () {
  await browser.execute(() => {
    window.dispatchEvent(new Event('snap-session-change'));
  });
});

/** Restore the host-only default so a leaked /bff/session 200 can't survive into a
 *  later scenario (whose SessionService boot-hydrate would then adopt these roles
 *  instead of its own seed). 404 -> hydrate falls back to the localStorage mirror. */
After({ tags: '@session-mock' }, async function () {
  await browser.mockNetworkResponse(SESSION_PATH, {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  });
});

/* --- Reactive (polling) profile-menu assertions ------------------------------ *
 * The plain "profile menu contains / does not contain" steps (role.steps.js)
 * sample once — correct for a menu whose contents are already settled. A
 * mid-session hydrate flips the roles ASYNCHRONOUSLY (a real fetch), and the
 * OPEN menu re-renders reactively off the session signal, so these EVENTUALLY
 * variants poll the open list until it reflects the new roles. They assert on the
 * open #profile-menu-list, so a closed menu can never make them vacuously pass.
 */

async function menuHasItem(testid) {
  return browser.execute(
    (id) => !!document.querySelector(`#profile-menu-list [data-testid="${id}"]`),
    [testid],
  );
}

Then('the profile menu eventually contains {string}', async function (testid) {
  const deadline = Date.now() + 5000;
  let present = false;
  while (Date.now() < deadline) {
    present = await menuHasItem(testid);
    if (present) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(present, `Expected the open profile menu to eventually contain "${testid}" (mid-session hydrate)`);
});

Then('the profile menu eventually does not contain {string}', async function (testid) {
  const deadline = Date.now() + 5000;
  let present = true;
  while (Date.now() < deadline) {
    present = await menuHasItem(testid);
    if (!present) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(!present, `Expected the open profile menu to eventually DROP "${testid}" (mid-session hydrate)`);
});

/* --- GAMES remote mounts (cross-repo contract 2026-10-28) -------------------- *
 * /games and /games/admin are REAL mounts of the single 'games' federated remote
 * (REMOTE_ROUTES rows: path 'games' -> './routes' GAMES_ROUTES, path
 * 'games/admin' -> './admin-routes' GAMES_ADMIN_ROUTES). Host-only there is no
 * way to serve or stub a remote (every remote-content scenario is @cluster), so
 * the observable contract here is the host ASKING for the remote's entry at the
 * prod-manifest URL once the guard admits the member: the deferred loader
 * (federation/remote-loader.ts) fetches '/games/remoteEntry.json' only when the
 * route is actually entered, so seeing that request proves (a) the guard let the
 * role through and (b) the route resolved to the 'games' remote row. Captured at
 * the network level via Chrome DevTools (Nightwatch .captureNetworkRequests).
 */

/** Requests captured since the last "I start capturing network requests". */
let capturedRequestUrls = [];

Given('I start capturing network requests', async function () {
  capturedRequestUrls = [];
  await browser.captureNetworkRequests((requestParams) => {
    const url = requestParams && requestParams.request && requestParams.request.url;
    if (url) capturedRequestUrls.push(url);
  });
});

/** THEN the host requests the games remote entry at {path} — polls the capture
 *  for a request whose pathname is EXACTLY the contract path (the prod manifest's
 *  'games' row). A 404 answer is expected host-only; the request is the proof. */
Then('the host requests the games remote entry at {string}', async function (expectedPath) {
  const deadline = Date.now() + 8000;
  let hit = null;
  while (Date.now() < deadline) {
    hit = capturedRequestUrls.find((u) => {
      try { return new URL(u).pathname === expectedPath; } catch { return false; }
    }) ?? null;
    if (hit) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(
    hit,
    `Expected the host to request the games remote entry at "${expectedPath}" after activating the mount; ` +
      `captured ${capturedRequestUrls.length} request(s): ${capturedRequestUrls.slice(0, 20).join(', ')}`,
  );
});

/** @cluster-only: poll until the games remote populated the given testid (the
 *  remote's own M1 'games-catalog' / A0 'games-admin-shell' landmarks). Needs the
 *  games remote served at the manifest URL; host-only it fails by design. */
Then('the games remote eventually renders {string}', async function (testid) {
  const deadline = Date.now() + 15000;
  let present = false;
  while (Date.now() < deadline) {
    present = await browser.execute(
      (id) => !!document.querySelector(`[data-testid="${id}"]`),
      [testid],
    );
    if (present) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(present, `Expected the games remote to render [data-testid="${testid}"] (needs the games remote served)`);
});

/* --- Notification bell unread badge (poll of /bff/user/notifications) --------- */

const NOTIFICATIONS_PATH = '/bff/user/notifications';

/** GIVEN the BFF reports {int} unread notifications — mock the bell's poll
 *  endpoint with that many unread rows (readAt:null == unread; the badge counts
 *  them). BellNotificationsService starts polling on login (timer 0), so the
 *  first poll after the next '/' load hits this mock. */
Given(/^the BFF reports (\d+) unread notifications$/, async function (count) {
  const n = Number(count);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: `n${i}`, readAt: null });
  await browser.mockNetworkResponse(NOTIFICATIONS_PATH, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  });
});

/** THEN the notification bell badge shows {string} — the visible .bell-badge text
 *  (99+ capped in the component) plus a bounded poll (the badge appears after the
 *  first poll resolves). Also asserts the screen-reader count text is present. */
Then('the notification bell badge shows {string}', async function (expected) {
  const deadline = Date.now() + 6000;
  let text = '';
  while (Date.now() < deadline) {
    text = await browser.execute(
      () => (document.querySelector('.bell-badge')?.textContent ?? '').trim(),
    );
    if (text === expected) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.strictEqual(text, expected, `Expected the bell badge to read "${expected}" but got "${text}"`);
  const srText = await browser.execute(
    () => (document.querySelector('.bell-badge + .visually-hidden')?.textContent ?? '').trim(),
  );
  assert.ok(
    /unread notification/.test(srText),
    `Expected a visually-hidden unread count for screen readers but got "${srText}"`,
  );
});

After({ tags: '@notifications-mock' }, async function () {
  await browser.mockNetworkResponse(NOTIFICATIONS_PATH, {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  });
});

/* --- Live SSE notification toast (/bff/user/notifications/events) ------------- */

const NOTIFICATIONS_EVENTS_PATH = '/bff/user/notifications/events';

/** GIVEN the BFF streams a notification toast titled {string} — mock the SSE
 *  endpoint with a single `data:{json}` frame. NOTE the DELIBERATE no-space after
 *  `data:` — Spring WebFlux's SSE writer emits exactly this, and the parser
 *  (notification-toast.service.ts parseSseField) was fixed to accept it; a stray
 *  `data: ` exact-prefix check had matched ZERO real events. Streaming this exact
 *  shape proves the toast fires against the real wire format. */
Given('the BFF streams a notification toast titled {string}', async function (title) {
  const payload = JSON.stringify({ id: 'sse-toast-1', category: 'mention', title });
  await browser.mockNetworkResponse(NOTIFICATIONS_EVENTS_PATH, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    // No space after data: — the exact Spring WebFlux wire shape.
    body: `data:${payload}\n\n`,
  });
});

/** THEN a notification toast titled {string} is shown — the live toast region
 *  rendered a role=status toast with that title (bounded poll; the SSE read +
 *  parse + addToast is async). Asserts appearance only (the 4s auto-dismiss +
 *  5s reconnect re-add would race a "gone" assertion). */
Then('a notification toast titled {string} is shown', async function (title) {
  const deadline = Date.now() + 6000;
  let found = false;
  while (Date.now() < deadline) {
    found = await browser.execute(
      (t) =>
        Array.from(document.querySelectorAll('.toast-region .toast .toast-title')).some(
          (el) => (el.textContent ?? '').trim() === t,
        ),
      [title],
    );
    if (found) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(found, `Expected a live toast titled "${title}" to render from the SSE stream`);
});

After({ tags: '@notifications-mock' }, async function () {
  await browser.mockNetworkResponse(NOTIFICATIONS_EVENTS_PATH, {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  });
});

/* --- Home announcements banner (GET /bff/announcements/home) ------------------ *
 * Renders on the /home page (a deep link, so these scenarios are @cluster — the
 * default server.js has no SPA fallback; the integrated/nginx env serves /home).
 * Priority-ordered, dismiss-once (localStorage), rendered inside SANDBOXED
 * null-origin srcdoc iframes so any <script> in body_html is INERT.
 */

const ANNOUNCEMENTS_PATH = '/bff/announcements/home';

Given('the BFF reports two home announcements a low-priority dismissible one and a high-priority pinned one', async function () {
  await browser.mockNetworkResponse(ANNOUNCEMENTS_PATH, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      {
        id: 'a1',
        title: 'Low priority',
        priority: 2,
        dismissible: true,
        starts_at: null,
        ends_at: null,
        body_html: '<b>hi</b><script>window.pwned=1</script>',
      },
      {
        id: 'a2',
        title: 'Pinned notice',
        priority: 9,
        dismissible: false,
        starts_at: null,
        ends_at: null,
        body_html: '<p>pinned</p>',
      },
    ]),
  });
});

Then('the pinned announcement renders before the dismissible one', async function () {
  await browser.waitForElementVisible('[data-testid="home-announcements"]', 6000);
  // The service sorts by priority desc, so the rendered <article> order is the
  // banner's visible priority order — assert the titles land highest-first.
  const titles = await browser.execute(() =>
    Array.from(document.querySelectorAll('[data-testid="home-announcement-title"]')).map((el) =>
      (el.textContent ?? '').trim(),
    ),
  );
  assert.deepStrictEqual(
    titles,
    ['Pinned notice', 'Low priority'],
    `Expected the priority-9 "Pinned notice" before the priority-2 "Low priority" (got ${JSON.stringify(titles)})`,
  );
});

Then('the pinned announcement has no dismiss control', async function () {
  const meta = await browser.execute(() => {
    const articles = Array.from(document.querySelectorAll('[data-testid="home-announcement"]'));
    // The pinned (non-dismissible) announcement is the higher-priority first one.
    const first = articles[0];
    const firstTitle = (first?.querySelector('[data-testid="home-announcement-title"]')?.textContent ?? '').trim();
    return {
      firstTitle,
      firstHasDismiss: !!first?.querySelector('[data-testid="home-announcement-dismiss"]'),
      // Only the ONE dismissible announcement carries a dismiss control.
      totalDismissControls: document.querySelectorAll('[data-testid="home-announcement-dismiss"]').length,
    };
  });
  assert.strictEqual(meta.firstTitle, 'Pinned notice', 'the first (pinned) announcement is the priority-9 one');
  assert.ok(!meta.firstHasDismiss, 'A non-dismissible (pinned) announcement must omit its dismiss control');
  assert.strictEqual(meta.totalDismissControls, 1, 'exactly the ONE dismissible announcement carries a dismiss control');
});

Then('the announcement script did not execute', async function () {
  // The srcdoc iframe runs with NO allow-scripts + NO allow-same-origin, so the
  // <script> in body_html can never run in this origin — window.pwned stays unset.
  const pwned = await browser.execute(() => window.pwned);
  assert.strictEqual(pwned, undefined, 'Sandboxed announcement iframe must NOT execute body_html <script>');
});

After({ tags: '@announcements-mock' }, async function () {
  await browser.mockNetworkResponse(ANNOUNCEMENTS_PATH, {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  });
});

/* --- Home-services launcher cards (data-state matrix + dead-link guards) ------ *
 * The launcher grid renders on /home (a deep link, so its scenarios are
 * @cluster). Each card carries data-testid="card-<id>" + data-state
 * (absent | role | registration | enabled); an 'enabled' card is a real <a>
 * routerLink, a gated card a disabled <span>. The forum card, once installed,
 * MUST be an enabled real link resolving to the newly-mounted /social/forum route
 * (regression guard for the dead-link fix).
 */

Then('the home-services card {string} has state {string}', async function (id, expected) {
  const deadline = Date.now() + 6000;
  let state = '';
  while (Date.now() < deadline) {
    state = await browser.execute(
      (cid) => document.querySelector(`[data-testid="card-${cid}"]`)?.getAttribute('data-state') ?? '',
      [id],
    );
    if (state === expected) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.strictEqual(state, expected, `Expected home-services card "${id}" to be data-state="${expected}" but was "${state}"`);
});

Then('the home-services card {string} is an enabled link to {string}', async function (id, route) {
  const meta = await browser.execute(
    (cid) => {
      const el = document.querySelector(`a[data-testid="card-${cid}"]`);
      return el ? { tag: el.tagName, href: el.getAttribute('href') ?? '' } : null;
    },
    [id],
  );
  assert.ok(meta, `Expected an ENABLED (anchor) home-services card "${id}", not a disabled span`);
  assert.strictEqual(meta.tag, 'A', `card "${id}" must render as an <a> routerLink when enabled`);
  assert.ok(
    meta.href.endsWith(route),
    `Expected card "${id}" to link to "${route}" but its href was "${meta.href}"`,
  );
});
