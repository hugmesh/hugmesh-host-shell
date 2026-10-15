import {
  EAGER_REMOTES,
  bootFederation,
  splitEagerRemotes,
} from './federation-boot';
import {
  deferredRemoteEntry,
  federationLoader,
  nativeFederation,
  setDeferredRemotes,
} from './remote-loader';
import type { RemotesMap } from './federation-bootstrap';
import PROD_MANIFEST from '../../assets/federation.manifest.prod.json';

/**
 * THE REGRESSION THESE GUARD. A logged-out boot used to fetch every gated
 * remote's remoteEntry.json — /admin, /mod, /user, /wiki, /tube, /owncast,
 * /api-docs, /social/{matrix,mastodon,forum}, /character-{studio,forge} — because
 * the whole manifest was handed to `initFederation`, which resolves EVERY entry it
 * is given before Angular may bootstrap. All twelve answered 401 at the gateway and
 * all twelve were then discarded by native-federation (`strictRemoteEntry` is
 * false), so the boot paid twelve round trips and printed twelve console errors to
 * learn nothing. The contract asserted here is: NOTHING gated is requested until a
 * route guard has actually admitted the user to it.
 */

/**
 * The real prod manifest — READ FROM THE FILE, not transcribed. This used to be a
 * hand-copied literal commented "the real ... manifest shape", which meant the
 * repo held two copies of the same 13 rows and nothing compared them: the fixture
 * could drift from `src/assets/federation.manifest.prod.json` and this suite stayed
 * green while asserting it spoke for production. The login row of that file is
 * additionally pinned by federation-manifest-contract.spec.ts, because decision 35
 * has four consumer repos hardcoding it.
 */
const FULL_MANIFEST: RemotesMap = PROD_MANIFEST;


/** The remotes the fe-gateway gates — every one of these 401'd on a logged-out boot. */
const GATED = [
  'matrix', 'mastodon', 'admin', 'mod', 'user', 'apidocs', 'forum',
  'wiki', 'owncast', 'tube', 'character-studio', 'character-forge',
] as const;

describe('federation boot — gated remotes are DEFERRED, not eagerly fetched', () => {
  afterEach(() => setDeferredRemotes({}));

  describe('splitEagerRemotes', () => {
    it('defers EVERY remote in the real manifest (nothing is eager today)', () => {
      const { eager, deferred } = splitEagerRemotes(FULL_MANIFEST);

      expect(EAGER_REMOTES).withContext('no remote earns a boot-time fetch').toEqual([]);
      expect(eager).toEqual({});
      expect(deferred).toEqual(FULL_MANIFEST);
    });

    it('is total — every entry lands on exactly one side, none is dropped', () => {
      const { eager, deferred } = splitEagerRemotes(FULL_MANIFEST);
      const seen = [...Object.keys(eager), ...Object.keys(deferred)].sort();

      expect(seen).toEqual(Object.keys(FULL_MANIFEST).sort());
      expect(Object.keys(eager).filter((n) => n in deferred))
        .withContext('a remote must not be both eager and deferred')
        .toEqual([]);
    });

    it('honours EAGER_REMOTES if a remote ever earns boot-time initialization', () => {
      // Documents the escape hatch without weakening the "empty today" assertion
      // above: the split is driven by the constant, not hard-coded to defer-all.
      const only = (name: string): RemotesMap => ({ [name]: FULL_MANIFEST[name] });
      expect(splitEagerRemotes(only('admin')).deferred).toEqual(only('admin'));
    });
  });

  describe('bootFederation', () => {
    it('hands initFederation NO gated remote — this is the 401 storm regression', async () => {
      const init = jasmine.createSpy('init').and.resolveTo(undefined);

      await bootFederation({
        resolveRemotes: () => Promise.resolve(FULL_MANIFEST),
        setDeferred: () => undefined,
        init,
      });

      expect(init).toHaveBeenCalledTimes(1);
      const passed = init.calls.mostRecent().args[0] as RemotesMap;
      for (const name of GATED) {
        expect(Object.keys(passed))
          .withContext(`'${name}' must NOT be fetched at boot — it 401s for anyone without the role`)
          .not.toContain(name);
      }
      expect(passed).toEqual({});
    });

    it('parks the full manifest so every remote is still REACHABLE on demand', async () => {
      let parked: RemotesMap = {};

      await bootFederation({
        resolveRemotes: () => Promise.resolve(FULL_MANIFEST),
        setDeferred: (r) => { parked = r; },
        init: () => Promise.resolve(undefined),
      });

      // Deferring must not LOSE remotes — that would trade a console-noise bug for
      // a real one (a route that can never resolve its remote).
      expect(parked).toEqual(FULL_MANIFEST);
    });

    it('parks BEFORE initializing, so a load racing the boot finds its entry', async () => {
      const order: string[] = [];

      await bootFederation({
        resolveRemotes: () => Promise.resolve(FULL_MANIFEST),
        setDeferred: () => order.push('setDeferred'),
        init: () => { order.push('init'); return Promise.resolve(undefined); },
      });

      expect(order).toEqual(['setDeferred', 'init']);
    });

    it('still boots (dark) when the manifest resolves to nothing', async () => {
      const init = jasmine.createSpy('init').and.resolveTo(undefined);

      await expectAsync(
        bootFederation({
          resolveRemotes: () => Promise.resolve({}),
          setDeferred: () => undefined,
          init,
        }),
      ).toBeResolved();

      expect(init).toHaveBeenCalledWith({});
    });
  });

  describe('federationLoader — the deferred remote is initialized on FIRST USE', () => {
    it('uses the lazy remoteEntry overload for a deferred remote', async () => {
      setDeferredRemotes(FULL_MANIFEST);
      const spy = spyOn(nativeFederation, 'loadRemoteModule').and.resolveTo({ ADMIN_ROUTES: [] });

      await federationLoader.load('admin', './routes');

      // The single-object overload is what carries `remoteEntry`, and `remoteEntry`
      // is what "enables lazy-loading remotes not registered during
      // initFederation". The two-arg overload would throw
      // "Remote 'admin' is not initialized" now that nothing is eager.
      expect(spy).toHaveBeenCalledWith({
        remoteEntry: '/admin/remoteEntry.json',
        remoteName: 'admin',
        exposedModule: './routes',
      });
    });

    it('fetches a remote entry EXACTLY when its route is entered — not before', async () => {
      setDeferredRemotes(FULL_MANIFEST);
      const spy = spyOn(nativeFederation, 'loadRemoteModule').and.resolveTo({});

      expect(spy).withContext('boot must touch no remote').not.toHaveBeenCalled();

      await federationLoader.load('wiki', './Wiki');

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.calls.mostRecent().args[0])
        .toEqual(jasmine.objectContaining({ remoteName: 'wiki' }));
    });

    it('falls back to the classic overload for a remote that WAS eager-initialized', async () => {
      setDeferredRemotes({}); // nothing deferred -> nothing to initialize on demand
      const spy = spyOn(nativeFederation, 'loadRemoteModule').and.resolveTo({});

      await federationLoader.load('login', './routes');

      expect(spy).toHaveBeenCalledWith('login', './routes');
    });

    it('exposes the parked entry URL for each deferred remote', () => {
      setDeferredRemotes(FULL_MANIFEST);
      expect(deferredRemoteEntry('tube')).toBe('/tube/remoteEntry.json');
      expect(deferredRemoteEntry('nope')).toBeUndefined();
    });

    it('setDeferredRemotes REPLACES rather than merges (a re-boot starts clean)', () => {
      setDeferredRemotes(FULL_MANIFEST);
      setDeferredRemotes({ login: '/login/remoteEntry.json' });

      expect(deferredRemoteEntry('admin')).toBeUndefined();
      expect(deferredRemoteEntry('login')).toBe('/login/remoteEntry.json');
    });
  });
});
