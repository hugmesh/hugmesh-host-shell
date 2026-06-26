import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { bearerInterceptor } from './app/http/bearer.interceptor';

// Bootstrapped only AFTER initFederation() has resolved the remote manifest (see
// main.ts). PATH-based routing (no withHashLocation) so the host's /login,
// /social/matrix, /social/mastodon and /admin line up with the fe-gateway path
// prefixes and each remote's nginx. We deliberately do NOT preload all modules:
// the four feature routes are native-federation remotes that must load lazily on
// navigation (and only when the session/guard allows), not eagerly at startup.
//
// provideHttpClient(withInterceptors([bearerInterceptor])) gives the host a real
// HttpClient (it used raw fetch before) with the single credentials seam, so the
// home-services capability fetch — and any future ng-openapi-gen typed client —
// carries the HttpOnly session cookie (the gateway exchanges it for the upstream
// bearer server-side; the browser never holds a bearer).
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      routes,
      withViewTransitions(),
    ),
    provideHttpClient(withInterceptors([bearerInterceptor])),
  ],
}).catch((err) => console.error(err));
