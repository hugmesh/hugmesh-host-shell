import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';

import { ProfileModalComponent, profileRemoteLoader } from './profile-modal.component';
import { ProfileModalService } from './profile-modal.service';

/** Stands in for the user remote's exposed ProfileComponent so the modal has a
 *  real focusable surface to trap focus within, without loading native-federation. */
@Component({
  selector: 'hug-user-profile',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<input data-testid="remote-input" /><button data-testid="remote-save">Save</button>`,
})
class RemoteProfileStub {}

describe('ProfileModalComponent', () => {
  let fixture: ComponentFixture<ProfileModalComponent>;
  let modal: ProfileModalService;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileModalComponent],
    }).compileComponents();

    spyOn(profileRemoteLoader, 'load').and.resolveTo(RemoteProfileStub);

    fixture = TestBed.createComponent(ProfileModalComponent);
    modal = TestBed.inject(ProfileModalService);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => document.body.classList.remove('modal-open'));

  const query = (sel: string) => el.querySelector(sel);

  it('renders nothing while closed', () => {
    expect(query('[data-testid="profile-modal"]')).toBeNull();
  });

  it('opens a role=dialog with aria-modal and a labelled title', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const dialog = query('[data-testid="profile-modal"]')!;
    expect(dialog).withContext('dialog renders when open').toBeTruthy();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('profile-modal-title');
    expect(query('#profile-modal-title')?.textContent).toContain('Your profile');
  }));

  it('loads + mounts the user remote ./profile ProfileComponent', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    expect(profileRemoteLoader.load).toHaveBeenCalled();
    expect(query('[data-testid="remote-input"]'))
      .withContext('the remote profile editor is mounted inside the dialog')
      .toBeTruthy();
  }));

  it('locks body scroll while open and releases it on close', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();
    expect(document.body.classList.contains('modal-open')).toBeTrue();

    modal.close();
    fixture.detectChanges();
    expect(document.body.classList.contains('modal-open')).toBeFalse();
  }));

  it('Escape closes the dialog', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const dialog = query('[data-testid="profile-modal"]') as HTMLElement;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(modal.isOpen()).withContext('Escape dismisses the modal').toBeFalse();
    expect(query('[data-testid="profile-modal"]')).toBeNull();
  }));

  it('the close button dismisses the modal', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    (query('[data-testid="profile-modal-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(modal.isOpen()).toBeFalse();
  }));

  it('a backdrop click dismisses the modal', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const backdrop = query('[data-testid="profile-modal-backdrop"]') as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(modal.isOpen()).withContext('clicking the backdrop closes').toBeFalse();
  }));

  it('a click on the dialog panel does NOT dismiss the modal', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    (query('[data-testid="profile-modal"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(modal.isOpen()).withContext('panel clicks are kept inside').toBeTrue();
  }));

  it('restores focus to the trigger on close (WCAG 2.4.3)', fakeAsync(() => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    modal.close();
    fixture.detectChanges();
    expect(document.activeElement).withContext('focus returns to the opener').toBe(trigger);

    trigger.remove();
  }));

  it('traps Tab: from the last focusable it wraps back to the first', fakeAsync(() => {
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const dialog = query('[data-testid="profile-modal"]') as HTMLElement;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, input'),
    );
    const last = focusables[focusables.length - 1];
    const first = focusables[0];
    last.focus();

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).withContext('Tab wraps to the first focusable').toBe(first);
  }));

  it('surfaces a role=alert when the remote fails to load', fakeAsync(() => {
    (profileRemoteLoader.load as jasmine.Spy).and.rejectWith(new Error('boom'));
    modal.open();
    fixture.detectChanges();
    flush();
    fixture.detectChanges();

    const alert = query('[data-testid="profile-modal-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
  }));
});
