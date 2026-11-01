import { render, screen } from '@testing-library/react-native'
import Home from '@/app/index'

test('the placeholder home shows the shared libraries at work', async () => {
  await render(<Home />)
  expect(screen.getByTestId('title').props.children).toBe('Chess')
  expect(screen.getByTestId('start-key').props.children).toBe(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
  )
  expect(screen.getByTestId('schema').props.children).toBe('Schema 2')
  expect(screen.getByTestId('side').props.children).toBe('white')
})
