import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';

import { HomeAnnouncementsComponent } from './home-announcements.component';
import { announcementsFetcher } from './announcements.service';
import { HomeAnnouncement } from './announcement.model';
import { SessionService, SnapSession } from '../session.service';

const SESSION: SnapSession = {
  id: 'google:alice@example.com',
  label: 'alice',
  provider: 'google',
  roles: ['user'],
  bffToken: 't',
  registrationComplete: true,
  matrix: null,
  mastodon: null,
};

function announcement(over: Partial<HomeAnnouncement> = {}): HomeAnnouncement {
  return {
    id: 'a1',
    title: 'Heads up',
    body_html: '<p>hello</p>',
    priority: 0,
    dismissible: true,
    starts_at: null,
    ends_at: null,
    ...over,
  };
}

describe('HomeAnnouncementsComponent', () => {
  let fixture: ComponentFixture<HomeAnnouncementsComponent>;
  let el: HTMLElement;
  let session: SessionService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [HomeAnnouncementsComponent],
    }).compileComponents();
    session = TestBed.inject(SessionService);
  });

  afterEach(() => localStorage.clear());

  function create(): void {
    fixture = TestBed.createComponent(HomeAnnouncementsComponent);
    el = fixture.nativeElement as HTMLElement;
  }

  const query = (sel: string) => el.querySelector(sel);
  const queryAll = (sel: string) => Array.from(el.querySelectorAll(sel));

  it('renders nothing when there are no active announcements', fakeAsync(() => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([]);
    create();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();
    expect(query('[data-testid="home-announcements"]')).toBeNull();
  }));

  it('renders nothing for a signed-out visitor (no fetch)', fakeAsync(() => {
    const spy = spyOn(announcementsFetcher, 'fetch').and.resolveTo([announcement()]);
    create();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();
    expect(spy).not.toHaveBeenCalled();
    expect(query('[data-testid="home-announcements"]')).toBeNull();
  }));

  it('renders an active announcement as a labelled live region', fakeAsync(() => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([announcement()]);
    create();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const region = query('[data-testid="home-announcements"]')!;
    expect(region).toBeTruthy();
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Site announcements');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(query('[data-testid="home-announcement-title"]')?.textContent?.trim()).toBe('Heads up');
  }));

  it('renders the body in a fully-sandboxed null-origin srcdoc iframe (never innerHTML)', fakeAsync(() => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([
      announcement({ body_html: '<p>danger<script>x()</' + 'script></p>' }),
    ]);
    create();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const iframe = query('[data-testid="home-announcement-body"]') as HTMLIFrameElement;
    expect(iframe.tagName).toBe('IFRAME');
    // Empty sandbox => no allow-scripts and no allow-same-origin => null origin, inert.
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.getAttribute('srcdoc')).toContain('danger');
    // The markup lives only inside the iframe document, never in the host DOM.
    expect(el.innerHTML).not.toContain('<p>danger');
  }));

  it('orders announcements by priority descending', fakeAsync(() => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([
      announcement({ id: 'low', title: 'Low', priority: 1 }),
      announcement({ id: 'high', title: 'High', priority: 9 }),
    ]);
    create();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const titles = queryAll('[data-testid="home-announcement-title"]').map((h) => h.textContent?.trim());
    expect(titles).toEqual(['High', 'Low']);
  }));

  it('dismiss button removes the announcement and persists it (dismiss-once)', fakeAsync(() => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([announcement({ id: 'a1' })]);
    create();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const btn = query('[data-testid="home-announcement-dismiss"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBe('Dismiss announcement: Heads up');
    btn.click();
    fixture.detectChanges();

    expect(query('[data-testid="home-announcements"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem('snap.announcements.dismissed')!)).toContain('a1');
  }));

  it('omits the dismiss control for a non-dismissible announcement', fakeAsync(() => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([
      announcement({ dismissible: false }),
    ]);
    create();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    expect(query('[data-testid="home-announcement-dismiss"]')).toBeNull();
    expect(query('[data-testid="home-announcement"]')).toBeTruthy();
  }));
});
