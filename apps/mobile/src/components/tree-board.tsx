import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { lineEnd, nextPath, playMove, scoreText, uciSquares } from '@chess/core'
import { useAutoEvaluate } from '@chess/view'
import type { Analysis, MoveTreeEditor } from '@chess/view'
import {
  EngineLines,
  EvalBar,
  EvaluationSwitches,
  MoveNav,
  MoveTree,
  NavButton,
  ThinkChips,
  type EvaluationShown,
} from './analysis'
import { Board } from './board'

/**
 * A board with its move tree and the engine (analysis-board), as the analysis board and a study both show it: the
 * horizontal evaluation bar, the board edge to edge (mobile-app D5), the move buttons and flip, the engine's lines,
 * the tree. Moves played go into the tree. With `shown` the bar and the lines follow the player's switches; without,
 * the lines always show (a study, as on desktop).
 */
export function TreeBoard({
  editor,
  analysis,
  shown,
  onShown,
}: {
  editor: MoveTreeEditor
  analysis: Analysis
  shown?: EvaluationShown
  onShown?: (shown: EvaluationShown) => void
}) {
  const { width } = useWindowDimensions()
  const { fen, tree, path } = editor
  const bar = shown?.bar ?? false
  const lines = shown?.line ?? true
  useAutoEvaluate(analysis, fen, bar || lines)
  const evaluation = analysis.evaluationOf(fen)
  const scoreOf = (at: string) => {
    const best = analysis.evaluationOf(at)?.lines[0]
    return best ? scoreText(best) : null
  }
  return (
    <>
      {bar ? <EvalBar evaluation={evaluation} orientation={editor.orientation} /> : null}
      {/* Edge to edge: the screen's 16pt gutter is given back. */}
      <View style={styles.bleed}>
        <Board
          fen={fen}
          orientation={editor.orientation}
          size={width}
          lastMove={uciSquares(editor.current?.uci)}
          onMove={(uci) => {
            const move = playMove(fen, uci)
            if (move) editor.playLine([move])
          }}
        />
      </View>
      <MoveNav
        onFirst={() => editor.setPath([])}
        onPrevious={() => editor.setPath(path.slice(0, -1))}
        onNext={() => editor.setPath(nextPath(tree, path) ?? path)}
        onLast={() => editor.setPath(lineEnd(tree, path))}
      >
        <NavButton label="Flip board" glyph="⇅" onPress={editor.flip} />
      </MoveNav>
      {lines ? (
        <View style={styles.engine}>
          <EngineLines
            fen={fen}
            evaluation={evaluation}
            error={analysis.error}
            onPlay={editor.playLine}
          />
          <ThinkChips analysis={analysis} />
        </View>
      ) : null}
      <MoveTree
        tree={tree}
        startFen={editor.startFen}
        current={path}
        onSelect={editor.setPath}
        scoreOf={scoreOf}
      />
      {shown && onShown ? <EvaluationSwitches shown={shown} onChange={onShown} /> : null}
    </>
  )
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -16 },
  engine: { gap: 8 },
})
