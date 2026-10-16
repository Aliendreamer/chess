/**
 * Chess news without the fetching (chess-news D3, D6): RSS 2.0 and Atom feeds → headlines, and lichess's broadcast list
 * → the tournaments being played, trusting nothing. A DTD or an unknown entity rejects the feed (no XXE), titles lose
 * their markup, only absolute https links are kept, and nothing but names, places, dates and links is taken: never
 * article text or images. Ported from the backend's `News/FeedParser` and `News/BroadcastParser` with their cases.
 */

/** A headline as the app keeps it: plain-text title, an https link, a date. Nothing else. */
export interface FeedItem {
  title: string
  url: string
  publishedAt: Date
}

export const MAX_TITLE = 300

/** The feed's items; empty when the document is no feed. Throws on a DTD, an unknown entity or bad XML. */
export function parseFeed(xml: string, fetchedAt: Date): Array<FeedItem> {
  const root = parseXml(xml)
  const items =
    root.name === 'rss'
      ? descendants(root, 'item').map((i) =>
          feedItem(
            textOf(child(i, 'title')),
            textOf(child(i, 'link')),
            textOf(child(i, 'pubDate')),
            fetchedAt,
          ),
        )
      : root.name === 'feed'
        ? root.children
            .filter((e): e is XmlElement => typeof e !== 'string' && e.name === 'entry')
            .map((e) =>
              feedItem(
                textOf(child(e, 'title')),
                atomLink(e),
                textOf(child(e, 'published') ?? child(e, 'updated')),
                fetchedAt,
              ),
            )
        : []
  return items.filter((i): i is FeedItem => i !== null)
}

function atomLink(entry: XmlElement): string | null {
  const link = entry.children.find(
    (c): c is XmlElement =>
      typeof c !== 'string' &&
      c.name === 'link' &&
      (c.attributes.rel === undefined || c.attributes.rel === 'alternate'),
  )
  return link?.attributes.href ?? null
}

function feedItem(
  rawTitle: string | null,
  rawLink: string | null,
  rawDate: string | null,
  fetchedAt: Date,
): FeedItem | null {
  const title = cleanTitle(rawTitle)
  const url = httpsUrl(rawLink)
  if (title.length === 0 || !url) return null
  return { title, url, publishedAt: dateOf(rawDate) ?? fetchedAt }
}

function httpsUrl(raw: string | null | undefined): string | null {
  try {
    const url = new URL((raw ?? '').trim())
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Markup stripped, entities decoded, whitespace collapsed, cut to {@link MAX_TITLE}. */
function cleanTitle(raw: string | null): string {
  const text = decodeHtml((raw ?? '').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_TITLE ? text.slice(0, MAX_TITLE) : text
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** RFC 822, ISO 8601 or TWIC's `ddd MMM d HH:mm:ss yyyy`, a date without a zone being UTC; else null. */
function dateOf(raw: string | null): Date | null {
  const text = (raw ?? '').trim()
  if (text === '') return null
  const twic =
    /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) {1,2}(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(text)
  if (twic) {
    const month = MONTHS.indexOf(twic[1]!)
    if (month >= 0)
      return new Date(Date.UTC(+twic[6]!, month, +twic[2]!, +twic[3]!, +twic[4]!, +twic[5]!))
  }
  const iso = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(text) ? `${text}Z` : text
  const rfc = /\d{2}:\d{2}(:\d{2})?$/.test(iso) ? `${iso} GMT` : iso
  const ms = Date.parse(rfc)
  return Number.isNaN(ms) ? null : new Date(ms)
}

// ---- The tournaments being played (chess-news D6) ----

export interface BroadcastEvent {
  id: string
  name: string
  url: string
  roundName: string | null
  roundUrl: string | null
  ongoing: boolean
  location: string | null
  fideTc: string | null
  tier: number
  startsAt: Date | null
  endsAt: Date | null
  fetchedAt: Date
}

const LICHESS_BROADCASTS = 'https://lichess.org/broadcast/'

type Json = null | boolean | number | string | Array<Json> | { [key: string]: Json }
const obj = (v: Json | undefined): { [key: string]: Json } | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null
const str = (v: Json | undefined): string | null => (typeof v === 'string' ? v : null)
const cut = (text: string | null, max: number) => (text === null ? null : text.slice(0, max))

/** A link kept only when it points into lichess's broadcasts. */
function lichess(url: string | null): string | null {
  return url !== null && url.startsWith(LICHESS_BROADCASTS) && url.length <= 500 && httpsUrl(url)
    ? url
    : null
}

/** lichess's `api/broadcast/top` → its `active` list. Throws when the answer is not JSON. */
export function parseBroadcasts(json: string, fetchedAt: Date): Array<BroadcastEvent> {
  const active = obj(JSON.parse(json) as Json)?.active
  if (!Array.isArray(active)) return []
  const events: Array<BroadcastEvent> = []
  for (const entry of active.map(obj)) {
    const tour = obj(entry?.tour)
    const id = str(tour?.id)
    const name = str(tour?.name)
    const url = lichess(str(tour?.url))
    if (!tour || !id || id.length > 32 || !name || !url) continue
    const info = obj(tour.info)
    const round = obj(entry?.round)
    const dates = Array.isArray(tour.dates)
      ? tour.dates.filter((d): d is number => typeof d === 'number')
      : []
    events.push({
      id,
      name: name.slice(0, 300),
      url,
      roundName: cut(str(round?.name), 100),
      roundUrl: lichess(str(round?.url)),
      ongoing: round?.ongoing === true,
      location: cut(str(info?.location), 200),
      fideTc: cut(str(info?.fideTC), 16),
      tier: typeof tour.tier === 'number' && Number.isInteger(tour.tier) ? tour.tier : 0,
      startsAt: dates.length > 0 ? new Date(dates[0]!) : null,
      endsAt: dates.length > 1 ? new Date(dates.at(-1)!) : null,
      fetchedAt,
    })
  }
  return events
}

/** What home shows: rounds being played first, then the most important, then the earliest to start. */
export function shownEvents(
  events: Iterable<BroadcastEvent>,
  count: number,
): Array<BroadcastEvent> {
  const start = (e: BroadcastEvent) => e.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER
  return [...events]
    .sort((a, b) => Number(b.ongoing) - Number(a.ongoing) || b.tier - a.tier || start(a) - start(b))
    .slice(0, count)
}

// ---- A small, strict XML reader: elements, attributes, text and CDATA; no DTD, no external anything ----

interface XmlElement {
  /** The local name (`dc:creator` → `creator`). */
  name: string
  attributes: Record<string, string>
  children: Array<XmlElement | string>
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);?/g, (whole, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(Number(ref.slice(1)))
    const known = XML_ENTITIES[ref]
    if (known === undefined || !whole.endsWith(';'))
      throw new Error(`Unknown entity &${ref}; in the feed.`)
    return known
  })
}

const HTML_ENTITIES: Record<string, string> = {
  ...XML_ENTITIES,
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
}

/** Entities in a title (after markup is gone): numeric and the common named ones; anything else stays as written. */
function decodeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(Number(ref.slice(1)))
    return HTML_ENTITIES[ref] ?? whole
  })
}

const localName = (qname: string) => qname.slice(qname.indexOf(':') + 1)

/** The document element; throws on a DTD, an unknown entity, unbalanced tags or no element at all. */
function parseXml(xml: string): XmlElement {
  const stack: Array<XmlElement> = [{ name: '#document', attributes: {}, children: [] }]
  let i = 0
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    const text = xml.slice(i, lt < 0 ? xml.length : lt)
    if (text.length > 0) stack.at(-1)!.children.push(decodeXml(text))
    if (lt < 0) break
    if (xml.startsWith('<!--', lt)) {
      i = after(xml, '-->', lt)
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt)
      if (end < 0) throw new Error('Unclosed CDATA in the feed.')
      stack.at(-1)!.children.push(xml.slice(lt + 9, end))
      i = end + 3
    } else if (xml.startsWith('<?', lt)) {
      i = after(xml, '?>', lt)
    } else if (xml.startsWith('<!', lt)) {
      throw new Error('A feed with a DTD or declarations is refused.')
    } else if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt)
      const name = localName(xml.slice(lt + 2, end).trim())
      const open = stack.pop()
      if (end < 0 || !open || open.name !== name || stack.length === 0)
        throw new Error(`Unbalanced </${name}> in the feed.`)
      i = end + 1
    } else {
      const tag = /^<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(
        xml.slice(lt),
      )
      if (!tag) throw new Error('Bad markup in the feed.')
      const attributes: Record<string, string> = {}
      for (const a of tag[2]!.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
        attributes[localName(a[1]!)] = decodeXml(a[2] ?? a[3] ?? '')
      const element: XmlElement = { name: localName(tag[1]!), attributes, children: [] }
      stack.at(-1)!.children.push(element)
      if (tag[3] !== '/') stack.push(element)
      i = lt + tag[0].length
    }
  }
  if (stack.length !== 1) throw new Error('Unclosed elements in the feed.')
  const root = stack[0]!.children.find((c): c is XmlElement => typeof c !== 'string')
  if (!root) throw new Error('No document element in the feed.')
  return root
}

function after(xml: string, end: string, from: number): number {
  const at = xml.indexOf(end, from)
  if (at < 0) throw new Error('Unclosed markup in the feed.')
  return at + end.length
}

function child(element: XmlElement, name: string): XmlElement | null {
  return (
    element.children.find((c): c is XmlElement => typeof c !== 'string' && c.name === name) ?? null
  )
}

function descendants(element: XmlElement, name: string): Array<XmlElement> {
  return element.children.flatMap((c) =>
    typeof c === 'string' ? [] : c.name === name ? [c] : descendants(c, name),
  )
}

/** All the text inside, as an element's value. */
function textOf(element: XmlElement | null): string | null {
  if (!element) return null
  return element.children.map((c) => (typeof c === 'string' ? c : (textOf(c) ?? ''))).join('')
}
