import { createFileRoute } from '@tanstack/react-router'
import { Panel, SectionHeading } from '@chess/ui'
import pkg from '../../package.json'

const STOCKFISH = {
  name: 'Stockfish 19',
  licence: 'GNU General Public License v3',
  licenceUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
  source: 'https://github.com/official-stockfish/Stockfish/tree/sf_19',
}

/** The app's version and every licence it ships with (desktop-release). */
export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SectionHeading size="xl" meta={`version ${pkg.version}`}>
        About
      </SectionHeading>
      <Panel className="gap-2" testId="about-app">
        <p className="m-0 text-fg-primary">
          Chess — play the computer, learn and analyse, offline.
        </p>
        <p className="m-0 text-sm text-fg-secondary">Its own code is under the MIT licence.</p>
      </Panel>
      <Panel title="Credits" className="gap-3" testId="about-credits">
        <p className="m-0 text-sm text-fg-body">
          <strong>{STOCKFISH.name}</strong>, the unmodified official release, runs as a separate
          program under the <a href={STOCKFISH.licenceUrl}>{STOCKFISH.licence}</a>. Its licence
          (Copying.txt) and where its source is (SOURCE.txt) are installed with the app; the source:{' '}
          <a href={STOCKFISH.source}>{STOCKFISH.source}</a>.
        </p>
        <p className="m-0 text-sm text-fg-body">
          The pieces are the <strong>Cburnett</strong> set by Colin M.L. Burnett (Wikimedia
          Commons), under the 3-clause BSD licence.
        </p>
        <p className="m-0 text-sm text-fg-body">
          The opening names come from lichess's{' '}
          <a href="https://github.com/lichess-org/chess-openings">chess-openings</a> list, public
          domain (CC0).
        </p>
        <p className="m-0 text-sm text-fg-body">
          The library comes with the World Championship matches from{' '}
          <a href="https://www.pgnmentor.com/files.html">PGN Mentor</a> (moves only) and strong
          games of August 2026 from{' '}
          <a href="https://database.lichess.org/#broadcasts">lichess broadcasts</a>, under{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>; each broadcast
          game links to its lichess page.
        </p>
        <p className="m-0 text-sm text-fg-body">
          News headlines link to their publishers: FIDE, ChessBase, Lichess and The Week in Chess;
          the tournaments come from lichess's broadcast list.
        </p>
      </Panel>
    </div>
  )
}
