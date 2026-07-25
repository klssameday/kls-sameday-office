# KLS SameDay Platform v26.7

## Driver link repair
- Driver App now falls back to the existing `drivers.user_id` link when the driver account claim record is unavailable or stale.
- This matches the live Supabase drivers table and removes the false “Account not linked” screen for a valid user.
- Added a permanently visible Add driver button in the Driver Control panel header.
- Preserved the existing bottom Add Driver & Link Login button.
- No SQL migration is required for this release.
