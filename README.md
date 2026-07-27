# KLS SameDay Office v31.0.1

Customer Portal hotfix release.

## Fixes

- Corrected customer booking inserts to use `auth_user_id`.
- Corrected saved-address inserts to use `auth_user_id`.
- Added the missing customer relationship used by the portal profile query.
- Added a customer-profile read policy limited to the linked portal account.
- Updated package, manifest, cache and asset versions to v31.0.1.

## Supabase step

If you already ran the v31.0 migration, run `HOTFIX-v31.0.1.sql` once in the Supabase SQL Editor.

For a new installation, run `SUPABASE-v31-CUSTOMER-PORTAL.sql`.

## GitHub summary

`Release v31.0.1 – Customer Portal hotfix and security fixes`
