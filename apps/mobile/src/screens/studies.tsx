import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { STANDARD_START, childrenAt, parsePgn, promote, remove, toInput } from '@chess/core'
import {
  DRAFTS,
  createStudies,
  draftWriter,
  listStudies,
  loadStudy,
  loadStudyDraft,
  saveStudy,
  studyAsPgn,
} from '@chess/local'
import { useAnalysis, useCommand, useMoveTree } from '@chess/view'
import type { StudyListItem, StudyView } from '@chess/core'
import type { StudyDraft } from '@chess/local'
import { MobileLink } from '@/components/mobile-link'
import { ErrorLine } from '@/components/play'
import { Button, EmptyState, Row, Section } from '@/components/primitives'
import { Screen } from '@/components/screen'
import { TreeBoard } from '@/components/tree-board'
import { appHref, mobileRoute } from '@/lib/links'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT } from '@/theme/tokens'

const studyHref = (id: string) => mobileRoute(`/studies/${encodeURIComponent(id)}`) as Href

/** Learn's home: the trainer, training and studies (mobile-app D5). */
export function LearnHome() {
  const router = useRouter()
  return (
    <Screen title="Learn">
      <Section title="Your work">
        <Row
          label="Studies"
          detail="Your analyses and imported games, with variations"
          onPress={() => router.push('/learn/studies')}
        />
      </Section>
    </Screen>
  )
}

/** Your studies, a new one, and the PGN import (studies D3). */
export function StudiesScreen() {
  const { db } = useServices()
  const router = useRouter()
  const [studies, setStudies] = useState<Array<StudyListItem> | null>(null)
  const creating = useCommand()
  const reload = useCallback(() => listStudies(db).then(setStudies), [db])

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload]),
  )

  async function newStudy() {
    const made = await creating.run(async () => ({
      ok: true as const,
      view: await createStudies(db, [
        { title: 'Untitled study', startFen: STANDARD_START, tree: [] },
      ]),
    }))
    const first = made?.created[0]
    if (first) router.push(studyHref(first.id))
  }

  return (
    <Screen title="Studies">
      <Button label="New study" disabled={creating.busy} onPress={() => void newStudy()} />
      {creating.error ? <ErrorLine text={creating.error} /> : null}
      <ImportForm onImported={() => void reload()} />
      {studies === null ? null : studies.length === 0 ? (
        <EmptyState
          title="No studies yet"
          body="Start one, import a PGN, or save the analysis board."
        />
      ) : (
        <Section title={`My studies · ${studies.length}`}>
          {studies.map((study) => (
            <Row
              key={study.id}
              label={study.title}
              {...(study.white && study.black ? { detail: `${study.white} – ${study.black}` } : {})}
              onPress={() => router.push(studyHref(study.id))}
            />
          ))}
        </Section>
      )}
    </Screen>
  )
}

/** Paste PGN or pick a file; each game becomes a study, and what could not be read is listed by its number. */
function ImportForm({ onImported }: { onImported: () => void }) {
  const services = useServices()
  const { colors } = useTheme()
  const [text, setText] = useState('')
  const [report, setReport] = useState<Array<string>>([])
  const importing = useCommand()

  async function importPgn(pgn: string) {
    const games = parsePgn(pgn)
    const ok = games.flatMap((g) => (g.ok ? [g.study] : []))
    const unread = games.flatMap((g) => (g.ok ? [] : [g.error]))
    if (ok.length === 0) {
      setReport(unread.length > 0 ? unread : ['No games found in that PGN.'])
      return
    }
    const result = await importing.run(async () => ({
      ok: true as const,
      view: await createStudies(services.db, ok),
    }))
    if (!result) return
    setReport([
      `Imported ${result.created.length} ${result.created.length === 1 ? 'study' : 'studies'}.`,
      ...unread,
      ...result.refused.map((r) => `${ok[r.index]?.title ?? `Game ${r.index + 1}`}: ${r.error}`),
    ])
    setText('')
    onImported()
  }

  async function openFile() {
    const file = await importing.run(async () => ({
      ok: true as const,
      view: await services.files.importText(),
    }))
    if (file) await importPgn(file)
  }

  return (
    <Section title="Import PGN">
      <View style={styles.form}>
        <TextInput
          accessibilityLabel="PGN"
          value={text}
          onChangeText={setText}
          multiline
          placeholder={'[Event "…"]\n\n1. e4 e5 2. Nf3 …'}
          placeholderTextColor={colors.fgMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            {
              color: colors.fgPrimary,
              backgroundColor: colors.surfaceInset,
              borderColor: colors.lineDefault,
            },
          ]}
        />
        <View style={styles.row}>
          <Button label="Open a .pgn file" onPress={() => void openFile()} />
          <Button
            label="Import"
            kind="primary"
            disabled={importing.busy || text.trim() === ''}
            onPress={() => void importPgn(text)}
          />
        </View>
        {importing.error ? <ErrorLine text={importing.error} /> : null}
        {report.length > 0 ? (
          <View testID="import-report">
            {report.map((line) => (
              <Text key={line} style={[styles.small, { color: colors.fgBody }]}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Section>
  )
}

/** A study by its id, with an unsaved edit of the same version if one was left. */
export function StudyScreen() {
  const { db } = useServices()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loaded, setLoaded] = useState<
    { study: StudyView; draft: StudyDraft | null } | null | undefined
  >(undefined)
  useEffect(() => {
    let live = true
    void (async () => {
      const study = await loadStudy(db, id)
      const draft = study ? await loadStudyDraft(db, study.id, study.version) : null
      if (live) setLoaded(study ? { study, draft } : null)
    })()
    return () => {
      live = false
    }
  }, [db, id])
  if (loaded === undefined) return <Screen title="Study">{null}</Screen>
  if (loaded === null)
    return (
      <Screen title="Study">
        <EmptyState title="No such study" body="It may have been removed with a restore." />
      </Screen>
    )
  return <Study key={loaded.study.id} loaded={loaded.study} draft={loaded.draft} />
}

/**
 * A study (studies D7): the board, its move tree and the tools around it. Moves played go into the tree; Save keeps
 * it, replayed, and a stale save is refused. Unsaved edits are kept as a draft (mobile-app D13) and come back when the
 * study is opened again on the same version.
 */
function Study({ loaded, draft }: { loaded: StudyView; draft: StudyDraft | null }) {
  const services = useServices()
  const { db } = services
  const { colors } = useTheme()
  const [saved, setSaved] = useState(loaded)
  const [title, setTitle] = useState(draft?.title ?? loaded.title)
  const editor = useMoveTree(loaded.startFen, draft?.tree ?? loaded.tree, draft?.path)
  const { tree, path, current } = editor
  const saving = useCommand()
  const [request] = useState(
    () => (input: Parameters<typeof services.evaluator.request>[0]) =>
      services.evaluator.request(input),
  )
  const analysis = useAnalysis(request)
  const dirty =
    title !== saved.title || JSON.stringify(toInput(tree)) !== JSON.stringify(toInput(saved.tree))

  const [drafts] = useState(() => draftWriter<StudyDraft>(db, DRAFTS.study(loaded.id)))
  useEffect(() => {
    if (dirty) drafts.write({ title, startFen: saved.startFen, tree, path, version: saved.version })
    else void drafts.clear().catch(() => undefined)
  }, [drafts, dirty, title, tree, path, saved.startFen, saved.version])
  useEffect(() => () => void drafts.flush().catch(() => undefined), [drafts])

  async function save() {
    const next = await saving.run(() =>
      saveStudy(db, { id: saved.id, title, tree: toInput(tree), version: saved.version }),
    )
    if (next) {
      await drafts.clear()
      setSaved(next)
      editor.setTree(next.tree)
    }
  }

  const hasVariations = childrenAt(tree, path.slice(0, -1)).length > 1

  return (
    <Screen>
      <TextInput
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
        style={[
          styles.title,
          {
            color: colors.fgPrimary,
            backgroundColor: colors.surfaceInset,
            borderColor: colors.lineDefault,
          },
        ]}
      />
      {saved.white && saved.black ? (
        <Text style={[styles.small, { color: colors.fgSecondary }]}>
          {`${saved.white} – ${saved.black}`}
        </Text>
      ) : null}
      <TreeBoard editor={editor} analysis={analysis} />
      <View style={styles.row}>
        <Button
          label="Make main line"
          disabled={!current || !hasVariations}
          onPress={() => {
            // The move goes first among its siblings; the board stays on it.
            editor.setTree(promote(tree, path))
            editor.setPath([...path.slice(0, -1), 0])
          }}
        />
        <Button
          label="Delete move"
          disabled={!current}
          onPress={() => {
            editor.setTree(remove(tree, path))
            editor.setPath(path.slice(0, -1))
          }}
        />
        <Button
          label={dirty ? 'Save' : 'Saved'}
          kind="primary"
          disabled={!dirty || saving.busy}
          onPress={() => void save()}
        />
      </View>
      {saving.error ? <ErrorLine text={saving.error} /> : null}
      <View style={styles.row}>
        <Button
          label="Save PGN"
          onPress={() =>
            void services.files.exportText(
              `${saved.title.replace(/[^\w -]+/g, '').trim() || 'study'}.pgn`,
              studyAsPgn(saved),
            )
          }
        />
      </View>
      <MobileLink to={appHref(`/trainer/study/${saved.id}`, { color: 'white' })}>
        Train this study
      </MobileLink>
    </Screen>
  )
}

const styles = StyleSheet.create({
  form: { padding: 12, gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: RADIUS.control,
    padding: 10,
    fontFamily: FONTS.mono,
    fontSize: TEXT.sm.size,
    textAlignVertical: 'top',
  },
  title: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: FONTS.display,
    fontSize: TEXT['display-xs'].size,
  },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
})
