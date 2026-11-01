const { verdict } = require('./expo-doctor')

const ONLY_LIBS_REACT = `20/21 checks passed. 1 checks failed. Possible issues detected:
✖ Check that no duplicate dependencies are installed
Your project contains duplicate native module dependencies, which should be de-duplicated.
Found duplicates for react:
  ├─ react@19.2.3 (at: node_modules/react)
  └─ react@19.2.7 (at: ../../libs/chess-view/node_modules/react)
Advice:
Resolve your dependency issues and deduplicate your dependencies.
1 checks failed, indicating possible issues with the project.`

test('passes a clean run', () => {
  expect(verdict(0, '21/21 checks passed. No issues detected!')).toEqual({ ok: true })
})

test('passes when the only finding is the shared libraries’ own React for their tests', () => {
  expect(verdict(1, ONLY_LIBS_REACT)).toEqual({
    ok: true,
    tolerated: ['react@19.2.7 in libs/chess-view'],
  })
})

test('fails on any other duplicate, even beside the tolerated one', () => {
  const other = ONLY_LIBS_REACT.replace(
    'Advice:',
    `Found duplicates for expo-constants:
  ├─ expo-constants@57.0.19 (at: node_modules/expo-constants)
  └─ expo-constants@57.0.22 (at: ../../node_modules/.pnpm/expo-asset/node_modules/expo-constants)
Advice:`,
  )
  expect(verdict(1, other).ok).toBe(false)
})

test('fails when another check fails', () => {
  const two = ONLY_LIBS_REACT.replace('1 checks failed.', '2 checks failed.').concat(
    '\n✖ Check that packages match versions required by installed Expo SDK',
  )
  expect(verdict(1, two).ok).toBe(false)
})

test('fails when React is duplicated anywhere but under libs/', () => {
  expect(
    verdict(1, ONLY_LIBS_REACT.replace('../../libs/chess-view/', '../../node_modules/.pnpm/x/')).ok,
  ).toBe(false)
})

test('reads coloured output as plain', () => {
  const coloured = ONLY_LIBS_REACT.replace(/^(✖.*|Found.*)$/gm, '\u001b[31m$1\u001b[39m')
  expect(verdict(1, coloured).ok).toBe(true)
})
