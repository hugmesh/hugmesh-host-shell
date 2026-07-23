# Security Policy

## Scope

This repository is the brand-agnostic **native-federation host shell** for a
HugMesh brand. It exposes no feature surface of its own — every page is a
federated remote, and all authorization is enforced at the gateway and the role
BFFs. Vulnerabilities in those upstreams should be reported against their own
repositories; report issues in the host shell (chrome, authgate, route guards,
federation bootstrap, the HttpClient bearer seam) here.

## Supported Versions

There is no fixed release train. The supported version is the latest commit on
`main` (the image built and pushed by GitLab CI). Fixes land on `main`; there are
no backported maintenance branches.

## Reporting a Vulnerability

Report suspected vulnerabilities privately to the platform security contact —
**maguscrowley@gmail.com** — or via a GitHub private security advisory on this
repository. Please do **not** open a public issue for an unfixed vulnerability.

Include the affected commit/branch, reproduction steps, and the impact you
observed. Expect an initial acknowledgement and triage; accepted issues are fixed
on `main` and the reporter is notified when the fix ships.

## Known backlog

- **Resolved (PR #108, #109):** the browser previously held an admin-capable
  `bffToken` in `localStorage` and sent it as `Authorization: Bearer`; that
  finding is closed. Today `localStorage`'s `hug.session` entry
  (`SessionService`) carries only identity/role claims (`id`, `label`,
  `provider`, `roles`, `registrationComplete`, `status`) — **no token field of
  any kind** — and `bearerInterceptor` attaches no `Authorization` header at
  all; it only sets `withCredentials: true` so the HttpOnly `bff_` session
  cookie rides along, with the gateway minting the upstream bearer
  server-side. See the README's "Auth model" section for the full picture.
