import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AccountStatusService } from './account-status.service';
import { BANNED, SUSPENDED } from './account-status.model';

/** The login-ui appeal route the host links a curtailed caller to. The host
 *  mounts the login remote at `/login`; the appeal page is `/login/appeal` —
 *  SHIPPED: login-ui `login.routes.ts` registers the `appeal` child route and
 *  `AppealComponent` renders the appeal instructions + a real `mailto:` link
 *  resolved from the permitAll admin-bff `GET /bff/public/appeal-contact`. The
 *  page accepts an optional `?reason=<text>` deep-link (announced role=alert);
 *  the banner passes its audit reason through (see
 *  {@link StatusGateComponent.appealQueryParams}), matching the login remote's
 *  own blocked-sign-in deep-link. */
export const APPEAL_ROUTE = '/login/appeal';

/**
 * The ACCOUNT-STATUS APPEAL-GATE banner: a dismissible, accessible alert shown
 * at the top of the host shell ONLY when the caller's OWN status (read off
 * {@code GET /bff/me} by {@link AccountStatusService}) is `suspended` or `banned`.
 * When `active` (or unknown / signed-out / a fail-open read error) it renders
 * NOTHING.
 *
 * Accessibility: a {@code role="alert"} + {@code aria-live="assertive"} region so
 * the curtailment is announced immediately (this is a consequential, time-sensitive
 * message — unlike the polite announcements banner). The dismiss control is a real
 * keyboard-operable {@code <button>} with a state-specific aria-label; the appeal
 * link is a real router link with an explicit accessible name. All controls carry
 * data-testid for the e2e/role suites.
 *
 * INFORMATIONAL, NOT A BLOCK: this banner only EXPLAINS the state and offers an
 * appeal route — it never gates routing. The actual enforcement is server-side
 * (token broker + gateway); a transient `/bff/me` error fails open (no banner).
 */
@Component({
  selector: '[status-gate]',
  host: {
    id: 'status-gate',
  },
  imports: [RouterLink],
  templateUrl: './status-gate.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './status-gate.component.scss',
})
export class StatusGateComponent implements OnInit {
  private readonly service = inject(AccountStatusService);

  /** The appeal-page link target (see {@link APPEAL_ROUTE}). */
  readonly appealRoute = APPEAL_ROUTE;

  /** Dismissed for THIS load (session-local, in-memory). A curtailment is a live
   *  server fact, so we do NOT persist the dismissal across reloads the way the
   *  announcements banner does — a banned user reloading should see it again. */
  private readonly dismissed = signal(false);

  /** True only for suspended | banned on a logged-in session. */
  private readonly curtailed = this.service.curtailed;

  /** The raw status (for the message text + expiry/reason). */
  private readonly status = this.service.status;

  /** Whether to render the banner: curtailed AND not dismissed this load. */
  readonly visible = computed<boolean>(() => this.curtailed() && !this.dismissed());

  /** True when permanently banned (no expiry). */
  readonly banned = computed<boolean>(() => this.status().status === BANNED);
  /** True when temporarily suspended. */
  readonly suspended = computed<boolean>(() => this.status().status === SUSPENDED);

  /** The ISO expiry of a timed suspension, or null (permanent / none). */
  readonly until = computed<string | null>(() => this.status().until ?? null);
  /** The optional audit reason, or null. */
  readonly reason = computed<string | null>(() => this.status().reason ?? null);

  /** Query params for the appeal deep-link: `/login/appeal?reason=<text>` when an
   *  audit reason was recorded (the login-ui AppealComponent announces it via a
   *  role=alert region — the same `?reason=` contract its own blocked-sign-in
   *  redirect uses), or none (a bare `/login/appeal`) when there is no reason. */
  readonly appealQueryParams = computed<{ reason: string } | null>(() => {
    const r = this.reason();
    return r ? { reason: r } : null;
  });

  /** The headline shown to the caller, keyed off the state. */
  readonly heading = computed<string>(() =>
    this.banned() ? 'Your account is banned' : 'Your account is suspended',
  );

  /** The explanatory sentence, including the expiry when a timed suspension. */
  readonly detail = computed<string>(() => {
    if (this.banned()) {
      return 'Your access to this site has been permanently revoked. You can appeal this decision.';
    }
    const until = this.until();
    const when = until ? this.formatUntil(until) : null;
    return when
      ? `Your access is currently suspended until ${when}. You can appeal this decision.`
      : 'Your access is currently suspended. You can appeal this decision.';
  });

  ngOnInit(): void {
    // Fire-and-forget: a failed/empty read fails open (no banner). Only an
    // authenticated session reads its own status.
    void this.service.load();
  }

  /** Dismiss the banner for this load (in-memory only — see {@link dismissed}). */
  dismiss(): void {
    this.dismissed.set(true);
  }

  /** Render the ISO instant as a human-readable local date-time, degrading to the
   *  raw string if it is not parseable (defensive — never throw in the template). */
  private formatUntil(iso: string): string {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return iso;
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return iso;
    }
  }
}
