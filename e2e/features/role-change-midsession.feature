Feature: Mid-session role grant / revoke via the /bff/session hydrate
  SessionService.hydrate() re-reads the AUTHORITATIVE GET /bff/session on boot AND
  on every snap-session-change broadcast, mapping the returned roles[] into the
  in-memory session signal WITHOUT touching the localStorage mirror. That exists
  precisely so a role granted or revoked MID-SESSION (an admin demoting a mod, or
  promoting a user, while they are browsing) is picked up WITHOUT a re-login — the
  host's most consequential multi-user behaviour, and the ONE path every other
  suite deliberately leaves un-mocked (they rely on the read FAILING so the seed
  survives).

  These scenarios open the profile menu FIRST, then flip /bff/session and fire the
  broadcast, then poll the ALREADY-OPEN menu until it reactively reflects the new
  roles — so the assertion is never vacuous (a closed menu renders no list) and
  the async hydrate is absorbed by the poll rather than raced. Scenarios carry the
  session-mock tag so the After hook restores the host-only 404 default.

  Background:
    Given I have a mod session
    And I go to "/"

  @session-mock
  Scenario: A moderator demoted to plain user loses the Moderation entry without re-login
    When I open the profile menu
    Then the profile menu contains "menu-mod"
    Given the BFF session reports roles "user"
    When the session-change broadcast fires
    Then the profile menu eventually does not contain "menu-mod"
    # The menu is still open and populated — proves the DROP is real, not a
    # closed/absent menu passing vacuously.
    And the profile menu contains "menu-profile"

  @session-mock
  Scenario: A user promoted to admin gains the Admin + API docs entries without re-login
    Given I have a user session
    And I go to "/"
    When I open the profile menu
    Then the profile menu does not contain "menu-admin"
    And the profile menu does not contain "menu-apidocs"
    Given the BFF session reports roles "admin,mod,user"
    When the session-change broadcast fires
    Then the profile menu eventually contains "menu-admin"
    And the profile menu eventually contains "menu-apidocs"

  @cluster @session-mock
  Scenario: After a mid-session demotion the next Home navigation lands on the demoted role-home
    # The routing leg: once hydrate has flipped the in-memory session to plain
    # user, activating Home (client-side nav — NOT a reload, which would re-seed
    # the stale localStorage mirror) runs roleHomeGuard against the NEW roles and
    # resolves to /user. @cluster because /user is a federated remote whose
    # loadChildren must succeed for the URL to settle (mirrors role-routing.feature).
    Given the BFF session reports roles "user"
    When the session-change broadcast fires
    And I select the "nav-home" nav entry
    Then the URL path is "/user"
