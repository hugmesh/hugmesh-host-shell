Feature: Authgate and session lifecycle
  The host shell is a pure AUTHGATE at '/': an anonymous visitor is redirected to
  the login remote, and an authenticated visitor resolves to their role-home. The
  role is driven by SEEDING the hug.session localStorage key (the SessionService
  reads it) — no real Casdoor is needed.

  HOST-LEVEL vs INTEGRATION: the role-home and /login routes are federation
  REMOTES (loadChildren via loadRemoteModule). In a host-only run those remote dev
  servers are down, so the guard's redirect navigation cannot COMPLETE and the URL
  never advances past '/'. What the host renders from the session ALONE is the nav
  account region — anonymous shows "Sign in", authenticated shows the profile menu
  — which is the authgate signal asserted here. The actual URL redirect to /login
  or the role-home is asserted in the @cluster features (served remotes).

  Scenario: An anonymous visitor sees the sign-in affordance (the authgate)
    Given I have no session
    And I go to "/"
    Then the account region shows the sign-in affordance

  Scenario: An authenticated visitor sees the signed-in profile menu (not sign-in)
    Given I have a user session
    And I go to "/"
    Then the account region shows the signed-in profile menu

  Scenario: Signing out clears the session and returns to the anonymous authgate
    Given I have a user session
    And I go to "/"
    When I sign out
    Then the session is cleared
    And the account region shows the sign-in affordance
