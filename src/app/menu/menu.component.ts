import { DOCUMENT } from '@angular/common';
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
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { SessionService } from '../session.service';
import { CapabilitiesService } from '../capabilities/capabilities.service';
import { BellNotificationsService } from '../bell/bell-notifications.service';
import { ViewReloadService } from '../view-reload.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { MenuBarModeService } from './menu-bar-mode.service';
import { WorkloadConsoleProbeService } from './workload-console-probe.service';

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
  imports: [RouterLink, RouterLinkActive],
  host: {
    id: 'menu',
  },
  templateUrl: './menu.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './menu.component.scss',
})
export class MenuComponent {
  readonly session = inject(SessionService);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly capabilities = inject(CapabilitiesService);
  private readonly workloadProbe = inject(WorkloadConsoleProbeService);
  private readonly bellNotifications = inject(BellNotificationsService);
  /** The shell-wide RELOAD control. Lives HERE (one control in the chrome) rather
   *  than per-remote, so every federated view is refreshed the same way and a
   *  remote never has to ship its own reload affordance. */
  readonly viewReload = inject(ViewReloadService);

  /** The visitor's menubar mode: 'static' (always shown, default) vs 'auto'
   *  (content-earned + dismissable). Public — the template gates on it. */
  readonly barMode = inject(MenuBarModeService);

  /** Active home announcements (shared root instance — the same list the home
   *  banner renders). In auto mode their PRESENCE is half of what earns the bar
   *  its screen space. */
  private readonly announcements = inject(AnnouncementsService);

  /** The unread count as a signal, so barVisible() can compose it with the other
   *  signals. The BADGE itself is the header banner's now (HeaderControlsComponent,
   *  which also owns starting/stopping the polling); the bar reads the same shared
   *  service purely to decide whether AUTO mode has content worth showing for. */
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
   *   - the HIDDEN tier ('Workload console') is listed ONLY while this host's own
   *     server-confirmed capability probe (WorkloadConsoleProbeService) has
   *     succeeded (404 or any error = stays dark), so a dark feature is never
   *     revealed from a static list.
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
    // HIDDEN tier: offered only once the capability probe succeeded.
    { label: 'Workload console', route: '/admin/workloads', testid: 'subnav-admin-workloads', show: () => this.workloadProbe.available() },
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
    // GAMES member entry-point (cross-repo contract 2026-10-28): the games
    // catalog remote mounted at /games. Listed for every signed-in member like
    // the other services (grey + EXPLAIN, never hide), enabled only when the
    // 'games' capability is installed AND the session passes the SAME predicate
    // as gamesGuard (ROLE_GAMES | admin | superadmin) — so a plain user or bare
    // mod sees a greyed entry with the reason, never a dead link.
    {
      label: 'Games', route: '/games', testid: 'nav-games', slug: 'games',
      description: 'Play together',
      visible: () => this.serviceListed('games'),
      enabled: () => this.capabilities.installed('games') && this.canAccessGames(),
      disabledReason: () => this.gamesDisabledReason(),
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
    // GAMES ADMIN console (/games/admin, the games remote's './admin-routes').
    // `visible` on the DERIVED tier the profile dropdown and gamesAdminGuard use
    // — isGamesAdmin() = games AND (admin OR mod), or superadmin — so a bare
    // games member, a bare admin and a bare mod never see it (same stance as the
    // Admin/Moderation consoles above). Unlike those two it CAN be greyed: the
    // console needs the games service installed, so an uninstalled deployment
    // shows the reason instead of a dead link.
    {
      label: 'Games Admin', route: '/games/admin', testid: 'nav-games-admin',
      description: 'Manage the games namespace',
      visible: () => this.session.isGamesAdmin() || this.session.isSuperadmin(),
      enabled: () => this.capabilities.installed('games'),
      disabledReason: () => 'Games is not available on this deployment.',
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

  /** The games ENTRY-POINT tier — the gamesGuard predicate verbatim (ROLE_GAMES
   *  holder, or admin / superadmin). Not isGamesAdmin: that is the console tier. */
  private canAccessGames(): boolean {
    return this.session.isGames() || this.session.isAdmin() || this.session.isSuperadmin();
  }

  /** Games' own reason: install-state dominates (unrecoverable here); otherwise
   *  the session lacks the games tier — a plain member or bare mod. */
  private gamesDisabledReason(): string {
    if (!this.capabilities.installed('games')) {
      return 'Games is not available on this deployment.';
    }
    if (!this.canAccessGames()) {
      return 'Sign in as a games member to open this.';
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

  /** Roving-tabindex cursor for the primary menubar (WAI-ARIA menubar pattern):
   *  exactly ONE menuitem is a tab stop (tabindex 0); the rest are tabindex -1
   *  and reachable only with the arrow keys. */
  activeIndex = 0;

  @ViewChildren('navBtn', { read: ElementRef })
  navButtonRefs!: QueryList<ElementRef<HTMLButtonElement>>;

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

    // The menu is always mounted, so it is the host's natural owner for loading the
    // PUBLIC federation capability list ONCE at startup (load-once + shared, so the
    // home-services cards reuse the same fetch). Fire-and-forget: a failed/empty
    // load greys every optional service rather than breaking the shell.
    void this.capabilities.load();

    // The HIDDEN-tier Workload console entry: probe the server for every signed-in
    // admin, and go dark again the moment the session stops being one. Only the
    // session signals are tracked; the probe runs untracked.
    effect(() => {
      const admin = this.session.loggedIn() && this.session.isAdmin();
      untracked(() => {
        if (admin) void this.workloadProbe.probe();
        else this.workloadProbe.reset();
      });
    });

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
        // Then focus the routed content. (Closing the profile dropdown used to
        // happen here too; that menu moved to the header banner and closes
        // itself on NavigationEnd — see HeaderControlsComponent.)
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
