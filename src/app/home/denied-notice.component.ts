import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { SessionService } from '../session.service';

/** Console paths -> what the operator would call them. Only the role-gated mounts
 *  appear: those are the ones roleGuard can refuse. */
const CONSOLE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['/admin/docs', 'API documentation'],
  ['/admin', 'admin console'],
  ['/mod', 'moderation console'],
  ['/wiki', 'wiki'],
  ['/tube', 'video archive'],
  ['/owncast', 'live streaming'],
  ['/social/forum', 'forums'],
  ['/games/admin', 'games administration'],
  ['/games', 'games'],
  ['/user', 'account area'],
];

/**
 * Explains a refused navigation on the landing page.
 *
 * roleGuard sends an AUTHENTICATED user who lacks a role here with
 * `?denied=<attempted path>` rather than to /login (sending them to /login told
 * someone who had just signed in that they were not signed in — operator report
 * 2026-08-14, "moderation menu option just redirects to login"). Without this
 * component the redirect is honest but SILENT: the user clicks Moderation and simply
 * arrives somewhere else, which is only marginally better than the bounce it replaced.
 *
 * The wording deliberately separates the two things a user cannot tell apart from the
 * outside, because the fix is different for each:
 *
 *   * the menu OFFERED the console -> the shell believed the role was held, so the
 *     refusal came from the gateway disagreeing. On this platform that is usually
 *     Casdoor role membership having been stripped while the account record kept the
 *     role (the two sources /bff/session and the gateway read are different), and it
 *     is an ADMIN fix, not something the user can act on.
 *   * the menu did NOT offer it -> the user genuinely lacks the role and should ask
 *     for it.
 *
 * Saying "you do not have permission" in the first case would be actively wrong: the
 * account does hold the role.
 */
@Component({
  selector: 'hug-denied-notice',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (deniedPath()) {
      <div
        class="alert alert-warning d-flex flex-column gap-1"
        role="alert"
        data-testid="denied-notice"
      >
        <strong>The {{ consoleName() }} was not available.</strong>
        @if (roleLooksHeld()) {
          <span data-testid="denied-mismatch">
            Your account is listed as holding the role for it, so this is a
            server-side permissions mismatch rather than something you can change.
            Ask an administrator to re-check your role membership.
          </span>
        } @else {
          <span data-testid="denied-no-role">
            Your account does not currently hold the role it requires. Ask an
            administrator to grant it.
          </span>
        }
      </div>
    }
  `,
})
export class DeniedNoticeComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** The refused path, or '' when the visit was ordinary. */
  readonly deniedPath = computed(() => this.params()?.get('denied')?.trim() ?? '');

  /** A human name for the refused console; falls back to the raw path so an
   *  unmapped route still produces a sentence that reads. */
  readonly consoleName = computed(() => {
    const path = this.deniedPath();
    const hit = CONSOLE_NAMES.find(([prefix]) => path.startsWith(prefix));
    return hit ? hit[1] : path;
  });

  /**
   * Does the SHELL believe this user holds the role for the refused path?
   *
   * True means the menu would have offered it, so the refusal came from the gateway —
   * a mismatch between the account record and Casdoor, not a user-actionable
   * permission. Kept to the paths whose predicate is unambiguous; anything else falls
   * to the plain "you lack the role" wording rather than guessing.
   */
  readonly roleLooksHeld = computed(() => {
    const path = this.deniedPath();
    if (path.startsWith('/mod')) return this.session.isMod();
    if (path.startsWith('/admin')) return this.session.isAdmin();
    return false;
  });
}
