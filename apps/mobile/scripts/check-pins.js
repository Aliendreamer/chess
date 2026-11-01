// Fails when package.json has a dependency that is not pinned to an exact version.
// `expo install` and `expo lint` write ~/^ ranges regardless of .npmrc, so this gate catches them.
const fs = require('fs')
const path = require('path')

const EXACT = /^(\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?|workspace:\*)$/

function findUnpinned(pkg) {
  return ['dependencies', 'devDependencies'].flatMap((group) =>
    Object.entries(pkg[group] ?? {})
      .filter(([, version]) => !EXACT.test(version))
      .map(([name, version]) => `${group}.${name}: ${version}`),
  )
}

if (require.main === module) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const unpinned = findUnpinned(pkg)
  if (unpinned.length > 0) {
    console.error(`Unpinned dependencies (use exact versions):\n  ${unpinned.join('\n  ')}`)
    process.exit(1)
  }
  console.log('All dependencies are pinned.')
}

module.exports = { findUnpinned }
