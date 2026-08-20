import { AsyncPipe, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChild,
  ViewChildren,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { SessionService } from '../session.service';
import { ProfileModalService } from '../profile-modal/profile-modal.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { accessibleName } from '../accessible-name';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { ViewReloadService } from '../view-reload.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { MenuBarModeService } from './menu-bar-mode.service';

/** A primary menubar entry. The router-outlet is the swappable content region, so
 *  selecting an entry navigates the host: Home -> the role-home remote ('/'),
 *  Mastodon/Matrix -> the social remotes. `enabled` reacts to the live session AND
 *  the federation install-state so an entry is reachable only when BOTH its service
 *  is installed AND the user is fully registered, matching the registeredGuard
 *  (visible-but-disabled, never a dead link).
 *
 *  `slug` is the optional federation-capability slug an entry depends on (absent
 *  for the always-present Home). `disabledReason()` returns the helptext explaining
 *  WHY a disabled entry is disabled — not installed on this deployment vs the
 *  session not yet registered — wired via aria-describedby (defense-in-depth: grey
 *  + EXPLAIN, never hide). */
interface NavEntry {
  label: string;
  route: string;
  testid: string;
  slug?: string;
  enabled: () => boolean;
  disabledReason: () => string;
  /** Whether the entry is LISTED AT ALL. Absent = always listed (the service
   *  entries, which show greyed with a reason when unavailable — that greying is
   *  informative: it tells you the service exists and why you cannot use it).
   *  The role-gated CONSOLES use this instead: a moderation console a normal
   *  member can never open is noise in their menubar, not information. */
  visible?: () => boolean;
  /** Short descriptive sub-line for the HOME-CARD rendering of this entry (the
   *  bar itself renders labels only). Copy matches the /home launcher catalog
   *  (home-services.service.ts CARD_CATALOG) so the two card surfaces read
   *  alike. Absent for Home, which never renders as a card. */
  description?: string;
  /** The console's SECTIONS (admin/mod only). While the entry is the ACTIVE
   *  route, these render as a SUBMENU nested under the bar (issue #19,
   *  2026-08-19 comment) — mirroring the section menu the remote carries on its
   *  own landing page, so a section stays reachable from anywhere inside the
   *  console without a round-trip through the landing. */
  sections?: readonly NavSection[];
}

/** One section of an admin/mod console, shown in the ACTIVE-console submenu.
 *  Mirrors the section catalog the remote's own landing menu renders (see
 *  ADMIN_SECTIONS / MOD_SECTIONS below for the exact sync contract). */
interface NavSection {
  label: string;
  route: string;
  testid: string;
  /** Extra visibility tier ON TOP of the parent entry's `visible` gate (the
   *  superadmin-only admin sections). Absent = every viewer of the active
   *  console sees it. Mirrors the remote's own menu tiering, so the submenu
   *  never offers a section the remote's landing would hide. */
  show?: () => boolean;
}

/** An item inside the profile dropdown menu. `action` either navigates to a
 *  remote ('admin'/'apidocs'/'mod'/'wiki'/'owncast'/'tube'), opens the profile
 *  modal, or signs out. `show` gates the role-specific Admin / API docs /
 *  Moderation / Wiki / Owncast / Tube entries on the live session. */
interface ProfileMenuItem {
  label: string;
  testid: string;
  action: 'profile' | 'admin' | 'apidocs' | 'mod' | 'wiki' | 'owncast' | 'tube' | 'games-admin'
        | 'character-studio' | 'character-forge' | 'logout';
  route?: string;
  show: () => boolean;
  /** Concise help describing WHAT activating the item does + WHERE it goes. Shown
   *  as visible .field-help and wired to the item via aria-describedby so screen
   *  readers announce it WITH the item. */
  help: string;
}

/** True when the given router URL is the LOGIN remote — '/login' itself or any of
 *  its child/query/fragment forms ('/login/appeal', '/login?next=…'). String-based
 *  on the NavigationEnd url (not route data) because the login mount is a
 *  federated remote whose child routes this host cannot enumerate. */
function isLoginUrl(url: string): boolean {
  return url === '/login' || /^\/login[/?#]/.test(url);
}

/** True when `url` is INSIDE `route` — the route itself or any child/query/
 *  fragment form ('/admin', '/admin/usage', '/admin?x'). Segment-aware so
 *  '/mod' never claims '/mode-x'. String-based on the NavigationEnd url like
 *  {@link isLoginUrl}, because the consoles are federated remotes whose child
 *  routes this host cannot enumerate from route data. */
function isUrlInside(url: string, route: string): boolean {
  if (!url.startsWith(route)) return false;
  const next = url.charAt(route.length);
  return next === '' || next === '/' || next === '?' || next === '#';
}

/** True when `url` is the signed-in HOME — '/user' EXACTLY (plus query/fragment
 *  forms), the member home roleHomeGuard lands every authenticated identity on.
 *
 *  Deliberately NOT '/user/...' children (notifications/profile/preferences are
 *  destinations, not the home) and NOT the host's public '/home' page: that
 *  marketing page already carries its own full services launcher grid
 *  (HomeServicesComponent) mid-page, and its menubar chiefly serves the
 *  anonymous majority (Home + Sign in), who have no service entries to turn
 *  into cards in the first place. */
function isHomeUrl(url: string): boolean {
  if (!url.startsWith('/user')) return false;
  const next = url.charAt('/user'.length);
  return next === '' || next === '?' || next === '#';
}

@Component({
  selector: '[menu]',
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  host: {
    id: 'menu',
  },
  templateUrl: './menu.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './menu.component.scss',
})
export class MenuComponent {
  readonly session = inject(SessionService);
  private readonly modal = inject(ProfileModalService);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly capabilities = inject(CapabilitiesService);
  private readonly bellNotifications = inject(BellNotificationsService);
  /** The shell-wide RELOAD control. Lives HERE (one control in the chrome) rather
   *  than per-remote, so every federated view is refreshed the same way and a
   *  remote never has to ship its own reload affordance. */
  readonly viewReload = inject(ViewReloadService);

  /** Unread notification count — drives the bell badge. Emits 0 when unauthenticated
   *  (polling is stopped and the BehaviorSubject is reset by stopPolling()). */
  readonly unreadCount$ = this.bellNotifications.unreadCount$;

  /** The visitor's menubar mode: 'static' (always shown, default) vs 'auto'
   *  (content-earned + dismissable). Public — the template gates on it. */
  readonly barMode = inject(MenuBarModeService);

  /** Active home announcements (shared root instance — the same list the home
   *  banner renders). In auto mode their PRESENCE is half of what earns the bar
   *  its screen space. */
  private readonly announcements = inject(AnnouncementsService);

  /** The unread count as a signal, so barVisible() can compose it with the other
   *  signals. Same source as the badge's async-piped unreadCount$ above. */
  private readonly unreadCount = toSignal(this.bellNotifications.unreadCount$, {
    initialValue: 0,
  });

  /** The URL the outlet is currently showing (seeded with the router's current
   *  url, then NavigationEnd-fed). Drives the login-page chrome gate below. */
  private readonly currentUrl = signal<string>(this.router.url);

  /** LOGIN-PAGE CHROME GATE (operator requirement, issue #19): while the LOGIN
   *  remote is what the outlet shows AND nobody is signed in, the menubar has
   *  nothing to offer — 'Home' leads straight back to the authgate that put the
   *  visitor here, and 'Sign in' points at the page already on screen. So the
   *  bar hides ENTIRELY (no Home-only stub). It comes back the moment the
   *  session signal flips (login-ui broadcasts, SessionService re-hydrates) —
   *  no navigation needed — and anonymous visitors on the PUBLIC pages
   *  (/home, /about) keep their Home + Sign-in bar unchanged. */
  readonly loginChromeHidden = computed(
    () => !this.session.loggedIn() && isLoginUrl(this.currentUrl()),
  );

  /** AUTO-mode content gate: is there anything that EARNS the bar its space?
   *  Active (non-dismissed) announcements or unread notifications. */
  readonly hasBarContent = computed(
    () => this.announcements.visible().length > 0 || this.unreadCount() > 0,
  );

  /** HOME-CARDS GATE (operator requirement, issue #19 comment 2026-08-19):
   *  while the signed-in HOME ('/user' — where roleHomeGuard lands everyone) is
   *  what the outlet shows, the menubar hides and the SAME visible entries
   *  render as service CARDS instead (the template's @else branch) — on home
   *  the services ARE the navigation, so a bar repeating them is noise. Signed
   *  in only: an anonymous visitor has no service entries to render as cards
   *  (serviceListed gates them all on loggedIn), and hiding their bar would
   *  strand them without the Sign-in entry. */
  readonly homeCardsActive = computed(
    () => this.session.loggedIn() && isHomeUrl(this.currentUrl()),
  );

  /** Render gate for the WHOLE menubar (the template's outermost @if).
   *  Login-page chrome wins outright; then the home page swaps the bar for the
   *  service cards; then 'static' means always shown, and 'auto' shows the bar
   *  only while content is present and not dismissed. */
  readonly barVisible = computed(() => {
    if (this.loginChromeHidden()) return false;
    if (this.homeCardsActive()) return false;
    if (this.barMode.mode() === 'static') return true;
    return this.hasBarContent() && !this.barMode.dismissed();
  });

  /** ADMIN console sections (issue #19: sections render as a SUBMENU while the
   *  console is active). MIRRORS hugmesh-admin-ui AdminComponent.allMenu — the
   *  section menu the remote's own landing page renders — labels and paths
   *  verbatim, keep the two in sync. Tier mapping:
   *   - `superadminOnly` items -> show: isSuperadmin (same predicate);
   *   - `fleetOnly` ('My fleet', tier fleet_admin/admin/superadmin): NO gate —
   *     this submenu only renders inside /admin, whose adminGuard viewers
   *     (role 'admin') all satisfy the fleet tier already;
   *   - the HIDDEN tier ('Workload console') is deliberately ABSENT: the remote
   *     surfaces it only after a server-confirmed capability probe (404 = stays
   *     dark), and this host must never reveal a dark feature from a static list.
   *  PLUS the host's own /admin/docs mount (the admin-only API-docs remote — a
   *  section of the admin surface from the host's perspective, same route the
   *  profile dropdown's 'API docs' entry uses). */
  private readonly adminSections: readonly NavSection[] = [
    { label: 'Usage analytics', route: '/admin/usage', testid: 'subnav-admin-usage' },
    { label: 'Namespace access', route: '/admin/namespaces', testid: 'subnav-admin-namespaces' },
    { label: 'Delegation & access roles', route: '/admin/delegation', testid: 'subnav-admin-delegation' },
    { label: 'Roles', route: '/admin/roles', testid: 'subnav-admin-roles' },
    { label: 'Route access', route: '/admin/route-access', testid: 'subnav-admin-route-access' },
    { label: 'Route definitions', route: '/admin/routes', testid: 'subnav-admin-routes' },
    { label: 'ISO downloads', route: '/admin/isos', testid: 'subnav-admin-isos' },
    { label: 'ArgoCD', route: '/admin/argocd', testid: 'subnav-admin-argocd' },
    { label: 'Guided tasks', route: '/admin/tasks', testid: 'subnav-admin-tasks' },
    { label: 'Backup', route: '/admin/backup', testid: 'subnav-admin-backup' },
    { label: 'Recovery', route: '/admin/recovery', testid: 'subnav-admin-recovery' },
    { label: 'Backups history', route: '/admin/backups', testid: 'subnav-admin-backups' },
    { label: 'Cloud backups', route: '/admin/cloud-backups', testid: 'subnav-admin-cloud-backups' },
    { label: 'Announcements', route: '/admin/announcements', testid: 'subnav-admin-announcements' },
    { label: 'Themes', route: '/admin/themes', testid: 'subnav-admin-themes' },
    { label: 'Test reports', route: '/admin/test-reports', testid: 'subnav-admin-test-reports' },
    { label: 'Image generation', route: '/admin/image-gen', testid: 'subnav-admin-image-gen' },
    { label: 'Forum admin', route: '/admin/forum', testid: 'subnav-admin-forum' },
    { label: 'Appeals', route: '/admin/appeals', testid: 'subnav-admin-appeals' },
    { label: 'Account appeals', route: '/admin/account-appeals', testid: 'subnav-admin-account-appeals' },
    { label: 'Security (2FA)', route: '/admin/security', testid: 'subnav-admin-security' },
    { label: 'Device licenses', route: '/admin/device-licenses', testid: 'subnav-admin-device-licenses', show: () => this.session.isSuperadmin() },
    { label: 'Pending devices', route: '/admin/device-pending', testid: 'subnav-admin-device-pending', show: () => this.session.isSuperadmin() },
    { label: 'Phone fleet', route: '/admin/phone-fleet', testid: 'subnav-admin-phone-fleet', show: () => this.session.isSuperadmin() },
    { label: 'My fleet', route: '/admin/my-fleet', testid: 'subnav-admin-my-fleet' },
    { label: 'Fleet entitlements', route: '/admin/fleet-entitlements', testid: 'subnav-admin-fleet-entitlements', show: () => this.session.isSuperadmin() },
    { label: 'Node storage', route: '/admin/node-storage', testid: 'subnav-admin-node-storage' },
    { label: 'Device radios', route: '/admin/device-radios', testid: 'subnav-admin-device-radios' },
    { label: 'Domain capabilities', route: '/admin/domain-capabilities', testid: 'subnav-admin-domain-capabilities' },
    { label: 'Desktop governance', route: '/admin/desktop', testid: 'subnav-admin-desktop' },
    { label: 'Egress VPN', route: '/admin/egress-vpn', testid: 'subnav-admin-egress-vpn', show: () => this.session.isSuperadmin() },
    { label: 'Domains', route: '/admin/superadmin/domains', testid: 'subnav-admin-domains', show: () => this.session.isSuperadmin() },
    // Host mount, not an AdminComponent.allMenu row (see the doc above).
    { label: 'API docs', route: '/admin/docs', testid: 'subnav-admin-docs' },
  ];

  /** MODERATION console sections. MIRRORS hugmesh-mod-ui MOD_ROUTES + the
   *  labels ModHomeComponent's own landing cards render ('Moderation console',
   *  'System findings') — keep in sync. Every /mod viewer (modGuard) sees both:
   *  the remote's landing menu has no tiering. */
  private readonly modSections: readonly NavSection[] = [
    { label: 'Moderation console', route: '/mod/console', testid: 'subnav-mod-console' },
    { label: 'System findings', route: '/mod/findings', testid: 'subnav-mod-findings' },
  ];

  /** UNIVERSAL NAV — Home | Mastodon | Matrix. Home returns to the role-home
   *  remote ('' -> roleHomeGuard redirect); Mastodon/Matrix swap the content
   *  outlet to the social remotes. A social entry is enabled only when its service
   *  is INSTALLED (federation capability) AND the session is fully registered; an
   *  uninstalled service greys out by install-state, a registered-gate by
   *  registration — each with its own helptext reason. */
  readonly navEntries: readonly NavEntry[] = [
    {
      label: 'Home', route: '/', testid: 'nav-home',
      enabled: () => true,
      disabledReason: () => '',
    },
    {
      label: 'Mastodon', route: '/social/mastodon', testid: 'nav-mastodon', slug: 'mastodon',
      description: 'The fediverse timeline',
      visible: () => this.serviceListed('mastodon'),
      enabled: () => this.capabilities.installed('mastodon') && this.session.fullyRegistered(),
      disabledReason: () => this.socialDisabledReason('mastodon'),
    },
    {
      label: 'Matrix', route: '/social/matrix', testid: 'nav-matrix', slug: 'matrix',
      description: 'Secure chat',
      visible: () => this.serviceListed('matrix'),
      enabled: () => this.capabilities.installed('matrix') && this.session.fullyRegistered(),
      disabledReason: () => this.socialDisabledReason('matrix'),
    },
    // Forum had a ROUTE (app.routes.ts 'social/forum'), a remote, and a registered
    // capability — but no entry anywhere in the nav or the profile menu, so there was
    // no way to reach it in the UI at all. Gated on isUser() to match forumGuard
    // exactly: forum is deliberately NOT registration-gated (see app.routes.ts), so
    // reusing the social registration predicate here would hide it from precisely the
    // authenticated-but-unregistered identity the route was written to admit.
    {
      label: 'Forum', route: '/social/forum', testid: 'nav-forum', slug: 'forum',
      description: 'Discussion boards',
      visible: () => this.serviceListed('forum'),
      enabled: () => this.capabilities.installed('forum') && this.session.isUser(),
      disabledReason: () => this.forumDisabledReason(),
    },
    // ── the role-gated CONSOLES ───────────────────────────────────────────────
    // These existed and worked, but the ONLY way to reach them was to click your
    // own username and find them in the profile dropdown — a place people look
    // for "sign out", not for the moderation console. Operator report
    // 2026-08-14: "this functionality should already exist but we can't find it
    // nor any control UIs for any of the services." They keep their dropdown
    // entries (muscle memory, and the dropdown carries the fuller list); this
    // puts the two DAILY-DRIVER consoles where their users actually look.
    //
    // `visible` (not `enabled`): a member who can never open the admin console
    // should not see a greyed one. Gated on the SAME predicates the profile
    // dropdown uses, so the two can never disagree about who has access.
    {
      label: 'Admin', route: '/admin', testid: 'nav-admin',
      description: 'Administration console',
      visible: () => this.session.isAdmin(),
      enabled: () => true,
      disabledReason: () => '',
      sections: this.adminSections,
    },
    {
      label: 'Moderation', route: '/mod', testid: 'nav-mod',
      description: 'Moderation console',
      visible: () => this.session.isMod(),
      enabled: () => true,
      disabledReason: () => '',
      sections: this.modSections,
    },
  ];

  /** The entries actually rendered — everything without a `visible` gate, plus
   *  the role-gated consoles for the identities that hold their role. */
  visibleNavEntries(): readonly NavEntry[] {
    return this.navEntries.filter(e => (e.visible ? e.visible() : true));
  }

  /** The entries the HOME page renders as service CARDS — exactly the bar's
   *  visible entries (visibleNavEntries is the single source of truth: the
   *  serviceListed/loggedIn gating and the role-gated console visibility apply
   *  unchanged) minus 'Home' itself, which is where the cards already are. */
  serviceCardEntries(): readonly NavEntry[] {
    return this.visibleNavEntries().filter((e) => e.route !== '/');
  }

  /** The console entry (admin/mod) whose route is ACTIVE, or null — drives the
   *  sections SUBMENU (issue #19). Gated on the entry's own `visible` predicate
   *  too, so a session that cannot see the console entry can never see its
   *  sections either (same defense-in-depth stance as the entry itself; the
   *  route guards remain the real boundary). */
  readonly activeConsoleEntry = computed(() => {
    const url = this.currentUrl();
    return this.navEntries.find(
      (e) => e.sections && (e.visible ? e.visible() : true) && isUrlInside(url, e.route),
    ) ?? null;
  });

  /** The active console's sections this session may see (superadmin tiers). */
  visibleSections(entry: NavEntry): readonly NavSection[] {
    return (entry.sections ?? []).filter((s) => (s.show ? s.show() : true));
  }

  /**
   * Whether a SERVICE entry is listed at all (Mastodon / Matrix / Forum).
   *
   * <p>SIGNED OUT => not listed, so the anonymous menubar is Home ONLY. A greyed "Mastodon"
   * sitting above a login screen advertises nothing an anonymous visitor can act on, and its
   * own helptext ("Complete your registration to use this") is written for someone who
   * already HAS an account. Operator report: a signed-out shell still showed the service
   * entries.
   *
   * <p>SIGNED IN => listed, and the existing enabled/disabledReason treatment applies
   * unchanged. That greying is deliberate and documented on {@link NavEntry} ("grey +
   * EXPLAIN, never hide"): it tells a member the service exists and WHY they cannot use it
   * yet — "not available on this deployment" vs "complete your registration" — and the
   * second of those is precisely the prompt that lets them fix it. Hiding an uninstalled or
   * unregistered service from a signed-in member is a REVERSAL of that decision, not an
   * extension of this one, so it is deliberately not done here.
   */
  private serviceListed(_slug: string): boolean {
    return this.session.loggedIn();
  }

  /** Forum's own reason: it needs ROLE_USER, not completed registration, so the
   *  social "complete your registration" copy would be actively misleading here. */
  private forumDisabledReason(): string {
    if (!this.capabilities.installed('forum')) {
      return 'This service is not available on this deployment.';
    }
    if (!this.session.isUser()) {
      return 'Sign in with a member account to use the forum.';
    }
    return '';
  }

  /** Why a social entry is disabled: NOT installed on this deployment takes
   *  precedence over the registration gate (an absent service can't be unlocked by
   *  registering). Surfaced as aria-describedby helptext on the disabled button. */
  private socialDisabledReason(slug: string): string {
    if (!this.capabilities.installed(slug)) {
      return 'This service is not available on this deployment.';
    }
    if (!this.session.fullyRegistered()) {
      return 'Complete your registration to use this.';
    }
    return '';
  }

  /** Profile dropdown — Profile (modal) + the conditional Admin / API docs /
   *  Moderation role shortcuts + Sign out. Admin and the admin-only API docs
   *  console appear ONLY for admins; Moderation ONLY for moderators. */
  readonly profileMenuItems: readonly ProfileMenuItem[] = [
    { label: 'Profile',    testid: 'menu-profile', action: 'profile', show: () => true,
      help: 'Opens your profile editor in a dialog.' },
    { label: 'Admin',      testid: 'menu-admin',   action: 'admin',   route: '/admin',      show: () => this.session.isAdmin(),
      help: 'Go to the admin console (administrators only).' },
    { label: 'API docs',   testid: 'menu-apidocs', action: 'apidocs', route: '/admin/docs', show: () => this.session.isAdmin(),
      help: 'Browse the platform API documentation (administrators only).' },
    { label: 'Moderation', testid: 'menu-mod',     action: 'mod',     route: '/mod',        show: () => this.session.isMod(),
      help: 'Go to the moderation console (moderators only).' },
    // WIKI management console — shown to the wiki access tier: admins + superadmins
    // always, plus a moderator additionally granted the per-service ROLE_WIKI
    // (a bare mod does NOT see it). Mirrors the wikiGuard that protects the /wiki
    // mount, so the entry is never a dead link.
    { label: 'Wiki',       testid: 'menu-wiki',    action: 'wiki',    route: '/wiki',       show: () => this.canAccessWiki(),
      help: 'Manage the platform wiki (admins, superadmins, and granted moderators).' },
    // OWNCAST live-stream console — shown to the Owncast access tier: streamers
    // granted the per-service ROLE_OWNCAST, plus admins/superadmins (grant
    // management) and moderators (stream moderation). NOTE: unlike the sibling
    // Wiki/Tube entries, this does NOT exactly mirror the owncastGuard — the guard
    // admits only admin|superadmin|ROLE_OWNCAST, so a bare moderator (mod without
    // ROLE_OWNCAST) sees this entry but is bounced to /login if clicked. See
    // canAccessOwncast()'s doc below for the full rationale.
    { label: 'Owncast',    testid: 'menu-owncast', action: 'owncast', route: '/owncast',    show: () => this.canAccessOwncast(),
      help: 'Manage your live stream (streamers, moderators, admins, and superadmins).' },
    // TUBE subscription-archive console — shown to the Tube access tier: users
    // granted the per-service ROLE_TUBE, plus admins/superadmins (quota/retention
    // management). A bare moderator does NOT see it. Mirrors the tubeGuard that
    // protects the /tube mount, so the entry is never a dead link.
    { label: 'Tube',       testid: 'menu-tube',    action: 'tube',    route: '/tube',       show: () => this.canAccessTube(),
      help: 'Manage your YouTube subscription archive (granted users, admins, and superadmins).' },
    // GAMES-ADMIN console (Phase 8/10) — shown ONLY to the DERIVED
    // ROLE_GAMES_ADMIN tier (session.isGamesAdmin: ROLE_GAMES ∩ (ROLE_ADMIN ∪
    // ROLE_MOD)), plus superadmins. A bare games member or a bare admin/mod does
    // NOT see it. Mirrors the gamesAdminGuard that protects the /games/admin
    // mount, so the entry is never a dead link.
    { label: 'Games Admin', testid: 'menu-games-admin', action: 'games-admin', route: '/games/admin', show: () => this.canAccessGamesAdmin(),
      help: 'Manage the games namespace (games admins and superadmins only).' },
    // CHARACTER remotes. Shown to any FULLY-REGISTERED session — deliberately not
    // role-gated: the gateway admits a plain ROLE_USER to both (verified live: 200
    // for e2e-user, 401 anonymous), and there is no per-service role to gate on, so
    // a tighter `show` here would hide a feature the backend grants. `fullyRegistered`
    // (not merely loggedIn) mirrors the registeredGuard on their routes, so the entry
    // never offers a destination the guard will bounce.
    { label: 'Character Studio', testid: 'menu-character-studio', action: 'character-studio', route: '/character-studio', show: () => this.session.fullyRegistered(),
      help: 'Build a layered anthro/furry character (the profile character generator).' },
    { label: 'Character Forge',  testid: 'menu-character-forge',  action: 'character-forge',  route: '/character-forge',  show: () => this.session.fullyRegistered(),
      help: 'Forge a 3D character from your saved parts.' },
    { label: 'Sign out',   testid: 'menu-logout',  action: 'logout',  show: () => true,
      help: 'Sign out and return to the login page.' },
  ];

  /** The profile-menu items the current session may see. */
  readonly visibleProfileItems = computed(() =>
    this.profileMenuItems.filter((i) => i.show()),
  );

  /** The WIKI access tier (mirrors the host wikiGuard exactly): an admin or
   *  superadmin always, or a moderator additionally granted the per-service
   *  ROLE_WIKI. A plain user / bare moderator is excluded — they never see the
   *  Wiki entry and could not pass the guard if they reached /wiki directly. */
  private canAccessWiki(): boolean {
    return (
      this.session.isAdmin() ||
      this.session.isSuperadmin() ||
      (this.session.isMod() && this.session.hasRole('WIKI'))
    );
  }

  /** The OWNCAST access tier (mirrors the host owncastGuard's role gate PLUS the
   *  menu's broader visibility intent): a streamer granted the per-service
   *  ROLE_OWNCAST, an admin or superadmin (grant management), OR a moderator
   *  (stream moderation). A plain user without ROLE_OWNCAST never sees the entry;
   *  a bare moderator sees it for the moderation surface (the guard then admits
   *  admin|superadmin|ROLE_OWNCAST, so a bare mod is bounced at /owncast — the BFF
   *  is the real boundary). */
  private canAccessOwncast(): boolean {
    return (
      this.session.hasRole('OWNCAST') ||
      this.session.isAdmin() ||
      this.session.isSuperadmin() ||
      this.session.isMod()
    );
  }

  /** The TUBE access tier (mirrors the host tubeGuard exactly): a user granted the
   *  per-service ROLE_TUBE, or an admin or superadmin (quota/retention management).
   *  A bare moderator is excluded — they never see the Tube entry and could not pass
   *  the guard if they reached /tube directly (mod-side tube moderation lives in
   *  mod-bff, not this remote). */
  private canAccessTube(): boolean {
    return (
      this.session.hasRole('TUBE') ||
      this.session.isAdmin() ||
      this.session.isSuperadmin()
    );
  }

  /** The GAMES-ADMIN access tier (mirrors the host gamesAdminGuard exactly): the
   *  DERIVED ROLE_GAMES_ADMIN tier (session.isGamesAdmin — ROLE_GAMES ∩
   *  (ROLE_ADMIN ∪ ROLE_MOD)), or a superadmin. A bare games member or a bare
   *  admin/mod WITHOUT games is excluded — they never see the entry and could
   *  not pass the guard if they reached /games/admin directly. */
  private canAccessGamesAdmin(): boolean {
    return this.session.isGamesAdmin() || this.session.isSuperadmin();
  }

  /** Accessible NAME for the profile-menu trigger. The visible label is the user's
   *  display name (email/discord handle, possibly NON-ASCII); the button itself has
   *  no purpose text, so we announce a clean "Account menu for <name>" using the
   *  shared {@link accessibleName} ASCII util — so a screen reader announces a
   *  pronounceable name (the ASCII screen-reader name when the display name carries
   *  characters AT cannot voice) plus what the control opens. */
  readonly profileTriggerLabel = computed(() => {
    const label = this.session.session()?.label ?? '';
    const spoken = accessibleName(label, null);
    return spoken ? `Account menu for ${spoken}` : 'Account menu';
  });

  /** Roving-tabindex cursor for the primary menubar (WAI-ARIA menubar pattern):
   *  exactly ONE menuitem is a tab stop (tabindex 0); the rest are tabindex -1
   *  and reachable only with the arrow keys. */
  activeIndex = 0;

  /** Whether the profile dropdown is expanded. */
  readonly profileOpen = signal(false);

  @ViewChildren('navBtn', { read: ElementRef })
  navButtonRefs!: QueryList<ElementRef<HTMLButtonElement>>;

  @ViewChild('profileTrigger', { read: ElementRef })
  profileTriggerRef?: ElementRef<HTMLButtonElement>;

  @ViewChildren('profileItem', { read: ElementRef })
  profileItemRefs!: QueryList<ElementRef<HTMLButtonElement>>;

  /** Roving-tabindex cursor for the OPEN profile dropdown (WAI-ARIA menu pattern):
   *  exactly ONE menuitem is a tab stop (tabindex 0), the rest tabindex -1, and the
   *  arrow keys move DOM focus. -1 while the menu is closed (no item is a stop). */
  readonly profileActiveIndex = signal(-1);

  /** Indices of the enabled primary entries (the arrow-key cycle skips disabled).
   *  Indexes the RENDERED list — the template iterates visibleNavEntries(), so
   *  indexing the full list would make the arrow keys address items that are not
   *  in the DOM (focus silently going nowhere for anyone without the console
   *  roles). The two must walk the same array. */
  private get enabledIndices(): number[] {
    return this.visibleNavEntries()
        .map((e, i) => (e.enabled() ? i : -1)).filter((i) => i !== -1);
  }

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Start or stop bell polling whenever the login state changes. The effect()
    // runs in the injection context (constructor body) so it tracks session.loggedIn()
    // reactively: first call fires immediately, then re-runs on every change.
    effect(() => {
      if (this.session.loggedIn()) {
        this.bellNotifications.startPolling();
      } else {
        this.bellNotifications.stopPolling();
      }
    });

    // The menu is always mounted, so it is the host's natural owner for loading the
    // PUBLIC federation capability list ONCE at startup (load-once + shared, so the
    // home-services cards reuse the same fetch). Fire-and-forget: a failed/empty
    // load greys every optional service rather than breaking the shell.
    void this.capabilities.load();

    // AUTO mode decides visibility from announcement PRESENCE, so it must load
    // the shared list itself — the home banner's own load only runs when the
    // home page renders. Static mode never fetches here (unchanged behaviour).
    // Fire-and-forget like the capabilities load: a failed fetch means an empty
    // list, i.e. an honest "nothing to show".
    effect(() => {
      if (this.barMode.mode() === 'auto' && this.session.loggedIn()) {
        void this.announcements.load();
      }
    });

    // Fresh content re-earns the bar: ANY change in what is present (a new
    // announcement, the unread count moving) clears a standing dismissal. The
    // effect tracks the COUNTS, not the boolean, so a second notification
    // arriving while content was already present still re-reveals.
    effect(() => {
      const announcements = this.announcements.visible().length;
      const unread = this.unreadCount();
      if (announcements > 0 || unread > 0) this.barMode.reveal();
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((e) => {
        // Track where the outlet now points (login-page chrome gate input).
        this.currentUrl.set(e.urlAfterRedirects ?? e.url);
        // Close the profile menu on navigation, then focus the routed content.
        this.profileOpen.set(false);
        this.profileActiveIndex.set(-1);
        this.doc.getElementById('maincontent')?.focus();
      });
  }

  /** Refresh whatever is currently in the router-outlet (see
   *  {@link ViewReloadService}). Fire-and-forget from the template: the service
   *  owns the busy flag AND the full-reload fallback, so nothing here can leave
   *  the button stuck. */
  onReload(): void {
    void this.viewReload.reload();
  }

  /** Navigate to the notifications page (user-ui remote mounted at /user). */
  navigateToBell(): void {
    void this.router.navigateByUrl('/user/notifications');
  }

  /** Toggle the profile dropdown menu (the button is aria-haspopup="menu"). When
   *  opening, place the roving cursor on the FIRST item and move focus into the
   *  menu (WAI-ARIA menu-button: a pointer/Enter/Space open lands on the first
   *  item). When closing, drop the cursor. */
  toggleProfile(): void {
    this.profileOpen.update((v) => !v);
    if (this.profileOpen()) {
      this.openProfileAt(0);
    } else {
      this.profileActiveIndex.set(-1);
    }
  }

  /** Open the dropdown (if closed) with the roving cursor at `index` and move DOM
   *  focus to that item. `index` -1 means the LAST item (ArrowUp-to-open). */
  private openProfileAt(index: number): void {
    const count = this.visibleProfileItems().length;
    if (count === 0) return;
    const target = index < 0 ? count - 1 : Math.min(index, count - 1);
    this.profileOpen.set(true);
    this.profileActiveIndex.set(target);
    // Wait for the @if-guarded menu list to render before focusing the item.
    queueMicrotask(() => this.focusProfileItem(target));
  }

  private focusProfileItem(index: number): void {
    this.profileItemRefs?.get(index)?.nativeElement.focus();
  }

  /** Keyboard handler for the trigger BUTTON. ArrowDown/ArrowUp open the menu and
   *  land on the first/last item per the WAI-ARIA menu-button pattern; Enter/Space
   *  fall through to the native (click)=toggleProfile. Escape closes if open. */
  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.openProfileAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.openProfileAt(-1);
    } else if (event.key === 'Escape' && this.profileOpen()) {
      event.preventDefault();
      this.closeProfile();
    }
  }

  /** Roving-tabindex keyboard handler for the OPEN profile dropdown menu (WAI-ARIA
   *  menu pattern). ArrowUp/ArrowDown move the cursor (wrapping), Home/End jump to
   *  the ends, and DOM focus follows. Escape is handled separately on the list. */
  onProfileMenuKeydown(event: KeyboardEvent): void {
    const count = this.visibleProfileItems().length;
    if (count === 0) return;
    const cur = this.profileActiveIndex();
    let next: number | undefined;

    if (event.key === 'ArrowDown') {
      next = (cur + 1) % count;
    } else if (event.key === 'ArrowUp') {
      next = (cur - 1 + count) % count;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = count - 1;
    }

    if (next !== undefined) {
      event.preventDefault();
      this.profileActiveIndex.set(next);
      this.focusProfileItem(next);
    }
  }

  /** Handle a profile-menu item activation. */
  onProfileItem(item: ProfileMenuItem): void {
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    switch (item.action) {
      case 'profile':
        this.modal.open();
        break;
      case 'admin':
      case 'apidocs':
      case 'mod':
      case 'wiki':
      case 'owncast':
      case 'tube':
      case 'games-admin':
        if (item.route) this.router.navigateByUrl(item.route);
        break;
      // CHARACTER remotes. remoteName is the kebab-case 'character-studio' /
      // 'character-forge' in app.routes.ts — native-federation registers a remote
      // under the name declared inside its OWN remoteEntry.json, not the manifest
      // key, so a camelCase key throws "Remote 'characterStudio' is not initialized"
      // at load time with no failed request to point at.
      case 'character-studio':
      case 'character-forge':
        if (item.route) this.router.navigateByUrl(item.route);
        break;
      case 'logout':
        void this.logout();
        break;
    }
  }

  /** Close the dropdown and return focus to its trigger (Escape from the menu). */
  closeProfile(restoreFocus = true): void {
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    if (restoreFocus) this.profileTriggerRef?.nativeElement.focus();
  }

  /** Sign out: expire the SERVER session, then return to the authgate at '/', which
   *  redirects anonymous users into the login remote.
   *
   *  The await is load-bearing. {@link SessionService.clear} now posts /bff/sessionOut and
   *  waits for it, because the cookie has to be dead BEFORE we navigate — roleHomeGuard
   *  reads the session on the way through, and a live cookie would let a re-hydrate restore
   *  the session and route the "signed-out" user straight back into their role-home. */
  async logout(): Promise<void> {
    await this.session.clear();
    this.profileOpen.set(false);
    this.profileActiveIndex.set(-1);
    await this.router.navigateByUrl('/');
  }

  /** Roving-tabindex keyboard handler for the primary menubar. Arrow/Home/End
   *  move the active cursor across the enabled entries (wrapping, skipping the
   *  disabled ones) and move DOM focus to the new entry. Other keys are no-ops so
   *  Tab/Enter behave natively. */
  onMenuKeydown(event: KeyboardEvent): void {
    const enabled = this.enabledIndices;
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(this.activeIndex);
    let next: number | undefined;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = enabled[(pos + 1) % enabled.length];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = enabled[(pos - 1 + enabled.length) % enabled.length];
    } else if (event.key === 'Home') {
      next = enabled[0];
    } else if (event.key === 'End') {
      next = enabled[enabled.length - 1];
    }

    if (next !== undefined) {
      event.preventDefault();
      this.activeIndex = next;
      this.navButtonRefs.get(next)?.nativeElement.focus();
    }
  }
}
