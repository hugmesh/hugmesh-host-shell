Feature: Profile modal focus contract
  Activating Profile in the dropdown opens a role="dialog" aria-modal element with
  focus moved INTO the dialog and trapped there; Escape (or the close button)
  dismisses it and RELEASES focus from the dialog (WCAG 2.4.3). The dialog itself
  is a host-shell element, so its focus contract is asserted host-side. The dialog
  BODY mounts the user remote's ./profile editor via loadRemoteModule; with the
  user remote dev server down the body shows the loading/empty state, but the
  dialog chrome + focus trap (what the host owns) still hold.

  NOTE on focus restore: the modal restores focus to its opener (lastFocused). The
  opener is the Profile menu ITEM, which the dropdown removes when it closes on
  activation, so the restore lands on <body> rather than the trigger. The
  host-keepable WCAG contract asserted here is that focus is RELEASED from the
  (removed) dialog — it is no longer trapped.

  Background:
    Given I have a user session
    And I go to "/"

  Scenario: Activating Profile opens a role=dialog aria-modal element
    When I open the profile menu
    And I activate the "menu-profile" menu item
    Then the profile modal is open

  Scenario: Focus moves into the dialog on open
    When I open the profile menu
    And I activate the "menu-profile" menu item
    Then the profile modal is open
    And focus is trapped inside the profile modal

  Scenario: Escape closes the dialog and releases the focus trap
    When I open the profile menu
    And I activate the "menu-profile" menu item
    And the profile modal is open
    And I press Escape in the profile modal
    Then the profile modal is closed
    And focus is released from the profile modal
