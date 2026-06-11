import { TestBed } from '@angular/core/testing';

import { AnnouncementsService, announcementsFetcher } from './announcements.service';
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

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let session: SessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    session = TestBed.inject(SessionService);
    service = TestBed.inject(AnnouncementsService);
  });

  afterEach(() => localStorage.clear());

  it('shows nothing and does not fetch when signed out', async () => {
    const spy = spyOn(announcementsFetcher, 'fetch').and.resolveTo([announcement()]);
    await service.load();
    expect(spy).not.toHaveBeenCalled();
    expect(service.visible().length).toBe(0);
  });

  it('fetches and exposes active home announcements when signed in', async () => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([announcement()]);
    await service.load();
    expect(service.visible().map((a) => a.id)).toEqual(['a1']);
  });

  it('sorts by priority descending', async () => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([
      announcement({ id: 'low', priority: 1 }),
      announcement({ id: 'high', priority: 9 }),
      announcement({ id: 'mid', priority: 5 }),
    ]);
    await service.load();
    expect(service.visible().map((a) => a.id)).toEqual(['high', 'mid', 'low']);
  });

  it('drops announcements whose window has not started / has ended', async () => {
    session.set(SESSION);
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([
      announcement({ id: 'notyet', starts_at: future }),
      announcement({ id: 'expired', ends_at: past }),
      announcement({ id: 'open' }),
    ]);
    await service.load();
    expect(service.visible().map((a) => a.id)).toEqual(['open']);
  });

  it('dismiss() hides the announcement and persists the id (dismiss-once)', async () => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([announcement({ id: 'a1' })]);
    await service.load();
    expect(service.visible().length).toBe(1);

    service.dismiss('a1');
    expect(service.visible().length).toBe(0);

    const stored = JSON.parse(localStorage.getItem('snap.announcements.dismissed')!);
    expect(stored).toContain('a1');
  });

  it('a previously-dismissed announcement stays hidden across a fresh service load', async () => {
    // Seed the persisted dismissals, then build a NEW service instance (mirrors a
    // fresh page load, where the service reads localStorage at construction).
    localStorage.setItem('snap.announcements.dismissed', JSON.stringify(['a1']));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshSession = TestBed.inject(SessionService);
    const fresh = TestBed.inject(AnnouncementsService);

    freshSession.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([announcement({ id: 'a1' })]);
    await fresh.load();
    expect(fresh.visible().length).toBe(0);
  });

  it('refuses to dismiss a non-dismissible announcement', async () => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.resolveTo([
      announcement({ id: 'pinned', dismissible: false }),
    ]);
    await service.load();
    service.dismiss('pinned');
    expect(service.visible().map((a) => a.id)).toEqual(['pinned']);
  });

  it('a failed fetch leaves the banner empty and records the error (never throws)', async () => {
    session.set(SESSION);
    spyOn(announcementsFetcher, 'fetch').and.rejectWith(new Error('boom'));
    await service.load();
    expect(service.visible().length).toBe(0);
    expect(service.loadError()).toContain('boom');
  });
});
