# Games-Stack Adoption

snapdragon.systems now ships as part of the same multi-tier topology
as snapdragon.games: a platform gateway in front, Casdoor as the OAuth2
issuer, Cassandra for the gateway's revocation + URL-registry cache,
and the existing Angular SPA as the user-facing application served
behind the gateway.

## Topology

```
            ┌─────────────────────────────────────────────┐
            │ snapdragon-id-gateway  :8080                │
            │  • OAuth2 login client → Casdoor            │
            │  • OAuth2 resource server (Bearer JWT)      │
            │  • Cassandra-cached revocation list         │
            │  • Cassandra-cached URL registry            │
            │  • Cassandra-cached resource-access grants  │
            │  • External-Authorization header pass-through│
            └────────────┬────────────────────────┬───────┘
                         │                        │
                    /login/* etc.            everything else
                         ▼                        ▼
                   ┌─────────┐             ┌──────────────┐
                   │ Casdoor │             │ Angular SPA  │
                   │  :8000  │             │ (this repo)  │
                   └─────────┘             └──────────────┘

                          shared Cassandra cluster
                       (snapdragon_systems_gateway keyspace)
```

## Differences from snapdragon.games

| Concern | snapdragon.games | snapdragon.systems |
|---|---|---|
| Gateway instance name | `snapdragon-games-gateway` | `snapdragon-id-gateway` |
| Cassandra keyspace | `threewizards` | `snapdragon_systems_gateway` |
| Casdoor organization | `threewizards` | `snapdragon-systems` |
| Frontend stack | Angular host + 9 federated remotes | Angular SPA (this repo) |
| Identity-layer responsibility | self-hosted player/mod/publisher | platform admin (game-master role) |

Same patterns, same Cassandra cache shape, same Casdoor authority
converter. A JWT issued by either Casdoor instance is recognised
consistently across the platform because the
`casdoorAuthoritiesConverter()` code is identical in
[snapdragon-gateway](https://github.com/Snapdragon-Systems/snapdragon-gateway/),
[snapdragon-id-gateway](https://github.com/Snapdragon-Systems/snapdragon-id-gateway/),
and the snapdragon.games BFF.

## Cross-stack admin propagation

snapdragon.systems is the source of truth for the platform-wide
`game-master` role. The
[snapdragon-actions](https://github.com/Snapdragon-Systems/snapdragon-actions/)
service polls Casdoor every 60 s and propagates `game-master`
membership here into the `admin` role on snapdragon.games Casdoor —
so granting someone game-master here automatically gives them admin
on snapdragon.games within one tick.

## Running locally

```bash
docker compose up -d
open http://localhost:8080/
```

First-time Casdoor seed credentials print to the container log:

```bash
docker compose logs casdoor 2>&1 | grep -A4 "Casdoor seed credentials"
```

## Production posture

The gateway's edge nginx (or a managed LB upstream) holds the public
edge cert from a publicly-trusted CA. The internal cert hierarchy
between services is chained from the snapdragon.systems root CA —
see
[snapdragon-gateway/docs/decisions/001-cert-chain-hierarchy.md](https://github.com/Snapdragon-Systems/snapdragon-gateway/blob/feature/snapdragon-games-gateway-alignment/docs/decisions/001-cert-chain-hierarchy.md).

snapdragon.systems is the canonical root: the cert chain script in
the gateway repo (`scripts/pki/build-chained-cert.sh`) takes this
root + key and emits a snapdragon-games intermediate signed by it.

## Migration from the previous single-container topology

The repo previously shipped a single nginx serving the Angular bundle
on port 8080 with no auth gate. That container still exists (the
`frontend` service in the new compose) — the gateway now sits in
front of it. Public routes are unchanged because the gateway's
SecurityConfig permits `/login/**` and the Angular SPA shell;
authenticated routes inside the SPA become real auth-checked routes
once the application code starts calling the gateway's `/api/*`
endpoints.
