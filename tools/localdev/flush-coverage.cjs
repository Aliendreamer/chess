// Preloaded into the SSR server for the coverage run. The build is istanbul-instrumented (see
// vite.config COVERAGE=1), so executed code accumulates in the global `__coverage__` object. On a stop
// signal we write that object to /cov/out (one file per process) for `nyc report` to consume on the
// host, then exit cleanly.
const fs = require('node:fs')
const path = require('node:path')

function dumpCoverage() {
  try {
    const cov = globalThis.__coverage__
    if (cov && Object.keys(cov).length > 0) {
      const dir = process.env.COVERAGE_DIR || '/cov/out'
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `coverage-${process.pid}.json`), JSON.stringify(cov))
    }
  } catch (err) {
    console.error('coverage dump failed:', err)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    dumpCoverage()
    process.exit(0)
  })
}
