/**
 * Light ramps: the routed backpane follows the theme's own page surface.
 *
 * It was rgba($black, 0.82) whatever the theme, so on a light ramp the theme's dark ink
 * sat on a near-black pane and every routed page was unreadable (seen in the Studio's
 * host-shell preview on the afternoon ramp). Reads the compiled global stylesheet.
 */
export {};

describe('light-ramp surfaces', () => {
  const root = document.documentElement;
  let outlet: HTMLElement;
  let pane: HTMLElement;

  beforeEach(() => {
    outlet = document.createElement('router-outlet');
    pane = document.createElement('div');
    document.body.append(outlet, pane);
  });

  afterEach(() => {
    outlet.remove();
    pane.remove();
    root.style.removeProperty('--hug-bg-0-rgb');
  });

  it('unthemed, the backpane is the shipped near-black scrim', () => {
    expect(getComputedStyle(pane).backgroundColor).toBe('rgba(10, 10, 10, 0.82)');
  });

  it('on a light ramp the backpane is the theme surface, not black', () => {
    root.style.setProperty('--hug-bg-0-rgb', '253, 250, 244'); // afternoon bg-0
    expect(getComputedStyle(pane).backgroundColor).toBe('rgba(253, 250, 244, 0.82)');
  });
});
