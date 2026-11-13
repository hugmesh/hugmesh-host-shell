import { EFFECT_IMPORTS, loadVantaEffect, vantaFactory } from './vanta-effects';
import { BACKGROUND_EFFECT_IDS } from './background.types';

/**
 * Every theme's WebGL background silently never rendered: the loader read `.default`
 * off the dynamically imported Vanta UMD module, which after bundler interop is the
 * `{ default: effect }` OBJECT, so `factory(...)` threw inside startEffect's catch.
 * These import the REAL modules, the shape the production build sees.
 */
describe('vantaFactory', () => {
  it('unwraps the UMD double default', () => {
    const fn = () => ({ destroy: () => undefined });
    expect(vantaFactory({ default: { default: fn } })).toBe(fn as never);
  });

  it('accepts a module that exports the constructor directly', () => {
    const fn = () => ({ destroy: () => undefined });
    expect(vantaFactory({ default: fn })).toBe(fn as never);
  });

  it('refuses a module with no constructor', () => {
    expect(() => vantaFactory({ default: {} })).toThrowError(/no effect constructor/);
  });

  it('loadVantaEffect unwraps the shape the production (esbuild) build hands it', async () => {
    const fn = () => ({ destroy: () => undefined });
    const original = EFFECT_IMPORTS.waves;
    EFFECT_IMPORTS.waves = () => Promise.resolve({ default: { default: fn } });
    try {
      const { factory } = await loadVantaEffect('waves');
      expect(factory).toBe(fn as never);
    } finally {
      EFFECT_IMPORTS.waves = original;
    }
  });

  for (const id of BACKGROUND_EFFECT_IDS) {
    it(`the real '${id}' module yields a callable effect constructor`, async () => {
      const { factory, three } = await loadVantaEffect(id);
      expect(typeof factory).toBe('function');
      expect(three).toBeTruthy();
    });
  }
});
