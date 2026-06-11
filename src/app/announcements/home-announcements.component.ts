import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { AnnouncementsService } from './announcements.service';
import { HomeAnnouncement } from './announcement.model';

/**
 * The logged-in HOME top banner. Renders the active, home-targeted announcements
 * (fetched from GET /bff/announcements/home via AnnouncementsService) AT THE TOP of
 * the home page, in priority order, and renders nothing when there are none.
 *
 * SECURITY: each announcement's server-sanitized `body_html` is rendered inside a
 * SANDBOXED, null-origin `srcdoc` iframe (sandbox WITHOUT allow-same-origin and
 * WITHOUT allow-scripts), never via raw innerHTML. The iframe therefore cannot run
 * scripts, reach this origin's cookies/storage, or navigate the top frame.
 *
 * Accessibility: the banner is a labelled `role="region"` with `aria-live="polite"`
 * so newly-fetched announcements are announced without stealing focus; each
 * dismiss control is a real <button> (keyboard-operable) with an announcement-
 * specific aria-label. Non-dismissible announcements omit the control.
 *
 * Dismiss-once: dismissing persists the announcement id (AnnouncementsService ->
 * localStorage), mirroring the home getting-started-guide dismiss, so a dismissed
 * banner stays gone across reloads.
 */
@Component({
  selector: '[home-announcements]',
  host: {
    id: 'home-announcements',
  },
  templateUrl: './home-announcements.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home-announcements.component.scss',
})
export class HomeAnnouncementsComponent implements OnInit {
  private readonly service = inject(AnnouncementsService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Memoised srcdoc per announcement id, so the template binding returns a STABLE
   *  SafeHtml reference across change-detection cycles and the iframe doesn't reload
   *  (a fresh object each CD would force the iframe to re-render). */
  private readonly srcdocCache = new Map<string, SafeHtml>();

  /** The active, non-dismissed announcements to render (priority order). */
  readonly announcements = this.service.visible;

  ngOnInit(): void {
    // Fire-and-forget: a failed/empty fetch simply leaves the banner unrendered.
    void this.service.load();
  }

  /** Permanently dismiss (persisted) and re-render without this announcement. */
  dismiss(a: HomeAnnouncement): void {
    this.service.dismiss(a.id);
  }

  /** Build the sandboxed iframe document for one announcement. The body is the
   *  already server-sanitized admin HTML; we only wrap it with a charset + a tiny
   *  base style and inherit the host's color scheme. The iframe runs with no
   *  same-origin and no scripts (see the sandbox attribute in the template), so this
   *  document is inert: the trust bypass here is sound because the iframe can never
   *  execute the markup as script nor reach this origin. */
  srcdoc(a: HomeAnnouncement): SafeHtml {
    const cached = this.srcdocCache.get(a.id);
    if (cached) return cached;
    const doc = [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<meta name="referrer" content="no-referrer">',
      '<base target="_blank">',
      '<style>',
      ':root{color-scheme:dark}',
      'html,body{margin:0}',
      'body{font:400 1rem/1.5 Arial,Helvetica,sans-serif;color:#e8e8e8;',
      'word-break:break-word;overflow-wrap:anywhere}',
      'a{color:#ffd700}',
      'img,video,iframe{max-width:100%;height:auto}',
      '</style></head><body>',
      a.body_html,
      '</body></html>',
    ].join('');
    // Angular strips iframe[srcdoc] unless it is a trusted HTML value. The iframe's
    // sandbox (no allow-scripts, no allow-same-origin) makes the document inert.
    const safe = this.sanitizer.bypassSecurityTrustHtml(doc);
    this.srcdocCache.set(a.id, safe);
    return safe;
  }

  /** ngFor/@for trackBy: stable across re-sorts and dismissals. */
  trackById(_index: number, a: HomeAnnouncement): string {
    return a.id;
  }
}
