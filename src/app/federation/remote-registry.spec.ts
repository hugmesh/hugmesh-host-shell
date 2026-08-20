import {
  forgetRemoteEntries,
  knownRemoteNames,
  loadRemote,
  nativeFederation,
  rememberRemoteEntries,
  remoteEntryFor,
} from './remote-registry';

/**
 * THE ON-DEMAND REGISTRATION SEAM.
 *
 * These pin the half of the 401-storm fix that makes DEFERRING safe. Boot-time
 * gating (federation-bootstrap.spec.ts) stops the shell dialling twelve gated
 * remotes while logged out; this file proves the deferred ones are still
 * REACHABLE afterwards, because `loadRemote` hands native-federation the
 * remembered `remoteEntry` URL and lets it register the remote on demand.
 *
 * Without that, deferring would trade a console storm for dead navigation — and
 * the same dead-navigation bug already existed for any tab that adopted a
 * sibling tab's sign-in without reloading (SessionService's `storage` listener).
 */
describe('remote-registry', () => {
  beforeEach(() => forgetRemoteEntries());
  afterEach(() => forgetRemoteEntries());

  describe('rememberRemoteEntries / remoteEntryFor', () => {
    it('remembers every remote name -> remoteEntry URL the boot resolved', () => {
      rememberRemoteEntries({
        login: '/login/remoteEntry.json',
        admin: '/admin/remoteEntry.json',
      });
      expect(remoteEntryFor('login')).toBe('/login/remoteEntry.json');
      expect(remoteEntryFor('admin')).toBe('/admin/remoteEntry.json');
      expect([...knownRemoteNames()].sort()).toEqual(['admin', 'login']);
    });

    it('returns undefined for a remote it was never told about', () => {
      rememberRemoteEntries({ login: '/login/remoteEntry.json' });
      expect(remoteEntryFor('admin')).toBeUndefined();
    });

    it('ignores malformed rows rather than remembering a bogus entry URL', () => {
      rememberRemoteEntries({
        good: '/good/remoteEntry.json',
        empty: '',
        nope: undefined as unknown as string,
      });
      expect(knownRemoteNames()).toEqual(['good']);
    });

    it('a later boot OVERRIDES a remembered URL for the same name', () => {
      rememberRemoteEntries({ admin: '/admin/remoteEntry.json' });
      rememberRemoteEntries({ admin: '/db/admin/remoteEntry.json' });
      expect(remoteEntryFor('admin')).toBe('/db/admin/remoteEntry.json');
    });
  });

  describe('loadRemote — registers a DEFERRED remote on demand', () => {
    it('passes the remembered remoteEntry alongside the remoteName', async () => {
      // The regression this file exists for. `admin` was DEFERRED at boot (its
      // remoteEntry was never fetched, so native-federation never registered it).
      // The name-only call form has no retry path and would throw "unknown remote
      // admin"; passing remoteEntry is what makes the adapter register it first.
      rememberRemoteEntries({ admin: '/admin/remoteEntry.json' });
      const spy = spyOn(nativeFederation, 'loadRemoteModule').and.resolveTo({
        ADMIN_ROUTES: [],
      });

      await loadRemote('admin', './routes');

      expect(spy).toHaveBeenCalledOnceWith({
        remoteName: 'admin',
        remoteEntry: '/admin/remoteEntry.json',
        exposedModule: './routes',
      });
    });

    it('names the remote EXPLICITLY, never leaving it derived from the entry', async () => {
      // app.routes.ts documents the trap: native-federation would otherwise
      // register a remote under the name declared INSIDE its remoteEntry.json,
      // which need not equal the manifest key, producing "unknown remote" with no
      // failed request to point at. Passing remoteName pins the key we look up.
      rememberRemoteEntries({ 'character-studio': '/character-studio/remoteEntry.json' });
      const spy = spyOn(nativeFederation, 'loadRemoteModule').and.resolveTo({});

      await loadRemote('character-studio', './routes');

      const options = spy.calls.mostRecent().args[0];
      expect(options.remoteName).toBe('character-studio');
      expect(options.remoteEntry).toBe('/character-studio/remoteEntry.json');
    });

    it('OMITS remoteEntry entirely for an unknown remote (no bogus URL fetched)', async () => {
      const spy = spyOn(nativeFederation, 'loadRemoteModule').and.resolveTo({});

      await loadRemote('mystery', './routes');

      expect(spy).toHaveBeenCalledOnceWith({
        remoteName: 'mystery',
        exposedModule: './routes',
      });
      expect('remoteEntry' in spy.calls.mostRecent().args[0]).toBeFalse();
    });

    it('returns the resolved remote module to the caller', async () => {
      const sentinel = { ADMIN_ROUTES: [{ path: 'x' }] };
      rememberRemoteEntries({ admin: '/admin/remoteEntry.json' });
      spyOn(nativeFederation, 'loadRemoteModule').and.resolveTo(sentinel);

      await expectAsync(loadRemote('admin', './routes')).toBeResolvedTo(sentinel);
    });

    it('propagates a load failure instead of resolving to something empty', async () => {
      rememberRemoteEntries({ admin: '/admin/remoteEntry.json' });
      spyOn(nativeFederation, 'loadRemoteModule').and.rejectWith(new Error('boom'));

      await expectAsync(loadRemote('admin', './routes')).toBeRejectedWithError('boom');
    });
  });
});
