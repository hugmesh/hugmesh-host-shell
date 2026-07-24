@cluster
Feature: Home announcements banner (admin-published, all-users-visible, sandboxed)
  The announcements feature (GET /bff/announcements/home) renders admin-published
  notices at the top of the logged-in HOME page in priority order, pins the
  non-dismissible ones, and renders each notice's server HTML inside a SANDBOXED,
  null-origin srcdoc iframe (sandbox="" — NO allow-scripts, NO allow-same-origin)
  so a <script> in body_html can NEVER execute in this origin. It had zero e2e.

  These render on /home — a DEEP LINK — so the feature is @cluster: the default
  host server (server.js) serves index.html only at "/", while the integrated /
  nginx env has the SPA fallback that resolves /home. The announcement state is
  mocked at the network level (Chrome DevTools) so the REAL AnnouncementsService +
  sandboxed-iframe pipeline parses a real response; @announcements-mock restores
  the host default. The cross-user PUBLISH leg (an admin creating the announcement
  every user then sees) lives admin-side; this proves the RENDER + SECURITY posture.

  Background:
    Given I have a user session

  @announcements-mock
  Scenario: Priority ordering, pinned-cannot-dismiss, and the sandbox keeps scripts inert
    Given the BFF reports two home announcements a low-priority dismissible one and a high-priority pinned one
    When I go to "/home"
    Then the pinned announcement renders before the dismissible one
    And the pinned announcement has no dismiss control
    And the announcement script did not execute
