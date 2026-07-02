@integration
Feature: Role-home routing and the universal nav swap (integrated env only)
  The host's home is the federated remote for the signed-in user's ROLE, with
  admin > mod > user precedence (roleHomeGuard). The universal nav (Home |
  Mastodon | Matrix) swaps the routed content region. Asserting the RESOLVED URL
  requires each target route's loadChildren to succeed — i.e. the federation
  REMOTE served from its own dev server / nginx at the manifest URLs (ports
  4203-4206) AND a host server with an SPA fallback. In a host-only run those
  servers are down, so the redirect/swap navigation cannot complete and the URL
  stays at '/'. These scenarios are therefore @integration (excluded from the
  default suite; run with `npm run e2e:integration`).

  HONEST DEFERRAL: the remotes are currently built against an older Angular major
  than this ^22 host (see federation.config.js note), so even with the dev servers
  up a real mount fails strictVersion until the remotes are bumped. The role-gated
  NAV state these journeys depend on is fully covered host-side in role-nav.feature.

  Scenario: An admin session lands on the /admin role-home
    Given I have an admin session
    When I go to "/"
    Then the URL path is "/admin"

  Scenario: A mod session lands on the /mod role-home
    Given I have a mod session
    When I go to "/"
    Then the URL path is "/mod"

  Scenario: A plain user session lands on the /user role-home
    Given I have a user session
    When I go to "/"
    Then the URL path is "/user"

  Scenario: A superadmin session lands on the /admin role-home
    # SessionService.role() resolves the cascade admin > mod > user; the
    # superadmin fixture carries 'admin' (SUPERADMIN > ADMIN > MOD > USER), so
    # the role-home is /admin — there is no separate superadmin role-home.
    Given I have a superadmin session
    When I go to "/"
    Then the URL path is "/admin"

  Scenario: Admin precedence — an admin who is also a user still lands on /admin
    Given I have an admin session
    When I go to "/"
    Then the URL path is "/admin"
    And the "nav-home" nav entry is active

  # DIRECT-NAVIGATION DENY — an AUTHENTICATED but under-privileged principal
  # deep-links a role console and must be bounced by the route guard
  # (adminGuard / modGuard return the /login UrlTree for any session missing the
  # role). These are @integration like the anonymous deep-link below because a
  # deep link needs the server-side SPA fallback (host-only server.js serves
  # index.html at '/' ONLY) and the /login bounce target is itself a federation
  # remote — host-only, the guard-redirect navigation cannot COMPLETE and the
  # URL never settles anywhere assertable. The ALLOW halves are the role-home
  # landings above. The role-gated NAV state (the same isAdmin/isMod signals the
  # guards read) is covered host-side in role-nav.feature.

  Scenario: A moderator deep-linking /admin is bounced to /login (adminGuard DENY)
    Given I have a mod session
    When I go to "/admin"
    Then I am redirected to "/login"

  Scenario: A plain user deep-linking /mod is bounced to /login (modGuard DENY)
    Given I have a user session
    When I go to "/mod"
    Then I am redirected to "/login"

  Scenario: A plain user deep-linking /admin is bounced to /login (adminGuard DENY)
    Given I have a user session
    When I go to "/admin"
    Then I am redirected to "/login"

  Scenario: Anonymous visitor to '/' is redirected to /login
    Given I have no session
    When I go to "/"
    Then I am redirected to "/login"

  Scenario: Anonymous visitor to a protected path is redirected to /login
    Given I have no session
    When I go to "/admin"
    Then I am redirected to "/login"

  Scenario: Selecting Mastodon swaps the content region to /social/mastodon
    Given I have a user session
    And I go to "/"
    When I select the "nav-mastodon" nav entry
    Then the URL path is "/social/mastodon"
    And the "nav-mastodon" nav entry is active

  Scenario: Selecting Matrix swaps the content region to /social/matrix
    Given I have a user session
    And I go to "/"
    When I select the "nav-matrix" nav entry
    Then the URL path is "/social/matrix"
    And the "nav-matrix" nav entry is active

  Scenario: Selecting Home returns to the role-home
    Given I have a user session
    And I go to "/"
    When I select the "nav-home" nav entry
    Then the URL path is "/user"
    And the "nav-home" nav entry is active
