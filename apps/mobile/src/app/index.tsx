import { Redirect } from 'expo-router'

/** The app opens on the Play tab (mobile-app D5). */
export default function Index() {
  return <Redirect href="/play" />
}
