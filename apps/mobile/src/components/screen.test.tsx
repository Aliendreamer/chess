import { act, render, screen } from '@testing-library/react-native'
import { libraryProgress } from '@/lib/services'
import { LibraryProgressLine } from './screen'

test('the library’s first load shows how far it has got, and goes when it is done', async () => {
  const progress = libraryProgress()
  await render(<LibraryProgressLine progress={progress} />)
  expect(screen.queryByText(/Preparing the library/)).toBeNull()
  await act(() => progress.report(21, 50))
  expect(screen.getByText('Preparing the library … 42 %')).toBeTruthy()
  expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ now: 42 })
  await act(() => progress.done())
  expect(screen.queryByText(/Preparing the library/)).toBeNull()
})
