Feature: Landing Page
  The HugMesh landing page should load correctly and be navigable.

  Scenario: Page loads with the correct title
    Given I go to "/"
    Then the page title is "HugMesh"

  Scenario: Navigation bar is visible
    # Signed out, the menubar is Home ONLY: every service entry (Mastodon,
    # Matrix, Forum, Games) is gated by `visible: () => this.serviceListed(...)`
    # (src/app/menu/menu.component.ts:276/:283/:296/:309) and serviceListed()
    # is `this.session.loggedIn()` (menu.component.ts:405-406). The signed-in
    # Mastodon/Matrix entries are asserted in role-nav.feature.
    Given I have no session
    And I go to "/"
    Then I see the navigation bar
    And the navigation has a "nav-home" entry
    And the navigation contains "Home"
    And the navigation has no "nav-mastodon" entry
    And the navigation has no "nav-matrix" entry
    And the navigation has no "nav-forum" entry
    And the navigation has no "nav-games" entry

  Scenario: Skip link is present in the DOM
    Given I go to "/"
    Then the skip link is present

  Scenario: Footer renders a GitHub source link
    Given I go to "/"
    Then the footer contains a link to the page source
