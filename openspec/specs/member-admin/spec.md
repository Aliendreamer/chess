# member-admin Specification

## Purpose

Accounts come only from an Admin: create with a temporary password shown once, deactivate (signed out at once),
reactivate, reset the password, grant or remove Admin. Nobody deactivates themselves or drops their own Admin.

## Requirements

### Requirement: Admins create members

An Admin SHALL be able to create a member with a username, a full name and an optional e-mail. The member SHALL get a
temporary password, shown to the Admin once, which the member MUST change at first sign-in. The new member SHALL be
listed straight away. There is no self-registration and no mail.

#### Scenario: Creating a member

- **WHEN** an Admin creates the member "carol"
- **THEN** the Admin sees a temporary password once, carol signs in with it and is asked to choose her own

#### Scenario: A taken username

- **WHEN** an Admin creates a member with a username already in use
- **THEN** creation is refused and nothing is created

### Requirement: Admins deactivate and reactivate members

An Admin SHALL be able to deactivate a member: the member SHALL be signed out at once, SHALL NOT be able to sign in, and
SHALL leave the members list, the queues and any challenge; their games and studies SHALL stay. An Admin SHALL be able
to reactivate them, reset their password to a new temporary one, and grant or remove the Admin role. An Admin SHALL NOT
deactivate themselves or remove their own Admin role.

#### Scenario: Deactivating

- **WHEN** an Admin deactivates bob while bob has the app open
- **THEN** bob's next request signs him out, he cannot sign in again, and his past games still show his name

#### Scenario: Reactivating

- **WHEN** an Admin reactivates bob
- **THEN** bob can sign in again with his password

#### Scenario: Oneself

- **WHEN** an Admin tries to deactivate themselves
- **THEN** it is refused
