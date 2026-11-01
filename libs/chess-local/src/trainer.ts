import { OpeningFamilies, afterRun, familyName, isLearned, nextLine, studyLines } from '@chess/core'
import { allOpenings } from './openings'
import { loadStudy } from './studies'
import type { Color } from '@chess/core'
import type {
  FamilyProgress,
  NextLine,
  NextStudyLine,
  RunResult,
  StudyDrill,
  StudyTraining,
  TrainerLine,
} from '@chess/ui'
import type { Db } from './db'

/**
 * The opening trainer (opening-trainer, study-repertoire-trainer, desktop-app): the named lines grouped into families,
 * and the player's own studies as lines, each line in a Leitner box per colour (`trainer_progress`), scheduled by
 * `@chess/core`'s rules.
 */

const families = new WeakMap<Db, Promise<OpeningFamilies>>()

/** The families of the stored openings, built once per database. */
function familiesOf(db: Db): Promise<OpeningFamilies> {
  let built = families.get(db)
  if (!built) {
    built = allOpenings(db).then((openings) => new OpeningFamilies(openings))
    families.set(db, built)
  }
  return built
}

interface ProgressRow {
  line_key: string
  box: number
  due_at: string
}

async function progressOf(
  db: Db,
  color: Color,
  keys?: ReadonlyArray<string>,
): Promise<Map<string, ProgressRow>> {
  const rows = await db.select<ProgressRow>(
    keys
      ? `SELECT line_key, box, due_at FROM trainer_progress WHERE color = ? AND line_key IN (${keys.map(() => '?').join(', ') || "''"})`
      : 'SELECT line_key, box, due_at FROM trainer_progress WHERE color = ?',
    keys ? [color, ...keys] : [color],
  )
  return new Map(rows.map((r) => [r.line_key, r]))
}

/** Every family (or those matching `q`), with how many of its lines the player has learned for `color`. */
export async function trainerFamilies(
  db: Db,
  color: Color,
  q?: string,
): Promise<Array<FamilyProgress>> {
  const all = await familiesOf(db)
  const progress = await progressOf(db, color)
  return (q ? all.search(q) : all.families()).map((f) => ({
    name: f.name,
    lines: f.lines,
    learned: all.lines(f.name).filter((l) => {
      const p = progress.get(l.key)
      return p !== undefined && isLearned(p.box)
    }).length,
  }))
}

/** A family's (or variation's) lines with the player's progress; null when it names none. */
export async function familyLines(
  db: Db,
  name: string,
  color: Color,
): Promise<Array<TrainerLine> | null> {
  const lines = (await familiesOf(db)).lines(name)
  if (lines.length === 0) return null
  const progress = await progressOf(
    db,
    color,
    lines.map((l) => l.key),
  )
  return lines.map((l) => ({
    key: l.key,
    name: l.name,
    eco: l.eco,
    moves: [...l.movesUci],
    box: progress.get(l.key)?.box ?? null,
    dueAt: progress.get(l.key)?.due_at ?? null,
  }))
}

export async function nextFamilyLine(
  db: Db,
  name: string,
  color: Color,
  now = new Date(),
): Promise<NextLine | null> {
  const lines = await familyLines(db, name, color)
  if (!lines) return null
  const next = nextLine(
    lines.map((l) => l.key),
    progressMap(lines),
    now,
  )
  return {
    line: lines.find((l) => l.key === next.line) ?? null,
    nextDueAt: next.nextDueAt?.toISOString() ?? null,
  }
}

function progressMap(
  lines: ReadonlyArray<{ key: string; box: number | null; dueAt: string | null }>,
) {
  return new Map(
    lines.flatMap((l) =>
      l.box !== null && l.dueAt ? [[l.key, { box: l.box, due: new Date(l.dueAt) }] as const] : [],
    ),
  )
}

/** A finished run: up a box when clean, back to box 0 after a mistake. */
export async function recordRun(
  db: Db,
  run: { lineKey: string; color: Color; mistakes: number; studyId?: string },
  now = new Date(),
): Promise<RunResult> {
  const [row] = await db.select<{ box: number }>(
    'SELECT box FROM trainer_progress WHERE line_key = ? AND color = ?',
    [run.lineKey, run.color],
  )
  const next = afterRun(row?.box ?? null, run.mistakes === 0, now)
  await db.execute(
    `INSERT INTO trainer_progress (line_key, color, study_id, box, due_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (line_key, color) DO UPDATE SET box = excluded.box, due_at = excluded.due_at, updated_at = excluded.updated_at`,
    [
      run.lineKey,
      run.color,
      run.studyId ?? null,
      next.box,
      next.dueAt.toISOString(),
      now.toISOString(),
    ],
  )
  return {
    lineKey: run.lineKey,
    box: next.box,
    dueAt: next.dueAt.toISOString(),
    learned: isLearned(next.box),
  }
}

/** Whether a line key is one of the named lines (a run of anything else is refused). */
export async function isNamedLine(db: Db, key: string): Promise<boolean> {
  return (await familiesOf(db)).line(key) !== null
}

/** The family of a named line, for "Openings trained". */
export async function lineFamily(db: Db, key: string): Promise<string | null> {
  const line = (await familiesOf(db)).line(key)
  return line ? familyName(line.name) : null
}

// ---- The player's studies as lines (study-repertoire-trainer) ----

/** Every study with lines for `color`, with how many the player has learned. */
export async function trainerStudies(db: Db, color: Color): Promise<Array<StudyTraining>> {
  const rows = await db.select<{ id: string }>(
    'SELECT id FROM studies ORDER BY updated_at DESC, id DESC',
  )
  const out: Array<StudyTraining> = []
  for (const { id } of rows) {
    const drill = await studyDrill(db, id, color)
    if (drill && drill.lines.length > 0) {
      const study = (await loadStudy(db, id))!
      out.push({
        id,
        title: drill.title,
        lines: drill.lines.length,
        learned: drill.lines.filter((l) => l.box !== null && isLearned(l.box)).length,
        createdAt: study.createdAt,
      })
    }
  }
  return out
}

export async function studyDrill(db: Db, id: string, color: Color): Promise<StudyDrill | null> {
  const study = await loadStudy(db, id)
  if (!study) return null
  const lines = studyLines(study.startFen, study.tree, color)
  const progress = await progressOf(
    db,
    color,
    lines.map((l) => l.key),
  )
  return {
    id,
    title: study.title,
    startFen: study.startFen,
    lines: lines.map((l) => ({
      key: l.key,
      moves: l.moves,
      box: progress.get(l.key)?.box ?? null,
      dueAt: progress.get(l.key)?.due_at ?? null,
    })),
  }
}

export async function nextStudyLine(
  db: Db,
  id: string,
  color: Color,
  now = new Date(),
): Promise<NextStudyLine | null> {
  const drill = await studyDrill(db, id, color)
  if (!drill) return null
  const next = nextLine(
    drill.lines.map((l) => l.key),
    progressMap(drill.lines),
    now,
  )
  return {
    line: drill.lines.find((l) => l.key === next.line) ?? null,
    nextDueAt: next.nextDueAt?.toISOString() ?? null,
  }
}
