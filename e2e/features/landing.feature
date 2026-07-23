Feature: Landing Page
  The HugMesh landing page should load correctly and be navigable.

  Scenario: Page loads with the correct title
    Given I go to "/"
    Then the page title is "HugMesh"

  Scenario: Navigation bar is visible
    Given I go to "/"
    Then I see the navigation bar
    And the navigation contains "Home"
    And the navigation contains "Mastodon"

  Scenario: Skip link is present in the DOM
    Given I go to "/"
    Then the skip link is present

  Scenario: Footer renders a GitHub source link
    Given I go to "/"
    Then the footer contains a link to the page source
