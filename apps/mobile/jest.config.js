// jest-expo, with one React (mobile-app D3): the shared libraries keep React 19.2.7 for the web apps in their own
// node_modules, so `react` always resolves to this app's 19.2.3, as metro.config.js does for the bundle.
const path = require('path')

const own = (name) => path.dirname(require.resolve(`${name}/package.json`, { paths: [__dirname] }))

module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|standard-navigation|@chess/.*))',
  ],
  moduleNameMapper: {
    '^react$': own('react'),
    '^react/(.*)$': `${own('react')}/$1`,
  },
}
