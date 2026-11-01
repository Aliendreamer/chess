import { Tabs } from 'expo-router'
import { Icon, type IconName } from '@/components/icons'
import { useTheme } from '@/theme/theme'
import { FONTS, TEXT } from '@/theme/tokens'

/** The five tabs (mobile-app D5, approved on the mockups): each holds its own stack of pages. */
const TABS: ReadonlyArray<{ name: string; title: string; icon: IconName }> = [
  { name: 'play', title: 'Play', icon: 'swords' },
  { name: 'learn', title: 'Learn', icon: 'graduationCap' },
  { name: 'analyse', title: 'Analyse', icon: 'microscope' },
  { name: 'news', title: 'News', icon: 'newspaper' },
  { name: 'more', title: 'More', icon: 'ellipsis' },
]

export default function TabsLayout() {
  const { colors } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.fgAccent,
        tabBarInactiveTintColor: colors.fgMuted,
        tabBarStyle: { backgroundColor: colors.surfaceCard, borderTopColor: colors.lineDivider },
        tabBarLabelStyle: { fontFamily: FONTS.sansMedium, fontSize: TEXT['2xs'].size },
        sceneStyle: { backgroundColor: colors.surfacePage },
      }}
    >
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Icon name={icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  )
}
