// expo-doctor as a gate, with one known finding tolerated (mobile-app D3): the shared libraries in libs/ install React
// 19.2.7 for their own tests (the web apps' version), which expo-doctor reports as a duplicate of this app's 19.2.3.
// The bundle holds one React (Metro resolves `react` to this app's copy; jest.config.js maps it), so that finding is
// passed and named; any other finding, or React duplicated anywhere else, fails as expo-doctor does.
const { spawnSync } = require('child_process')

/** expo-doctor's exit code and output → whether the gate passes, and what it tolerated. */
function verdict(code, raw) {
  if (code === 0) return { ok: true }
  // Colours (Nx forces them) would hide the markers.
  const output = raw.replace(/\u001b\[[0-9;]*m/g, '')
  const failed = output.match(/^✖ .+$/gm) ?? []
  if (failed.length !== 1 || !failed[0].includes('no duplicate dependencies')) return { ok: false }
  const groups = [...output.matchAll(/^Found duplicates for (\S+):\n((?:\s+[├└].*\n?)+)/gm)]
  if (groups.length !== 1 || groups[0][1] !== 'react') return { ok: false }
  const copies = [...groups[0][2].matchAll(/(react@\S+) \(at: ([^)]+)\)/g)]
  const ours = copies.filter(([, , at]) => at === 'node_modules/react')
  const libs = copies.filter(([, , at]) =>
    /^\.\.\/\.\.\/libs\/[^/]+\/node_modules\/react$/.test(at),
  )
  if (ours.length !== 1 || ours.length + libs.length !== copies.length) return { ok: false }
  return {
    ok: true,
    tolerated: libs.map(([, id, at]) => `${id} in ${at.split('/').slice(2, 4).join('/')}`),
  }
}

if (require.main === module) {
  const run = spawnSync('expo-doctor', { encoding: 'utf8', shell: true })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const result = verdict(run.status ?? 1, output)
  process.stdout.write(output)
  if (result.tolerated)
    console.log(`\nTolerated (the shared libraries' test React): ${result.tolerated.join(', ')}`)
  process.exit(result.ok ? 0 : 1)
}

module.exports = { verdict }
