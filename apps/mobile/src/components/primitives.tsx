import type { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from '../theme/theme'
import { EYEBROW_TRACKING, FONTS, RADIUS, TEXT } from '../theme/tokens'

/** The smallest a control may be to the touch (both platforms' guidance: 44–48 points). */
export const TOUCH = 48

type ButtonKind = 'primary' | 'secondary' | 'ghost'

/**
 * A labelled button: `primary` (brass, one per screen), `secondary` (the default) or `ghost` (text only). With `grow` it
 * takes an equal share of its row (a row of commands).
 */
export function Button({
  label,
  onPress,
  kind = 'secondary',
  disabled = false,
  grow = false,
}: {
  label: string
  onPress: () => void
  kind?: ButtonKind
  disabled?: boolean
  grow?: boolean
}) {
  const { colors } = useTheme()
  const look = {
    primary: {
      backgroundColor: colors.accentFill,
      borderColor: colors.accentFill,
      color: colors.fgOnAccent,
    },
    secondary: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.lineStrong,
      color: colors.fgPrimary,
    },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent', color: colors.fgAccent },
  }[kind]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        grow && styles.grow,
        { backgroundColor: look.backgroundColor, borderColor: look.borderColor },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
      ]}
    >
      <Text style={[styles.buttonText, { color: look.color }]}>{label}</Text>
    </Pressable>
  )
}

/** One of a few choices (a level, a think time): `selected` marks the one taken. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  children,
}: {
  label: string
  selected: boolean
  onPress: () => void
  accessibilityLabel?: string
  /** Shown before the label (a piece). */
  children?: ReactNode
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.surfaceAccentSoft : colors.surfaceRaised,
          borderColor: selected ? colors.lineAccent : colors.lineStrong,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {children}
      <Text style={[styles.chipText, { color: selected ? colors.fgAccent : colors.fgPrimary }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/** A line in a list: a label, maybe a value and a detail; with `onPress` it is a button and shows a chevron. */
export function Row({
  label,
  value,
  detail,
  onPress,
  right,
}: {
  label: string
  value?: string
  detail?: string
  onPress?: () => void
  /** Something on the right instead of the value (a switch, a count). */
  right?: ReactNode
}) {
  const { colors } = useTheme()
  const body = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.fgPrimary }]}>{label}</Text>
        {detail ? <Text style={[styles.small, { color: colors.fgMuted }]}>{detail}</Text> : null}
      </View>
      {right ??
        (value ? <Text style={[styles.small, { color: colors.fgMuted }]}>{value}</Text> : null)}
      {onPress ? <Chevron color={colors.fgMuted} /> : null}
    </>
  )
  if (!onPress)
    return <View style={[styles.row, { borderTopColor: colors.lineDivider }]}>{body}</View>
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderTopColor: colors.lineDivider },
        pressed && { backgroundColor: colors.surfaceHover },
      ]}
    >
      {body}
    </Pressable>
  )
}

/** The small capitals over a group ("YOUR DATA"). */
export function Eyebrow({ children }: { children: string }) {
  const { colors } = useTheme()
  return (
    <Text accessibilityRole="header" style={[styles.eyebrow, { color: colors.fgMuted }]}>
      {children.toUpperCase()}
    </Text>
  )
}

/** A titled card of rows. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        accessibilityLabel={title}
        style={[styles.eyebrow, { color: colors.fgMuted }]}
      >
        {title.toUpperCase()}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>{children}</View>
    </View>
  )
}

/** A sheet from the bottom of the screen over a dimmed page; tapping outside or Close closes it. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { colors } = useTheme()
  if (!visible) return null
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable
          accessibilityLabel="Close"
          importantForAccessibility="no"
          style={styles.backdrop}
          onPress={onClose}
        />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceRaised }]}>
          <View style={styles.sheetHead}>
            <Text
              accessibilityRole="header"
              style={[styles.sheetTitle, { color: colors.fgPrimary }]}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.close}
            >
              <Text style={[styles.rowLabel, { color: colors.fgAccent }]}>Close</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  )
}

/** What a screen shows with nothing in it: what is missing, and the way on. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onPress: () => void }
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.fgPrimary }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.fgSecondary, textAlign: 'center' }]}>{body}</Text>
      {action ? <Button label={action.label} onPress={action.onPress} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    paddingHorizontal: 16,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, paddingHorizontal: 8 },
  buttonText: { fontFamily: FONTS.sansSemiBold, fontSize: TEXT.base.size },
  chip: {
    minHeight: TOUCH,
    paddingHorizontal: 12,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipText: { fontFamily: FONTS.sansMedium, fontSize: TEXT.sm.size },
  row: {
    minHeight: TOUCH,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: FONTS.sans, fontSize: TEXT.base.size, lineHeight: TEXT.base.lineHeight },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  body: { fontFamily: FONTS.sans, fontSize: TEXT.base.size, lineHeight: TEXT.base.lineHeight },
  eyebrow: {
    fontFamily: FONTS.sansMedium,
    fontSize: TEXT['2xs'].size,
    letterSpacing: EYEBROW_TRACKING,
  },
  section: { gap: 6 },
  card: { borderRadius: RADIUS.card, overflow: 'hidden' },
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  sheet: {
    borderTopLeftRadius: RADIUS.pill,
    borderTopRightRadius: RADIUS.pill,
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  sheetTitle: { fontFamily: FONTS.display, fontSize: TEXT['display-xs'].size },
  close: { minHeight: TOUCH, minWidth: TOUCH, alignItems: 'flex-end', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: FONTS.display, fontSize: TEXT['display-xs'].size },
})
