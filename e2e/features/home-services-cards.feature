@cluster
Feature: Home-services launcher card state matrix (+ forum dead-link regression guard)
  The launcher grid (home-services.service.ts) renders one card per optional /
  role service with a data-state of absent | role | registration | enabled and an
  explanatory helptext — an enabled card is a real <a> routerLink, a gated card a
  disabled <span> (grey + explain, never a dead link). It had zero e2e.

  These render on /home — a DEEP LINK — so the feature is @cluster (the default
  server.js serves only "/"; the integrated / nginx env resolves /home). The
  install-state is mocked at the network level via the shared capabilities mock
  (@capabilities-mock restores the host default).

  REGRESSION GUARD: the forum card used to render 'enabled' while /social/forum had
  no host route — a silent dead link. Now that the forum remote is mounted, an
  installed forum card must be an enabled real link to /social/forum.

  Background:
    Given I have a user session

  @capabilities-mock
  Scenario: The forum card is an enabled link to the newly-mounted forum route
    Given the deployment reports the "forum" and "matrix" services installed
    When I go to "/home"
    Then the home-services card "forum" has state "enabled"
    And the home-services card "forum" is an enabled link to "/social/forum"
    # An un-installed optional service greys out by absence (never a dead link).
    And the home-services card "mastodon" has state "absent"

  @capabilities-mock
  Scenario: A core role console the user lacks renders as a role-gated card, not a dead link
    Given the deployment reports the "forum" and "matrix" services installed
    When I go to "/home"
    Then the home-services card "admin" has state "role"
