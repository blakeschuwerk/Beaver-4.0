# Frontend UI — STUB

## Status

Not designed. No mockups exist.

## Planned responsibilities

- User authentication and profile management (Firestore `user_profiles`)
- Project feed pulled from BigQuery `projects` hub
- Filter/search by niche, geography, stage, bid deadline
- Match notifications display (from `matches` table / F6 notifier)
- County configuration admin (optional)

## API approach (future)

Likely a separate Cloud Run API or Firebase-backed app reading from:
- Firestore: `user_profiles`, `counties` (read)
- BigQuery: `projects`, `matches` (read via API layer)

## Do not build until UI design is complete.
