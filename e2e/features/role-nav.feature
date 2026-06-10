Feature: Universal nav and role-gated profile menu
  Every authenticated role sees the universal nav (Home | Mastodon | Matrix) and a
  profile dropdown (Profile + Sign out). The role-specific shortcuts are gated: the
  Admin entry on isAdmin() (roles includes 'admin'); the Moderation entry on
  isMod() (roles includes 'mod'). A plain user sees neither; a moderator sees
  Moderation only; a full-privilege admin (roles admin+mod) sees both. This is the
  role-gating / mod-isolation invariant at the UI level, asserted purely on the
  HOST — it needs no remote (the nav renders from the session signals alone).

  Background:
    Given I have a user session
    And I go to "/"

  Scenario: The universal nav entries are present for an authenticated role
    Then the navigation has a "nav-home" entry
    And the navigation has a "nav-mastodon" entry
    And the navigation has a "nav-matrix" entry

  Scenario: The profile dropdown opens on click and holds Profile + Sign out
    When I open the profile menu
    Then the profile menu is open
    And the profile menu contains "menu-profile"
    And the profile menu contains "menu-logout"

  Scenario: The profile dropdown opens with the keyboard
    When I open the profile menu with the keyboard
    Then the profile menu is open
    And the profile menu contains "menu-profile"

  Scenario: A plain user sees neither the Admin nor the Moderation entry
    When I open the profile menu
    Then the profile menu does not contain "menu-admin"
    And the profile menu does not contain "menu-mod"

  Scenario: A moderator sees Moderation but NOT Admin
    Given I have a mod session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-mod"
    And the profile menu does not contain "menu-admin"

  Scenario: An admin sees both Admin and Moderation
    Given I have an admin session
    And I go to "/"
    When I open the profile menu
    Then the profile menu contains "menu-admin"
    And the profile menu contains "menu-mod"
