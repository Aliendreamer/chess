const { findUnpinned } = require('./check-pins')

test('finds ranges and leaves exact versions and workspace links alone', () => {
  expect(
    findUnpinned({
      dependencies: { a: '1.2.3', b: '~1.2.3', c: 'workspace:*' },
      devDependencies: { d: '^4.0.0' },
    }),
  ).toEqual(['dependencies.b: ~1.2.3', 'devDependencies.d: ^4.0.0'])
})
