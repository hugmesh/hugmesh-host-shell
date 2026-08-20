import { loadRemoteModule } from '@angular-architects/native-federation';
import type { RemotesMap } from './federation-bootstrap';

/**
 * The DEFERRED-REMOTE seam: the shell's single choke point for turning a remote
 * NAME into a loaded module, and the reason the boot no longer stampedes every
 * remoteEntry.json in the manifest.
 *
 * THE PROBLEM THIS EXISTS TO FIX. `initFederation(remotes)` is EAGER by
 * construction: `getRemoteEntries` maps the whole manifest through
 * `Promise.all(fetchRemoteEntry(...))` before `bootstrapApplication` may run. So
 * handing it the full 13-remote manifest meant every boot fetched
 * /admin/remoteEntry.json, /mod/…, /wiki/…, /tube/… and the rest — *regardless of
 * who was asking*. Those paths are gated at the fe-gateway, so a LOGGED-OUT boot
 * produced twelve 401s (one per gated remote) before the login form could paint,
 * and a plain ROLE_USER boot still produced one per remote they don't hold a role
 * for. The requests were pure waste: `strictRemoteEntry` defaults to FALSE, so
 * native-federation logs `Could not fetch remote 'x'. skipping init.` and DROPS
 * the entry — nothing was ever gained by asking, because the answer was always
 * "no" and the answer was always discarded.
 *
 * THE FIX — ASK ONLY WHEN THE ROUTE IS ACTUALLY ENTERED. The manifest is still
 * resolved in full at boot (it is the shell's map of what EXISTS), but the map is
 * SPLIT: `initFederation` receives only the eager remotes, and everything else is
 * parked here as name -> remoteEntry URL. When a guard finally admits the user to
 * /admin, {@link federationLoader.load} calls
 * `loadRemoteModule({ remoteEntry, remoteName, exposedModule })` — the documented
 * lazy overload, whose `remoteEntry` option exists precisely to "enable
 * lazy-loading remotes not registered during initFederation". The orchestrator
 * runs its `initRemoteEntry` flow (updateCache -> poolDynamicExternals ->
 * convertToImportMap -> commitChanges), so the shared-external scope is negotiated
 * for the late remote exactly as it would have been at init.
 *
 * WHY THIS IS NOT AN AUTHZ CHANGE. The manifest only ever mapped name -> PUBLIC
 * bundle URL; gating was, and still is, done by the route GUARDS plus the gateway
 * and BFF authz. Deferring changes only WHEN the shell asks for a bundle, never
 * WHETHER the asker is allowed to have it — the gateway answers identically at
 * route-activation time as it would have at boot.
 *
 * A SIDE BENEFIT WORTH NAMING. Because the entry is fetched at activation rather
 * than at boot, a remote that gets enabled mid-session (the default-off tube /
 * owncast rows a superadmin can flip) resolves on the next navigation instead of
 * requiring a full page reload — previously the boot-time 401 dropped it for the
 * lifetime of the page.
 */

/**
 * name -> remoteEntry URL for remotes that were deliberately NOT initialized at
 * boot. Mutated in place by {@link setDeferredRemotes} so that the object
 * identity stays stable for any holder that captured it.
 */
const deferredRemotes: RemotesMap = {};

/**
 * Publish the deferred half of the resolved manifest. Called once from the
 * bootstrap (main.ts) with whatever {@link splitEagerRemotes} did not hand to
 * `initFederation`. Replaces (never merges) so a re-init in a test starts clean.
 */
export function setDeferredRemotes(remotes: RemotesMap): void {
  for (const name of Object.keys(deferredRemotes)) delete deferredRemotes[name];
  Object.assign(deferredRemotes, remotes);
}

/** The remoteEntry URL parked for `name`, or undefined if it was eager/unknown. */
export function deferredRemoteEntry(name: string): string | undefined {
  return deferredRemotes[name];
}

/**
 * Resolve a remote's exposed module, initializing the remote on demand when it
 * was deferred at boot.
 *
 * Indirected through a holder object (rather than exported as a bare function)
 * so unit tests can `spyOn(federationLoader, 'load')` — the native-federation ESM
 * namespace export is frozen and cannot be spied directly. This is the ONLY
 * place the shell calls `loadRemoteModule`; route `loadChildren` and the profile
 * modal both go through it, so neither can regress into the eager path
 * independently.
 */
export const federationLoader = {
  load: (remoteName: string, exposed: string): Promise<Record<string, unknown>> => {
    const remoteEntry = deferredRemotes[remoteName];
    // With `remoteEntry`: the lazy overload — initializes the remote (fetching its
    // entry NOW, under the caller's session) and then loads the exposed module.
    // Without it: the remote was eager-initialized at boot, so the classic
    // two-arg overload resolves it straight from the registry with no extra fetch.
    const loaded = remoteEntry
      ? nativeFederation.loadRemoteModule({ remoteEntry, remoteName, exposedModule: exposed })
      : nativeFederation.loadRemoteModule(remoteName, exposed);
    return loaded as Promise<Record<string, unknown>>;
  },
};

/** The native-federation entry point, behind a holder purely so unit tests can
 *  substitute it: the library's ESM namespace export is frozen and `spyOn` cannot
 *  attach to it. Nothing outside this module and its spec should touch this. */
export const nativeFederation = {
  loadRemoteModule: loadRemoteModule as (
    ...args: [string, string] | [{ remoteEntry: string; remoteName: string; exposedModule: string }]
  ) => Promise<unknown>,
};
