import { expoAssets } from './assets'

/** Asset modules are numbers under Metro (and the jest stub); the reader turns one into its contents. */
const reader = {
  text: (module: number) => Promise.resolve(`tsv #${module}`),
  bytes: (module: number) => Promise.resolve(new Uint8Array([0x1f, 0x8b, module])),
}

test('hands the shared data layer the openings in file order and the bundled library as bytes', async () => {
  const assets = expoAssets(reader, { openings: [11, 12, 13], library: 20 })
  expect(await assets.openings()).toEqual(['tsv #11', 'tsv #12', 'tsv #13'])
  expect([...(await assets.bundledLibrary())]).toEqual([0x1f, 0x8b, 20])
})

test('ships the five openings files and the library with the app', () => {
  const assets = expoAssets(reader)
  expect(assets).toBeDefined()
  const { SHIPPED } = jest.requireActual('./assets') as typeof import('./assets')
  expect(SHIPPED.openings).toHaveLength(5)
  expect(SHIPPED.library).toBeDefined()
})
