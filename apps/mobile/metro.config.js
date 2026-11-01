// Metro in the pnpm workspace (mobile-app D4). Expo's default config is enough for the code: it follows pnpm's symlinks
// into libs/* (TypeScript source with `.ts` import extensions) and resolves `react` to this app's copy, so the bundle
// has one React (19.2.3) although the shared libraries keep 19.2.7 for the web apps (checked with `expo export`,
// task 2.1); Jest does not, jest.config.js maps it. The shipped files are assets: the openings (.tsv) and the
// bundled library (.gz), read by src/platform/assets.ts.
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
config.resolver.assetExts.push('tsv', 'gz')

module.exports = config
