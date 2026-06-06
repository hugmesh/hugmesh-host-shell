import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withViewTransitions } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

// Bootstrapped only AFTER initFederation() has resolved the remote manifest (see
// main.ts). PATH-based routing (no withHashLocation) so the host's /login,
// /social/matrix, /social/mastodon and /admin line up with the fe-gateway path
// prefixes and each remote's nginx. We deliberately do NOT preload all modules:
// the four feature routes are native-federation remotes that must load lazily on
// navigation (and only when the session/guard allows), not eagerly at startup.
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      routes,
      withViewTransitions(),
    ),
  ],
}).catch((err) => console.error(err));
