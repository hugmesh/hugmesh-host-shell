@cluster
Feature: Role-home and profile REMOTE content (integrated env only)
  These scenarios assert the rendered markup that the federation REMOTES own — the
  admin/mod/user role-home pages and the user remote's ./profile editor inside the
  modal. That content only exists when each remote is served from its own dev
  server / nginx at the manifest URLs (ports 4203-4206) AND the remote major lines
  up with this host (^22). In a host-only run those servers are down and the remote
  module load fails, so these are tagged @cluster and EXCLUDED from the default
  suite. Run them with `npm run e2e:integration` after bringing the remotes up
  (e.g. via the fe-gateway integrated env).

  HONEST DEFERRAL: the remotes are currently built against an older Angular major
  than this ^22 host (see federation.config.js note), so even with the dev servers
  up a real mount fails strictVersion until the remotes are bumped. These features
  are written so the coverage exists the moment that lands; they are NOT expected
  to pass in this repo's CI today.

  Scenario: The admin role-home renders the admin remote's main landmark
    Given I have an admin session
    When I go to "/"
    Then the URL path is "/admin"
    And the role-home remote content eventually renders in "#maincontent"

  Scenario: The mod role-home renders the mod remote's main landmark
    Given I have a mod session
    When I go to "/"
    Then the URL path is "/mod"
    And the role-home remote content eventually renders in "#maincontent"

  Scenario: The user role-home renders the user remote's main landmark
    Given I have a user session
    When I go to "/"
    Then the URL path is "/user"
    And the role-home remote content eventually renders in "#maincontent"

  Scenario: The profile modal body mounts the user remote's profile editor
    Given I have a user session
    And I go to "/"
    When I open the profile menu
    And I activate the "menu-profile" menu item
    Then the profile modal is open
    And the profile modal body eventually renders the remote profile editor
