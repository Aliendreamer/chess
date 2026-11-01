// Positions this device's engine crashed on (mobile-app D13): background work (review, mining, judgements) skips them,
// so one position cannot crash the app at every start. Kept out of backups: it is about this device's engine.
export default `CREATE TABLE engine_failures (
  position_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  failed_at TEXT NOT NULL
);
`
