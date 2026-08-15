import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { convertToParamMap, ParamMap } from '@angular/router';

import { DeniedNoticeComponent } from './denied-notice.component';
import { SessionService } from '../session.service';

/**
 * The notice that completes the /login-redirect fix.
 *
 * roleGuard now sends a signed-in user who lacks a role to /home?denied=<path> instead
 * of /login. That stopped telling them they were signed out, but on its own it is a
 * SILENT redirect — click Moderation, arrive somewhere else, no reason given. These
 * tests pin the part that makes it honest, and specifically the distinction the
 * operator's own incident turned on:
 *
 *   menu offered it + refused  -> the shell believed the role was held, so the gateway
 *                                 disagreed. Server-side mismatch, ADMIN fix.
 *   menu did not offer it      -> the user genuinely lacks the role.
 *
 * Telling someone "you do not have permission" in the first case is actively wrong —
 * their account does hold the role — and that wording is what would send them chasing
 * the wrong fix, which is exactly what the /login bounce did.
 */
describe('DeniedNoticeComponent', () => {
  let params: BehaviorSubject<ParamMap>;
  let session: { isMod: () => boolean; isAdmin: () => boolean };

  function setup(denied: string | null, roles: Partial<typeof session> = {}) {
    params = new BehaviorSubject<ParamMap>(
      convertToParamMap(denied === null ? {} : { denied }),
    );
    session = { isMod: () => false, isAdmin: () => false, ...roles };
    TestBed.configureTestingModule({
      imports: [DeniedNoticeComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: SessionService, useValue: session },
      ],
    });
    const fixture = TestBed.createComponent(DeniedNoticeComponent);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ReturnType<typeof setup>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function has(fixture: ReturnType<typeof setup>, testid: string): boolean {
    return !!(fixture.nativeElement as HTMLElement)
      .querySelector(`[data-testid="${testid}"]`);
  }

  it('renders NOTHING on an ordinary visit', () => {
    const f = setup(null);
    expect(has(f, 'denied-notice')).toBeFalse();
  });

  it('names the console in words, not as a route path', () => {
    const f = setup('/mod');
    expect(has(f, 'denied-notice')).toBeTrue();
    expect(text(f)).toContain('moderation console');
    expect(text(f)).not.toContain('/mod');
  });

  it('maps the nested admin docs route before the admin prefix', () => {
    // '/admin/docs' also startsWith '/admin', so order in the table is load-bearing.
    expect(text(setup('/admin/docs'))).toContain('API documentation');
  });

  it('falls back to the raw path for an unmapped route rather than an empty sentence', () => {
    expect(text(setup('/something-new'))).toContain('/something-new');
  });

  describe('when the SHELL believes the role IS held', () => {
    it('calls it a server-side mismatch and does not blame the user', () => {
      const f = setup('/mod', { isMod: () => true });
      expect(has(f, 'denied-mismatch')).toBeTrue();
      expect(has(f, 'denied-no-role')).toBeFalse();
      expect(text(f)).toContain('server-side permissions mismatch');
    });

    it('does the same for the admin console', () => {
      expect(has(setup('/admin', { isAdmin: () => true }), 'denied-mismatch')).toBeTrue();
    });

    it('NEVER claims the account lacks the role — it demonstrably has it', () => {
      const f = setup('/mod', { isMod: () => true });
      expect(text(f)).not.toContain('does not currently hold');
    });
  });

  describe('when the role is genuinely absent', () => {
    it('says so and points at an administrator', () => {
      const f = setup('/mod');
      expect(has(f, 'denied-no-role')).toBeTrue();
      expect(has(f, 'denied-mismatch')).toBeFalse();
      expect(text(f)).toContain('does not currently hold');
    });

    it('uses the plain wording for routes whose predicate is ambiguous', () => {
      // Only /mod and /admin have an unambiguous shell-side predicate; anything else
      // must not guess that the role is held.
      expect(has(setup('/wiki'), 'denied-no-role')).toBeTrue();
    });
  });
});
