# Security Policy

## Scope

This repository is the brand-agnostic **native-federation host shell** for a
HugMesh brand. It has no feature surface of its own: every page is a federated
remote, and the gateway and the role BFFs enforce all authorization. Report
vulnerabilities in those upstreams against their own repositories. Report issues in
the host shell here: chrome, authgate, route guards, federation bootstrap and the
HttpClient bearer seam.

## Supported Versions

There is no fixed release train, and nothing has reached a final release: the
current version is a beta (`package.json`, today `0.3.0-beta.1`). The supported
version is the latest commit on `main`: the image built and pushed by GitLab CI,
or the `ghcr.io/hugmesh/hugmesh-host-shell:main` image that the GHCR release
workflow (`.github/workflows/release.yml`) pushes on every push to `main`. Tagged
betas (`:<version>`, `:beta`) are snapshots of `main` and get no separate fixes.
Fixes land on `main`. There are no backported maintenance branches.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through a GitHub private security
advisory on this repository: open the **Security** tab and choose **Report a
vulnerability**. Do **not** open a public issue for an unfixed vulnerability.

Include the affected commit or branch, reproduction steps and the impact you
observed. You will get an initial acknowledgement and triage. Accepted issues are
fixed on `main`, and the reporter is notified when the fix ships.

## Known backlog

- **Resolved** (commits 410767e and cf53b4c; formerly PR #108 and #109 in the
  repo's earlier tracker). The browser used to hold an admin-capable `bffToken` in
  `localStorage` and send it as `Authorization: Bearer`. That finding is closed.
  Today the `hug.session` entry in `localStorage` (`SessionService`) carries only
  identity and role claims (`id`, `label`, `provider`, `roles`,
  `registrationComplete`, `status`) and **no token field of any kind**.
  `bearerInterceptor` attaches no `Authorization` header. It only sets
  `withCredentials: true`, so the HttpOnly `bff_` session cookie rides along, and
  the gateway mints the upstream bearer server-side. The README's "Auth model"
  section has the full picture.
