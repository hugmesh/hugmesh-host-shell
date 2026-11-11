Feature: Registration gate on the social surfaces (pending users)
  An authenticated identity that has NOT completed registration
  (registrationComplete:false — the "pending" state before the login remote
  mints the per-service tokens) must not reach the Matrix/Mastodon surfaces:
  the registeredGuard bounces the routes, and the universal nav renders the
  entries VISIBLE BUT DISABLED (a native-disabled, aria-disabled button) with
  the visible helptext reason — grey + EXPLAIN, never hide, never a dead link
  (menu.component.ts enabled()/disabledReason()).

  A social entry is enabled only when its service is INSTALLED on the
  deployment AND the session holds the service role AND is fully registered
  (GUI-07: the user-bff hsproxy refuses Matrix/Mastodon without ROLE_MATRIX /
  ROLE_MASTODON) — install-state first, then the role, then registration in
  the helptext. The pending fixture holds both roles, so it isolates the
  registration reason. The host-only stack has no federation-api
  (the public capabilities read 404s -> everything greys by ABSENCE), so to
  isolate the REGISTRATION reason these journeys mock the capabilities response
  at the network level (@capabilities-mock; the After hook restores the 404
  default). The route-level registeredGuard bounce itself needs the served
  remotes (the /login redirect target is a remote) and is covered by the
  routing suite tagged @cluster; what the host owns and proves here is the
  disabled-control + helptext contract.

  @capabilities-mock
  Scenario: A pending user's social entries are disabled with the registration reason
    Given the deployment reports the "mastodon" and "matrix" services installed
    And I have a pending user session
    And I go to "/"
    Then the "nav-mastodon" nav entry is disabled
    And the "nav-mastodon" nav entry explains "Complete your registration to use this."
    And the "nav-matrix" nav entry is disabled
    And the "nav-matrix" nav entry explains "Complete your registration to use this."

  @capabilities-mock
  Scenario: Completing registration unlocks the social entries (the ALLOW pair)
    Given the deployment reports the "mastodon" and "matrix" services installed
    And I have a user session with the "mastodon" and "matrix" service grants
    And I go to "/"
    Then the "nav-mastodon" nav entry is an enabled link
    And the "nav-matrix" nav entry is an enabled link

  @capabilities-mock
  Scenario: A registered member WITHOUT the service roles is told which role (GUI-07)
    # e2e-user live: registered, roles [user]. The hsproxy 403s every Matrix /
    # Mastodon call for this identity, so the shell must not offer either.
    Given the deployment reports the "mastodon" and "matrix" services installed
    And I have a user session
    And I go to "/"
    Then the "nav-mastodon" nav entry is disabled
    And the "nav-mastodon" nav entry explains "Sign in as a Mastodon member to open this."
    And the "nav-matrix" nav entry is disabled
    And the "nav-matrix" nav entry explains "Sign in as a Matrix member to open this."

  @capabilities-mock
  Scenario: A pending user keeps the universal Home entry and their account menu
    Given the deployment reports the "mastodon" and "matrix" services installed
    And I have a pending user session
    And I go to "/"
    Then the "nav-home" nav entry is an enabled link
    And the account region shows the signed-in profile menu

  Scenario: Without install-state every social entry greys out by absence
    # The graceful-degrade floor: no federation-api (the capabilities read
    # fails) -> the entries are disabled with the deployment reason, even for a
    # FULLY REGISTERED user — an absent service cannot be unlocked by
    # registering, and the helptext must say so (install-state precedence).
    Given I have a user session
    And I go to "/"
    Then the "nav-mastodon" nav entry is disabled
    And the "nav-mastodon" nav entry explains "This service is not available on this deployment."
    And the "nav-matrix" nav entry is disabled
    And the "nav-matrix" nav entry explains "This service is not available on this deployment."
