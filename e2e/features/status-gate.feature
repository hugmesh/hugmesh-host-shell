Feature: Account-status appeal-gate banner (suspended / banned /bff/me states)
  The host reads the logged-in caller's OWN access status (active | suspended |
  banned) off GET /bff/me (AccountStatusService) and renders the appeal-gate
  banner — an assertive role="alert" region with a state-specific headline, the
  optional audit reason, an appeal link into the login remote, and a dismiss
  control — ONLY for suspended | banned. Active, a failed read (FAIL-OPEN), and
  anonymous sessions render nothing.

  These journeys drive the state by mocking the /bff/me HTTP response at the
  network level (Chrome DevTools interception), so the REAL service + component
  pipeline parses a real response — nothing in the app is stubbed. Scenarios
  registering a mock carry @bff-status-mock so the After hook restores the
  host-only fail-open default.

  HONEST SCOPE — the banner ITSELF is informational, not the authgate: this
  feature only asserts that the BANNER's own render/dismiss/reason/link
  behavior tracks the mocked /bff/me body — it renders, explains and links to
  the appeal page but never blocks a click or hides nav on its own.
  roleHomeGuard's SEPARATE suspended/banned short-circuit (redirect to
  /login/appeal BEFORE the role-home redirect, keyed off the session's own
  synced `status` field rather than this scenario's late-arriving /bff/me
  mock — see role-home.guard.ts) HAS SHIPPED and is exercised end-to-end,
  through real routing, in appeal-redirect.feature (@cluster, since
  `/login/appeal` is itself a federated remote). Do not read "navigation is
  NOT restricted" below as "the short-circuit doesn't exist" — it asserts the
  banner's own scope only; the routing short-circuit lives in the other file.

  Background:
    Given I have a user session

  @bff-status-mock
  Scenario: A suspended account sees the suspension banner with the audit reason
    Given the BFF reports my account status as "suspended" with reason "Spamming the federation timeline"
    When I go to "/"
    Then the account-status gate shows the "suspended" banner
    And the account-status banner shows the reason "Spamming the federation timeline"
    And the account-status banner links to the appeal page

  @bff-status-mock
  Scenario: A timed suspension weaves the expiry date into the banner detail
    # The /bff/me body carries `until` (the ISO instant the curtailment lifts);
    # the banner's detail sentence includes it ("…suspended until <date>…") —
    # previously only status+reason were ever mocked, never the timed expiry.
    Given the BFF reports my account suspended until "2099-01-02T03:04:05Z" with reason "Repeated policy violations"
    When I go to "/"
    Then the account-status gate shows the "suspended" banner
    And the account-status banner detail includes "suspended until"
    And the account-status banner shows the reason "Repeated policy violations"

  @bff-status-mock
  Scenario: A banned account sees the ban banner with the appeal link
    Given the BFF reports my account status as "banned"
    When I go to "/"
    Then the account-status gate shows the "banned" banner
    And the account-status banner links to the appeal page

  @bff-status-mock
  Scenario: The banner is dismissible for the current load
    Given the BFF reports my account status as "suspended"
    When I go to "/"
    Then the account-status gate shows the "suspended" banner
    When I dismiss the account-status banner
    Then the account-status banner is gone

  @bff-status-mock
  Scenario: The banner is informational — it does not itself gate the shell's nav
    # This drives the state via a LATE-arriving /bff/me mock (registered after
    # the Background's un-curtailed session seed), so roleHomeGuard's own
    # synchronous short-circuit — keyed off the session's already-seeded
    # `status`, not this async mock — never fires here; see
    # appeal-redirect.feature for that mechanism exercised directly. This
    # scenario's scope is narrower and still true: the BANNER component itself
    # never disables nav or blocks a click on its own.
    Given the BFF reports my account status as "suspended"
    When I go to "/"
    Then the account-status gate shows the "suspended" banner
    And the navigation has a "nav-home" entry
    And the account region shows the signed-in profile menu
    When I open the profile menu
    Then the profile menu is open

  @bff-status-mock
  Scenario: An active account sees no banner
    Given the BFF reports my account status as "active"
    When I go to "/"
    Then no account-status banner is shown

  @bff-status-mock
  Scenario: A failed status read fails OPEN — no banner, no block
    Given the BFF cannot report my account status
    When I go to "/"
    Then no account-status banner is shown

  @bff-status-mock
  Scenario: An anonymous visitor never sees the banner, whatever the BFF would say
    # AccountStatusService only reads /bff/me for authenticated sessions; the
    # curtailed gate additionally requires a logged-in session. Even with a
    # suspended body mocked, signing out must hide the gate.
    Given the BFF reports my account status as "suspended"
    And I have no session
    When I go to "/"
    Then no account-status banner is shown
