import { loadRemoteModule } from '@angular-architects/native-federation';

/**
 * THE ON-DEMAND REMOTE REGISTRATION SEAM.
 *
 * THE BUG THIS EXISTS TO FIX. `initFederation(map)` is a ONE-SHOT, BOOT-TIME
 * operation: it fetches EVERY remoteEntry.json in the map up front and registers
 * the ones that answered. A remote whose entry did NOT answer at that instant is
 * simply absent from the registry — and the NAME-ONLY call form
 * `loadRemoteModule('admin', './routes')` has NO retry path, so it throws
 * "unknown remote admin" for the whole life of that document.
 *
 * That is not hypothetical. Measured on the deployed shell (2026-08-20, logged
 * out): `/api/federation/manifest` plus twelve gated remoteEntry.json URLs all
 * answered 401, and the resulting registry held exactly two names — `login` and
 * the host itself. Every other remote was permanently unreachable in that tab.
 *
 * WHY A FULL RELOAD HID IT. The normal sign-in path HARD-navigates (login-ui's
 * `goToHost()` -> `hardNav.navigate('/')`), so a fresh document re-runs
 * initFederation WITH the session cookie and everything registers. The failure
 * only surfaces when a session appears WITHOUT a reload — which SessionService
 * explicitly supports: its `storage` listener adopts a sibling tab's sign-in
 * straight into the session signal (session.service.ts). In that tab the menu
 * lights up with role entries, the guards pass (they read the same signal), the
 * router activates the route... and the remote load throws, because the registry
 * is still the anonymous one. A menu full of dead links, with only a console
 * error to explain it.
 *
 * THE FIX. Remember every remoteEntry URL the boot resolved — including the ones
 * we deliberately did NOT fetch (see `planFederationBoot`) — and route BOTH of
 * the shell's remote-loading call sites through {@link loadRemote}, which passes
 * `remoteEntry` alongside `remoteName`. The installed adapter documents that
 * option precisely as the one that "enables lazy-loading remotes not registered
 * during initFederation": it calls `initRemoteEntry(remoteEntry, remoteName)`
 * first, registering the remote UNDER THE NAME WE PASS, then resolves the module.
 * The orchestrator's remote-info repo makes that idempotent, so a second
 * navigation to the same remote does not refetch.
 *
 * Passing the name explicitly also sidesteps the trap app.routes.ts documents:
 * derive-the-name-from-the-entry would register under the remote's OWN declared
 * name, which need not equal the manifest key.
 */

/**
 * The map is parked on a global namespace rather than in module scope, mirroring
 * native-federation's own `__NATIVE_FEDERATION__` global-cache idiom.
 *
 * `main.ts` (the pre-bootstrap entry) WRITES it and the lazily-imported app graph
 * (`./bootstrap` -> app.routes / profile-modal) READS it. Those live in different
 * chunks, and module-scope state is only shared between chunks as long as the
 * bundler keeps a single shared copy of this module. A global makes the handoff
 * true by construction instead of by build-graph luck.
 */
const NS = '__HUGMESH_FEDERATION__';

interface RemoteRegistryCache {
  /** remote name (the MANIFEST KEY) -> its remoteEntry.json URL. */
  entries: Map<string, string>;
}

const globalScope = globalThis as unknown as Record<string, RemoteRegistryCache | undefined>;
globalScope[NS] ??= { entries: new Map<string, string>() };
const cache: RemoteRegistryCache = globalScope[NS] as RemoteRegistryCache;

/**
 * Record the FULL resolved remote map at boot — every remote the manifest knows
 * about, whether or not it was eagerly fetched. This is what makes deferring the
 * gated remotes safe: nothing is forgotten, it is only left unfetched.
 */
export function rememberRemoteEntries(remotes: Readonly<Record<string, string>>): void {
  for (const [name, url] of Object.entries(remotes)) {
    if (typeof name === 'string' && name.length > 0 && typeof url === 'string' && url.length > 0) {
      cache.entries.set(name, url);
    }
  }
}

/** The remembered remoteEntry URL for `remoteName`, or undefined if unknown. */
export function remoteEntryFor(remoteName: string): string | undefined {
  return cache.entries.get(remoteName);
}

/** Every remembered remote name. Exposed for tests and diagnostics. */
export function knownRemoteNames(): readonly string[] {
  return [...cache.entries.keys()];
}

/** Drop everything remembered. Test-only — keeps specs independent of each other. */
export function forgetRemoteEntries(): void {
  cache.entries.clear();
}

/**
 * Indirection over the native-federation ESM export so unit tests can stub it —
 * the namespace object itself is frozen and cannot be spied. Same holder idiom
 * `federationLoader` (app.routes.ts) and `profileRemoteLoader` (profile-modal)
 * already use.
 */
export const nativeFederation = {
  loadRemoteModule: (options: {
    remoteName: string;
    remoteEntry?: string;
    exposedModule: string;
  }): Promise<unknown> => loadRemoteModule(options),
};

/**
 * Load an exposed module from a federated remote, registering that remote FIRST
 * if the boot did not already do so.
 *
 * This is the ONLY way the shell should reach a remote. Calling
 * `loadRemoteModule(name, exposed)` directly re-introduces the retry-less
 * name-only form and with it the dead-link bug described at the top of this file.
 */
export async function loadRemote(
  remoteName: string,
  exposedModule: string,
): Promise<Record<string, unknown>> {
  const remoteEntry = remoteEntryFor(remoteName);
  const module = await nativeFederation.loadRemoteModule(
    // `remoteEntry` is omitted (not passed as undefined) when unknown, so the
    // adapter takes its plain registered-remote path rather than trying to fetch
    // a bogus entry.
    remoteEntry ? { remoteName, remoteEntry, exposedModule } : { remoteName, exposedModule },
  );
  return module as Record<string, unknown>;
}
