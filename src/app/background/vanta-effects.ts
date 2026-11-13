/**
 * The LAZY loader for the animated background effects, and the whole reason the
 * shell's critical path is unchanged by this feature.
 *
 * MIRRORS hugmesh-login-ui's `src/app/vanta-effects.ts` verbatim — same chunks,
 * same probe, same reasoning. When editing anything here, diff it against
 * login-ui's copy first.
 *
 * three.js cannot be tree-shaken here — Vanta takes the module NAMESPACE by
 * injection (`{ THREE }`), so a bundler must keep all of it. Measured on login-ui's
 * production build it is a 735 KB chunk, 154 KB over the wire.
 * That is not acceptable as an eager cost on the shell every page of the mesh
 * renders inside: the routed content has to paint before a decorative backdrop has
 * downloaded anything. Every import below is therefore DYNAMIC, which is what lets
 * esbuild split three.js and each effect into their own chunks; nothing here is
 * fetched until {@link loadVantaEffect} is actually called, and it is not called at
 * all when the visitor asked for reduced motion, when the theme declares no
 * `vanta-*` effect, or when the machine has no WebGL.
 *
 * Vanta is BUNDLED (a package.json dependency), never CDN-loaded: every HugMesh UI
 * ships its own strict nonce'd CSP whose script-src is 'self' + nonce, so a
 * third-party script host would be both a policy violation and a new failure mode.
 * Both packages are also SKIPPED from the native-federation shared surface (see
 * federation.config.js) so sharing cannot hoist them out of their lazy chunks.
 *
 * The import map is STATIC (one thunk per id) rather than a template literal,
 * because a bundler can only split what it can see at build time — `import('vanta/'
 * + id)` would either fail to resolve or drag every effect into one chunk.
 */
import { BackgroundEffectId } from './background.types';

/** A live Vanta effect. Mirrors the ambient `VantaEffectInstance` (see vanta.d.ts). */
export interface VantaInstance {
  setOptions?(options: Record<string, unknown>): void;
  destroy(): void;
}

/** What one effect needs to start: its factory plus the three.js namespace to inject. */
export interface LoadedVantaEffect {
  readonly factory: (options: Record<string, unknown>) => VantaInstance;
  readonly three: unknown;
}

/** The signature {@link BackgroundComponent} depends on, so specs can substitute it. */
export type VantaEffectLoader = (id: BackgroundEffectId) => Promise<LoadedVantaEffect>;

const EFFECT_IMPORTS: Readonly<Record<BackgroundEffectId, () => Promise<{ default: unknown }>>> = {
  fog: () => import('vanta/dist/vanta.fog.min'),
  waves: () => import('vanta/dist/vanta.waves.min'),
  net: () => import('vanta/dist/vanta.net.min'),
  globe: () => import('vanta/dist/vanta.globe.min'),
};

/**
 * Fetch three.js and one effect module, in parallel.
 *
 * Both land in the browser's module cache, so switching effects afterwards costs a
 * second ~12KB effect chunk and nothing more — three.js is downloaded once.
 */
export const loadVantaEffect: VantaEffectLoader = async (id) => {
  const [three, effect] = await Promise.all([import('three'), EFFECT_IMPORTS[id]()]);
  return {
    three,
    factory: effect.default as (options: Record<string, unknown>) => VantaInstance,
  };
};

/**
 * Whether this browser can run any of it at all.
 *
 * Checked BEFORE the loader, not after: a machine with WebGL disabled (a locked-down
 * corporate profile, a headless browser, a GPU blocklist) would otherwise download
 * 154 KB (gzipped) to discover that Vanta's own init fails. Creating and dropping a probe
 * canvas costs microseconds; the whole call is wrapped because a browser that has
 * disabled WebGL by policy can THROW from getContext rather than return null.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
