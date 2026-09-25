## ADDED Requirements

### Requirement: The backend accepts only tokens issued for it

JwtBearer SHALL validate the issuer against `Keycloak:Authority` and the audience against `Keycloak:Audience`,
which MUST be `chess_api` in every deployed environment (compose, Development, Production). A token without
`chess_api` in `aud` MUST be rejected with 401, whichever client it was issued to. Both clients that call the
API, `chess_api` (user login) and `chess_bff` (relay service account), MUST carry an audience mapper that adds
`chess_api` to their access tokens.

#### Scenario: User login token

- **WHEN** a user signs in through the cookie flow and calls `GET /api/me`
- **THEN** the token resolved from `mp_sid` carries `aud: chess_api` and the call succeeds

#### Scenario: Relay token

- **WHEN** the BFF obtains a `chess_bff` client-credentials token
- **THEN** it carries `aud: chess_api` and the hub accepts it

#### Scenario: Token for another client

- **WHEN** a request carries a realm token whose `aud` lacks `chess_api`
- **THEN** the backend responds 401

### Requirement: Roles gate the live hub

`LiveHub` SHALL require the `Relay` realm role. Keycloak realm roles MUST reach the principal as role claims
through the existing `realm_access.roles` flattening, and the `Relay` role MUST be granted only to the
`chess_bff` service account.

#### Scenario: User token on the hub

- **WHEN** a valid user token with roles `User` or `Admin` negotiates `/hub/live`
- **THEN** it is rejected with 403

#### Scenario: Relay token on the hub

- **WHEN** a valid `chess_bff` token negotiates `/hub/live`
- **THEN** it is accepted
