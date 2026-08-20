/**
 * Ambient declarations for the two BUNDLED-LOCALLY animation dependencies.
 * MIRRORS hugmesh-login-ui's `src/app/vanta.d.ts` verbatim.
 *
 * Neither package ships TypeScript types (three.js dropped its bundled `.d.ts`
 * long ago and publishes them as a separate `@types/three`; Vanta never had any),
 * and neither is worth pulling a large types package in for: this repo touches
 * exactly one three.js value — the module namespace, which it passes STRAIGHT
 * through to Vanta as the `THREE` option and never calls into — and exactly one
 * Vanta value, the effect factory. Typing those two surfaces here keeps the
 * dependency footprint honest and still gives `vanta-effects.ts` a real contract
 * to compile against.
 *
 * The `vanta/dist/*.min` subpaths are the PREBUILT UMD bundles. They are imported
 * rather than Vanta's `src/` entry because the sources are unbuilt ESM with glslify
 * shader imports, and because each dist file is a self-contained ~12KB effect that
 * takes three.js by injection — which is exactly the shape a lazy chunk wants.
 */

declare module 'three';

/** The instance a Vanta effect factory returns. */
interface VantaEffectInstance {
  /**
   * Push new options onto a RUNNING effect. Present on every effect via Vanta's
   * base class; every effect this repo ships re-reads its colour options inside the
   * per-frame update, so this is what makes a theme change restyle the background
   * live instead of forcing a teardown.
   */
  setOptions?(options: Record<string, unknown>): void;
  destroy(): void;
}

/** A Vanta effect factory: `EFFECT({ el, THREE, ...options })`. */
type VantaEffectFactory = (options: Record<string, unknown>) => VantaEffectInstance;

declare module 'vanta/dist/vanta.fog.min' {
  const effect: VantaEffectFactory;
  export default effect;
}

declare module 'vanta/dist/vanta.waves.min' {
  const effect: VantaEffectFactory;
  export default effect;
}

declare module 'vanta/dist/vanta.net.min' {
  const effect: VantaEffectFactory;
  export default effect;
}

declare module 'vanta/dist/vanta.globe.min' {
  const effect: VantaEffectFactory;
  export default effect;
}
