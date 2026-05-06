# SignalOS Agent Notes

SignalOS is an MVP for human-approved social publishing. Keep the system approval-first: generated posts must be reviewed before publishing.

## Boundaries

- Do not add autonomous posting without explicit user approval.
- Keep platform publishing behind service boundaries so LinkedIn or other adapters can be added later.
- Store every draft, decision, and publishing result in Supabase.
- Prefer readable TypeScript over clever abstractions.

## Useful Commands

- `npm install`
- `npm run dev`
- `npm run typecheck`
- `npm run build`
