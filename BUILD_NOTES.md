# KLS SameDay v26.12

- Restored the missing `appView()` function in the Driver App.
- This was the confirmed cause of the permanent “Loading KLS Driver…” screen after a driver record was found.
- Driver lookup now matches the visible `drivers` schema without requiring an `active` column.
- No Supabase SQL required.
