import { initFederation } from '@angular-architects/native-federation';
import { resolveRemotesMap, type RemotesMap } from './federation-bootstrap';
import { setDeferredRemotes } from './remote-loader';

/**
 * The host's federation boot STEP, extracted from main.ts so it can be asserted
 * directly. main.ts is a side-effecting entry module — importing it boots the app —
 * so the one behaviour that actually matters here (WHAT gets handed to
 * `initFederation`) was previously untestable, which is precisely how the eager
 * 401 storm survived a 40-spec suite.
 *
 * The dependencies are injected with real defaults so production wiring stays a
 * single call and the spec can drive every branch without a network or a live
 * federation runtime.
 */
export interface FederationBootDeps {
  /** Resolve the full { name: remoteEntryUrl } manifest (dynamic-first, static floor). */
  readonly resolveRemotes?: () => Promise<RemotesMap>;
  /** Park the deferred remotes for federationLoader to initialize on demand. */
  readonly setDeferred?: (remotes: RemotesMap) => void;
  /** Initialize native-federation. Receives the EAGER remotes only. */
  readonly init?: (remotes: RemotesMap) => Promise<unknown>;
}

/**
 * Remotes to initialize EAGERLY, before Angular bootstraps.
 *
 * Deliberately EMPTY. Every federated route in this shell is behind a guard and a
 * lazy `loadChildren`, so there is no remote the shell needs resolved before the
 * router has decided where the user is going — and asking early is not free: the
 * gateway gates these paths, so an early ask for a remote the caller has no role
 * for is a guaranteed 401 whose result native-federation then discards
 * (`strictRemoteEntry` is false). Anything added here must justify paying that
 * cost on EVERY boot, including a logged-out one.
 */
export const EAGER_REMOTES: readonly string[] = [];

/**
 * Split a resolved manifest into what to initialize now and what to park.
 * Pure and total: every entry lands in exactly one side, so a remote can never be
 * silently dropped by the split itself.
 */
export function splitEagerRemotes(all: RemotesMap): {
  eager: RemotesMap;
  deferred: RemotesMap;
} {
  const eager: RemotesMap = {};
  const deferred: RemotesMap = {};
  for (const [name, url] of Object.entries(all)) {
    if (EAGER_REMOTES.includes(name)) eager[name] = url;
    else deferred[name] = url;
  }
  return { eager, deferred };
}

/**
 * Resolve the manifest, park the deferred remotes, and initialize federation with
 * only the eager ones. Never rejects on a manifest failure — an empty map boots the
 * shell DARK rather than not at all.
 */
export async function bootFederation(deps: FederationBootDeps = {}): Promise<void> {
  const resolveRemotes = deps.resolveRemotes ?? (() => resolveRemotesMap());
  const setDeferred = deps.setDeferred ?? setDeferredRemotes;
  const init = deps.init ?? ((remotes: RemotesMap) => initFederation(remotes));

  const { eager, deferred } = splitEagerRemotes(await resolveRemotes());
  setDeferred(deferred);
  await init(eager);
}
