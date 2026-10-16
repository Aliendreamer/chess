import { positionKey } from './analysis.ts'
import { isFen } from './tree.ts'
import type { Color } from './board.ts'

/**
 * The opening trainer without its storage (opening-trainer D2–D4, study-repertoire-trainer D1–D3): the Leitner schedule,
 * the named openings grouped into families, a family's kind, and a study as lines to drill. Ported from the backend's
 * `Trainer/` (TrainerSchedule, OpeningFamilies, StudyLines) and held to the same cases by the tests.
 */

// ---- The Leitner schedule (opening-trainer D4) ----

export const MAX_BOX = 5
export const LEARNED_BOX = 3

/** Days until a line in a box is due again. */
const DAYS_BY_BOX = [0, 1, 3, 7, 14, 30] as const
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The box and due time after a run: a clean run moves the line up one box (`box` null = never trained) and spaces it
 * out; a mistake sends it back to box 0, due at once.
 */
export function afterRun(
  box: number | null,
  clean: boolean,
  now: Date,
): { box: number; dueAt: Date } {
  if (!clean) return { box: 0, dueAt: now }
  const next = Math.min((box ?? 0) + 1, MAX_BOX)
  return { box: next, dueAt: new Date(now.getTime() + DAYS_BY_BOX[next]! * DAY_MS) }
}

export function isLearned(box: number): boolean {
  return box >= LEARNED_BOX
}

/** The line to drill next, or none for now with when the next one is due. */
export interface DueLine {
  line: string | null
  nextDueAt: Date | null
}

/**
 * The next line of `lines` (in the family's order): the due one with the lowest box, then the oldest due, then the first
 * never trained; when none, when the soonest is due. `progress` is by line, for this player and side.
 */
export function nextLine(
  lines: ReadonlyArray<string>,
  progress: ReadonlyMap<string, { box: number; due: Date }>,
  now: Date,
): DueLine {
  const due = lines
    .filter((l) => {
      const p = progress.get(l)
      return p !== undefined && p.due.getTime() <= now.getTime()
    })
    .sort((a, b) => {
      const pa = progress.get(a)!
      const pb = progress.get(b)!
      return pa.box - pb.box || pa.due.getTime() - pb.due.getTime()
    })[0]
  if (due !== undefined) return { line: due, nextDueAt: null }
  const fresh = lines.find((l) => !progress.has(l))
  if (fresh !== undefined) return { line: fresh, nextDueAt: null }
  const dues = lines.flatMap((l) => {
    const p = progress.get(l)
    return p ? [p.due.getTime()] : []
  })
  return { line: null, nextDueAt: dues.length > 0 ? new Date(Math.min(...dues)) : null }
}

// ---- Opening families (opening-trainer D2–D3, trainer-columns) ----

/** A named opening as seeded: its end position, name, ECO and moves from the start. */
export interface Opening {
  key: string
  name: string
  eco: string
  movesUci: ReadonlyArray<string>
}

/** A family or variation that can be trained: its name and how many lines it drills. */
export interface FamilyInfo {
  name: string
  lines: number
}

const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The named openings grouped for the trainer. A family is the name before the first ':' ("Sicilian Defense"); a
 * variation the name before the first ',' ("Sicilian Defense: Najdorf Variation"). The lines a group drills are its
 * openings that no other opening of the group extends.
 */
export class OpeningFamilies {
  private readonly all: ReadonlyArray<Opening>
  private readonly groups = new Map<string, ReadonlyArray<Opening>>()

  constructor(openings: Iterable<Opening>) {
    this.all = [...openings]
      .filter((o) => o.movesUci.length > 0)
      .sort((a, b) => ordinal(a.name, b.name))
  }

  /** Every family with its number of lines, by name. */
  families(): Array<FamilyInfo> {
    return [...new Set(this.all.map((o) => familyName(o.name)))]
      .sort(ordinal)
      .map((g) => this.info(g))
  }

  /** Families and variations whose name contains `text`, any case, by name. */
  search(text: string): Array<FamilyInfo> {
    const q = text.trim().toLowerCase()
    return [...new Set(this.all.flatMap((o) => [familyName(o.name), variationName(o.name)]))]
      .filter((n) => n.toLowerCase().includes(q))
      .sort(ordinal)
      .map((g) => this.info(g))
  }

  /** The lines a family or variation drills, by name; empty when `group` names none. */
  lines(group: string): ReadonlyArray<Opening> {
    let lines = this.groups.get(group)
    if (!lines) {
      const members = this.all.filter((o) => inGroup(o.name, group))
      lines = members.filter(
        (l) =>
          !members.some(
            (m) =>
              m.movesUci.length > l.movesUci.length &&
              l.movesUci.every((uci, i) => m.movesUci[i] === uci),
          ),
      )
      this.groups.set(group, lines)
    }
    return lines
  }

  /** One opening by its key, or null. */
  line(key: string): Opening | null {
    return this.all.find((o) => o.key === key) ?? null
  }

  private info(group: string): FamilyInfo {
    return { name: group, lines: this.lines(group).length }
  }
}

/** The family a line belongs to (the name before the first ':'). */
export function familyName(name: string): string {
  return name.split(':', 1)[0]!.trim()
}

function variationName(name: string): string {
  return name.split(',', 1)[0]!.trim()
}

function inGroup(name: string, group: string): boolean {
  return (
    name === group ||
    (name.startsWith(group) &&
      name.length > group.length &&
      [':', ','].includes(name[group.length]!))
  )
}

/** The kind of opening a family is, read from its name: the trainer's columns. */
export type OpeningKind = 'gambit' | 'defence' | 'opening' | 'game'

export const OPENING_KINDS: ReadonlyArray<{ kind: OpeningKind; label: string }> = [
  { kind: 'gambit', label: 'Gambits' },
  { kind: 'defence', label: 'Defences' },
  { kind: 'opening', label: 'Openings and attacks' },
  { kind: 'game', label: 'Games and others' },
]

/** "Benko Gambit Accepted" is a gambit, "Alekhine Defense" a defence, "London System" an opening; the rest are games. */
export function openingKind(name: string): OpeningKind {
  if (/gambit/i.test(name)) return 'gambit'
  if (/\bdefen[cs]e\b/i.test(name)) return 'defence'
  if (/\b(opening|attack|system)\b/i.test(name)) return 'opening'
  return 'game'
}

/** The families by kind, in the columns' order: in each, the ones with lines learned first, then by name. */
export function groupFamilies<T extends { name: string; learned: number }>(
  families: ReadonlyArray<T>,
): Array<{ kind: OpeningKind; label: string; families: Array<T> }> {
  return OPENING_KINDS.map(({ kind, label }) => ({
    kind,
    label,
    families: families
      .filter((f) => openingKind(f.name) === kind)
      .sort(
        (a, b) => Number(b.learned > 0) - Number(a.learned > 0) || a.name.localeCompare(b.name),
      ),
  }))
}

// ---- Study lines (study-repertoire-trainer D1–D3) ----

export const STUDY_LINE_PREFIX = 'study:'

/** A line of a study to drill: its progress key and its moves from the study's start. */
export interface StudyLine {
  key: string
  moves: Array<string>
}

interface UciNode {
  uci: string
  children: ReadonlyArray<UciNode>
}

/**
 * A study as trainer lines: every path from the start to a leaf, main line first then variations in tree order, so
 * several replies for either side are several lines. A path with no move for `color` is skipped. A line's key is a hash
 * of the start position and its moves, so it keeps its progress wherever it moves in the tree and starts over when a
 * move in it changes or it is extended.
 */
export function studyLines(
  startFen: string,
  tree: ReadonlyArray<UciNode>,
  color: Color,
): Array<StudyLine> {
  if (!isFen(startFen)) throw new Error('Not a position.')
  const start = positionKey(startFen)
  // The side to move at the start plays the even plies of every path.
  const firstToMove = (startFen.split(' ')[1] ?? 'w') === (color === 'white' ? 'w' : 'b')
  const lines: Array<StudyLine> = []
  const path: Array<string> = []
  const walk = (children: ReadonlyArray<UciNode>) => {
    for (const move of children) {
      path.push(move.uci)
      if (move.children.length === 0) {
        if (path.length > (firstToMove ? 0 : 1))
          lines.push({ key: studyLineKey(start, path), moves: [...path] })
      } else {
        walk(move.children)
      }
      path.pop()
    }
  }
  walk(tree)
  return lines
}

/** `study:` + base64url(SHA-256("{start key} {moves…}")), as the backend writes it. */
function studyLineKey(start: string, moves: ReadonlyArray<string>): string {
  return (
    STUDY_LINE_PREFIX + base64Url(sha256(new TextEncoder().encode(`${start} ${moves.join(' ')}`)))
  )
}

function base64Url(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6))
    for (let c = 0; c < chars; c++) out += abc[(n >> (18 - 6 * c)) & 63]
  }
  return out
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** SHA-256 (FIPS 180-4), synchronous: Web Crypto's digest is async, and keys are made inside pure code. */
export function sha256(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32))
  view.setUint32(padded.length - 4, bitLength >>> 0)
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    for (let i = 0; i < 64; i++) {
      const t1 =
        (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] = (h[0]! + a) >>> 0
    h[1] = (h[1]! + b) >>> 0
    h[2] = (h[2]! + c) >>> 0
    h[3] = (h[3]! + d) >>> 0
    h[4] = (h[4]! + e) >>> 0
    h[5] = (h[5]! + f) >>> 0
    h[6] = (h[6]! + g) >>> 0
    h[7] = (h[7]! + hh) >>> 0
  }
  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!)
  return out
}
