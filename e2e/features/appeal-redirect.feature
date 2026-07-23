@cluster
Feature: Curtailed-account appeal short-circuit + access-restored routing (roleHomeGuard)
  Part of the cross-service "ban -> appeal -> admin approve -> access restored"
  loop (see hugmesh-admin-ui's access-suspension.feature for the admin-side
  ban/lift, and hugmesh-login-ui's appeal-contact.feature for the appeal
  page itself). This feature is the HOST ROUTING leg: roleHomeGuard
  (src/app/guards/role-home.guard.ts) short-circuits a suspended/banned
  session to `/login/appeal` BEFORE the normal role-home redirect, and — once
  the curtailment lifts — the SAME session routes back to its ordinary
  role-home, verifying access is actually restored (not just that the banner
  disappears).

  Like role-routing.feature (the un-curtailed role-home redirects this
  complements), asserting the RESOLVED URL requires the target route's
  loadChildren to succeed: `/login/appeal` is itself a federated remote
  (hugmesh-login-ui, mounted at `/login`), so these are @cluster
  (excluded from the default suite; run with `npm run e2e:integration`).

  The banner-only, routing-NOT-asserted behavior in status-gate.feature
  predates this short-circuit (see that file's updated note) — THIS feature
  is where the actual redirect is proven.

  Scenario: A suspended user is short-circuited to the appeal page instead of their role-home
    Given I have a suspended user session
    When I go to "/"
    Then the URL path is "/login/appeal"

  Scenario: A banned user is short-circuited to the appeal page instead of their role-home
    Given I have a banned user session
    When I go to "/"
    Then the URL path is "/login/appeal"

  # Precedence parity with guards.spec.ts's unit coverage: the short-circuit
  # fires BEFORE the role redirect for EVERY role, not just plain users — a
  # curtailed admin must not reach /admin.
  Scenario: A banned admin is short-circuited to the appeal page, not /admin
    Given I have a banned admin session
    When I go to "/"
    Then the URL path is "/login/appeal"

  Scenario: A suspended mod is short-circuited to the appeal page, not /mod
    Given I have a suspended mod session
    When I go to "/"
    Then the URL path is "/login/appeal"

  # ACCESS RESTORED: the same session, once its status lifts, lands back on
  # its ordinary role-home — the verifiable-restoration leg of the loop.
  Scenario: Once the suspension lifts, the same session lands back on its role-home
    Given I have a suspended user session
    When I go to "/"
    Then the URL path is "/login/appeal"
    When my account status is restored to active
    And I go to "/"
    Then the URL path is "/user"

  Scenario: Once a ban lifts, a curtailed admin's session lands back on /admin
    Given I have a banned admin session
    When I go to "/"
    Then the URL path is "/login/appeal"
    When my account status is restored to active
    And I go to "/"
    Then the URL path is "/admin"
