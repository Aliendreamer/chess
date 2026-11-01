import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react-native'
import { PIECE_XML, Piece } from './piece'

/**
 * The Cburnett pieces are `@chess/ui`'s files, carried as text (Metro takes no SVG): the XML prolog dropped and a
 * viewBox in place of the fixed 45×45, so they scale to any square. This fails when the two differ.
 */
const dir = join(__dirname, '../../../../libs/chess-ui/src/pieces')

function native(svg: string): string {
  return svg
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/<!DOCTYPE[^>]*>\s*/, '')
    .replace(/<svg[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">')
    .trim()
}

test.each(Object.keys(PIECE_XML))('%s is the Cburnett file', (key) => {
  expect(PIECE_XML[key as keyof typeof PIECE_XML]).toBe(
    native(readFileSync(join(dir, `${key}.svg`), 'utf8')),
  )
})

test('carries all twelve pieces', () => {
  expect(Object.keys(PIECE_XML).sort()).toEqual(
    ['bB', 'bK', 'bN', 'bP', 'bQ', 'bR', 'wB', 'wK', 'wN', 'wP', 'wQ', 'wR'].sort(),
  )
})

test('a piece says what it is', async () => {
  await render(<Piece piece="wN" size={40} />)
  expect(screen.getByLabelText('White knight')).toBeTruthy()
})
