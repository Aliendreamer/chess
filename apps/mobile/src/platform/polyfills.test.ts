import { installCrypto } from './polyfills'

test('gives Hermes crypto.getRandomValues (newId needs it) from expo-crypto, and keeps one that exists', () => {
  const target: { crypto?: { getRandomValues: (a: Uint8Array) => Uint8Array } } = {}
  const fill = jest.fn((a: Uint8Array) => a.fill(7))
  installCrypto(target, fill)
  expect([...target.crypto!.getRandomValues(new Uint8Array(3))]).toEqual([7, 7, 7])

  const own = { getRandomValues: jest.fn((a: Uint8Array) => a) }
  const withOwn = { crypto: own }
  installCrypto(withOwn, fill)
  expect(withOwn.crypto).toBe(own)
})
