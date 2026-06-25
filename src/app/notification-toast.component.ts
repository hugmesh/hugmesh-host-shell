import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationToastService } from './notification-toast.service';

@Component({
  selector: 'snap-notification-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-toast.component.html',
  styleUrls: ['./notification-toast.component.scss'],
})
export class NotificationToastComponent {
  protected readonly service = inject(NotificationToastService);
}
