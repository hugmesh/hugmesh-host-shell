import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { REMOTE_ROUTES, routes } from './app.routes';
import { ShellTitleStrategy } from './shell-title.strategy';

@Component({ template: '' })
class BlankComponent {}

/** WCAG 2.4.2: every route gets "<page> — <brand>", not the bare brand. */
describe('ShellTitleStrategy', () => {
  let saved: string;

  beforeEach(() => {
    saved = document.title;
    // The brand is read from the served <title> at boot; a rebranded deploy
    // must keep its own name.
    document.title = 'ExampleMesh';
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'wiki', title: 'Wiki', children: [
            { path: '', component: BlankComponent },
            { path: 'history', title: 'Page history', component: BlankComponent },
          ] },
          { path: 'untitled', component: BlankComponent },
        ]),
        { provide: TitleStrategy, useClass: ShellTitleStrategy },
      ],
    });
  });

  afterEach(() => {
    document.title = saved;
  });

  it('titles a shell mount "<page> — <brand>"', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/wiki');
    expect(TestBed.inject(Title).getTitle()).toBe('Wiki — ExampleMesh');
  });

  it("prefers a remote's own deeper route title", async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/wiki/history');
    expect(TestBed.inject(Title).getTitle()).toBe('Page history — ExampleMesh');
  });

  it('falls back to the bare brand when no route names the page', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/untitled');
    expect(TestBed.inject(Title).getTitle()).toBe('ExampleMesh');
  });
});

describe('route titles', () => {
  it('every federated mount carries a non-empty, distinct title', () => {
    const titles = REMOTE_ROUTES.map((r) => r.title);
    for (const r of REMOTE_ROUTES) {
      expect(r.title?.trim()).withContext(r.path).toBeTruthy();
    }
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('the shell route for each mount carries that title', () => {
    for (const spec of REMOTE_ROUTES) {
      const route = routes.find((x) => x.path === spec.path);
      expect(route?.title).withContext(spec.path).toBe(spec.title);
    }
  });

  it('home and about are titled', () => {
    expect(routes.find((x) => x.path === 'home')?.title).toBe('Home');
    expect(routes.find((x) => x.path === 'about')?.title).toBe('About');
  });
});
