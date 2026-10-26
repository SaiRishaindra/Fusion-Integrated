# Assignment 6B local review

Starting point: Phase 1 commit `9bd6ee3`, preserved by branch
`assignment-6-phase1-backup`. These improvements were authored with Codex;
they are not recorded output from an Ollama trial. Phase 2 is kept on the
separate branch `assignment-6b-review`.

## Changes and verification

- Separate create and view permissions (BR-EL-036).
- Remove automatic student grants from the employee module registry.
- Require a first or second half for half-day CL (BR-EL-010).
- Reject active overlaps, allowing opposite CL halves (BR-EL-012).
- Serialize submissions by applicant to prevent concurrent overlap races.
- Keep submitted requests immutable (BR-EL-034).
- Reject withdrawal after a final outcome; repeated pending withdrawal is
  idempotent and produces one history event (part of BR-EL-022).
- Scope application history to the owner and return events chronologically.
- Implement the missing calendar route, validate calendar years, and display
  only published holidays.
- Follow API pagination, provide a category picker, and display request errors.

Run the backend regression tests with:

```sh
.venv/bin/pytest -o addopts='' --ds=config.settings.test_elm modules/elm/tests -q
```

The separate test settings use PostgreSQL template0. The local template1 has
a host collation mismatch; no host database repair or application migration
was performed. The migration runs against the isolated test database.

Run frontend tests and the build from `client/`:

```sh
npm test -- src/modules/elm/api/hooks.test.tsx
npm run build
```

Verified locally on 26 October 2026: 40 ELM backend cases (including a
simultaneous-submission test), 447 backend cases across the repository, and
42 frontend tests passed. The production frontend build, repository lint,
import boundaries, navigation, cross-module foreign-key check, permission
manifest, migration consistency and warning-free API schema generation passed.
The full backend suite used the isolated test_elm database settings above.

## Remaining scope

This is an incremental repair, not a complete ELM implementation. Approval
assignment and hierarchy routing, substitute consent, notifications, automatic
balance posting, entitlement policies, holiday-sensitive counting, cancellation,
extensions, resumption, offline records, SLA events and year-end processing
still need implementation and verification. The day-count property retains
the original full-day counting behavior; only CL half-day selection is fixed.

Older applications have no recorded events and no inferred half-day period.
An ambiguous legacy half-day request blocks overlap rather than guessing.
Removing a grant from the published manifest does not itself revoke grants
already stored in an external IAM. Check the IAM before deployment.

To run this locally, apply migrations using the normal Fusion configuration
and start the existing IAM/backend/frontend services. An authenticated browser
session with the employee_leave module grant is needed for a full UI check.
This local work has not been verified through such a browser session.
