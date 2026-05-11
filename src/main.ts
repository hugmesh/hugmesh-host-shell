import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation, withViewTransitions, withPreloading, PreloadAllModules } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      routes,
      withHashLocation(),
      withViewTransitions(),
      withPreloading(PreloadAllModules),
    ),
  ],
}).catch((err) => console.error(err));
