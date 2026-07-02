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

  HONEST SCOPE — the banner is INFORMATIONAL BY DESIGN, not an authgate: the
  suspended-principal routing restriction (short-circuit to /appeal BEFORE the
  role-home redirect) is explicitly DEFERRED in src — roleHomeGuard carries the
  documented TODO because /bff/login, /bff/me's JWT and the token do NOT yet
  emit a status claim the guard could act on, and the login remote's /appeal
  route does not exist yet. The real enforcement is server-side (token broker +
  gateway). So this feature asserts what the host ACTUALLY implements: the
  banner renders and explains, and navigation is NOT restricted. We do NOT fake
  a routing gate that is not there; the day the backend claim + guard land, a
  suspended-routing scenario belongs alongside these.

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
  Scenario: The banner is informational — a suspended user's navigation is NOT restricted
    # Enforcement is DEFERRED in src (roleHomeGuard TODO: no JWT status claim yet;
    # server-side token broker + gateway are the real block). Assert the actual
    # host behavior: the banner shows AND the shell stays fully navigable.
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
