import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { BrandNameService } from '../brand-name.service';
import { LinksComponent } from './links/links.component';
import { HomeAnnouncementsComponent } from '../announcements/home-announcements.component';
import { HomeServicesComponent } from '../home-services/home-services.component';
import { DeniedNoticeComponent } from './denied-notice.component';

@Component({
  selector: '[home]',
  imports: [
    LinksComponent,
    HomeAnnouncementsComponent,
    HomeServicesComponent,
    DeniedNoticeComponent,
  ],
  host: {
    class: 'container mt-1 mb-5',
  },
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  /** What this deploy calls itself (the theme's wordmark, else the served title). */
  readonly brand = inject(BrandNameService).name;
}
