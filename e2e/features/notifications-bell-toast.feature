Feature: Notification bell unread badge and live SSE toasts
  The bell (60s poll of /bff/user/notifications, unread badge with a 99+ cap,
  navigates to /user/notifications) and the SSE toast pipeline
  (/bff/user/notifications/events, max 3 stacked, auto-dismiss) had ZERO e2e —
  despite the toast service carrying a fixed-bug comment proving this exact class
  of feature once "shipped" without ever firing live (the `data:`-no-space SSE
  parsing bug). These journeys mock each BFF endpoint at the network level (Chrome
  DevTools), so the REAL BellNotificationsService / NotificationToastService
  pipeline parses a real HTTP response — nothing in the app is stubbed. Scenarios
  carry @notifications-mock so the After hooks restore the host-only 404 default.

  Both surfaces live in the ALWAYS-MOUNTED app shell (menu bell + app-root toast),
  so they render at "/" host-only — no remote needed.

  Background:
    Given I have a user session

  @notifications-mock
  Scenario: The bell badge shows the unread count for a logged-in user
    Given the BFF reports 3 unread notifications
    When I go to "/"
    Then the notification bell badge shows "3"

  @notifications-mock
  Scenario: The unread badge caps at 99+
    Given the BFF reports 250 unread notifications
    When I go to "/"
    Then the notification bell badge shows "99+"

  @notifications-mock
  Scenario: A live SSE event renders a toast (proving the data:-no-space wire shape parses)
    # The mock streams the EXACT Spring WebFlux `data:{json}` frame (no space
    # after the colon) that the parseSseField fix was written for — the real
    # NotificationToastService reads the stream and renders a role=status toast.
    Given the BFF streams a notification toast titled "You were mentioned"
    When I go to "/"
    Then a notification toast titled "You were mentioned" is shown

  # DEFERRED (not encoded here): the true cross-user leg — user B triggers a real
  # mention and user A's already-open shell shows the toast live off the real
  # user-bff SSE endpoint — needs a real-two-session, real-write harness this
  # Nightwatch suite does not yet have (every scenario seeds localStorage; none
  # do a real Casdoor login + real notification-producing write). It belongs to
  # the Playwright migration, where the platform's real-session helpers exist.
  # Encoding it here with the single-user mock above would falsely label a
  # mocked stream as a cross-user delivery — omitted rather than faked.
