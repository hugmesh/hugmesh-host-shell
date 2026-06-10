import { TestBed } from '@angular/core/testing';
import { ProfileModalService } from './profile-modal.service';

describe('ProfileModalService', () => {
  let service: ProfileModalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProfileModalService);
  });

  it('starts closed', () => {
    expect(service.isOpen()).toBeFalse();
  });

  it('open() toggles the dialog on, close() toggles it off', () => {
    service.open();
    expect(service.isOpen()).toBeTrue();
    service.close();
    expect(service.isOpen()).toBeFalse();
  });
});
