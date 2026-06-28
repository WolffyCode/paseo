// codePilot settings kit — the shared Unistyles styles for the new settings UI.
// Visual contract = CodePilot's settings (SettingsSidebar / SettingsCard / FieldRow,
// p-6 content, flat nav rows, GitHub-blue accent) mapped onto Helm's integrated
// codePilot theme tokens so geometry stays consistent with the home shell cards.
// Colors are always tokens (never literals); only spacing/radius use scale values.
import { StyleSheet } from "react-native-unistyles";

export const settingsKit = StyleSheet.create((theme) => ({
  // ---- left nav (renders into the shell's left card; no own frame) ----
  navRoot: {
    flex: 1,
    minHeight: 0,
  },
  navScroll: {
    padding: theme.spacing[2],
    gap: 2,
  },
  navBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    height: 32,
    paddingHorizontal: 10,
    borderRadius: theme.borderRadius.md,
  },
  navBackText: {
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
  navGroupLabel: {
    fontSize: 11,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[1.5],
  },
  navSep: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[1.5],
    marginHorizontal: theme.spacing[2],
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    height: 36,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
  },
  navRowHover: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  navRowActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  navRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: theme.colors.foreground,
  },
  navRowTextActive: {
    color: theme.colors.secondaryForeground,
    fontWeight: theme.fontWeight.medium,
  },
  navDeskMark: {
    marginLeft: "auto",
    opacity: 0.7,
  },

  // host picker (top of the host nav group)
  hostPick: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: 10,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    marginBottom: theme.spacing[1],
  },
  hostPickName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  hostDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },

  // ---- detail content (renders into the shell's main card; no own frame) ----
  contentScroll: {
    flex: 1,
    minHeight: 0,
  },
  contentInner: {
    padding: theme.spacing[6],
    gap: theme.spacing[8],
    maxWidth: 880,
    width: "100%",
    alignSelf: "center",
  },
  detailHeader: {
    gap: theme.spacing[1.5],
  },
  detailTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    letterSpacing: -0.2,
  },
  detailSub: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    lineHeight: 20,
  },

  // group = label + a stack of cards
  group: {
    gap: theme.spacing[2],
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: 2,
  },
  groupTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foregroundMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  // SettingsCard = bordered surface holding rows (CodePilot: rounded-lg p-5 space-y-4)
  card: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  cardPadded: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },

  // FieldRow = label/desc on the left, control on the right
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  rowDivider: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  rowLabelText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  rowDesc: {
    fontSize: 12.5,
    color: theme.colors.foregroundMuted,
    marginTop: 3,
    lineHeight: 18,
  },
  rowControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },

  // ---- controls ----
  toggleTrack: {
    width: 38,
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface4,
    padding: 2,
  },
  toggleTrackOn: {
    backgroundColor: theme.colors.accent,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface0,
  },

  segmented: {
    flexDirection: "row",
    padding: 2,
    gap: 2,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
  },
  segment: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
  },
  segmentText: {
    fontSize: 12.5,
    color: theme.colors.foregroundMuted,
  },
  segmentOn: {
    backgroundColor: theme.colors.surface0,
    ...theme.shadow.sm,
  },
  segmentTextOn: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },

  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    minWidth: 150,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: 11,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
  },
  selectText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },

  input: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: 11,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
  },

  // ---- button ----
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1.5],
    height: 30,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
  },
  btnSm: {
    height: 28,
    paddingHorizontal: 10,
  },
  btnText: {
    fontSize: 13,
    fontWeight: theme.fontWeight.medium,
  },
  btnPrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  btnPrimaryText: {
    color: theme.colors.accentForeground ?? "#ffffff",
  },
  btnOutline: {
    backgroundColor: theme.colors.surface0,
    borderColor: theme.colors.border,
  },
  btnOutlineText: {
    color: theme.colors.foreground,
  },
  btnGhostText: {
    color: theme.colors.foregroundMuted,
  },
  btnDanger: {
    backgroundColor: theme.colors.surface0,
    borderColor: theme.colors.destructive,
  },
  btnDangerText: {
    color: theme.colors.destructive,
  },
  btnDisabled: {
    opacity: 0.45,
  },

  // ---- badge ----
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: 1,
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: theme.fontWeight.medium,
  },
  badgeMuted: { backgroundColor: theme.colors.surface2 },
  badgeMutedText: { color: theme.colors.foregroundMuted },
  badgeSuccess: { backgroundColor: theme.colors.surface2 },
  badgeSuccessText: { color: theme.colors.statusSuccess },
  badgeWarn: { backgroundColor: theme.colors.surface2 },
  badgeWarnText: { color: theme.colors.statusWarning },
  badgeErr: { backgroundColor: theme.colors.surface2 },
  badgeErrText: { color: theme.colors.destructive },

  // ---- value text + status dot ----
  value: {
    fontSize: 13.5,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
  },
  valueStrong: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },
  valueWarn: {
    color: theme.colors.statusWarning,
    fontWeight: theme.fontWeight.semibold,
  },
  valueDanger: {
    color: theme.colors.destructive,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  dotOn: { backgroundColor: theme.colors.statusSuccess },
  dotOff: { backgroundColor: theme.colors.destructive },
  dotIdle: { backgroundColor: theme.colors.foregroundMuted },

  // small shared fillers (hoisted so JSX never creates inline style objects)
  flexFill: {
    flex: 1,
    minWidth: 0,
  },
  toggleAlignOff: { alignItems: "flex-start" },
  toggleAlignOn: { alignItems: "flex-end" },

  // ---- alert / empty ----
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  alertDesc: {
    fontSize: 12.5,
    color: theme.colors.foregroundMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  empty: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[6],
    alignItems: "center",
    gap: theme.spacing[2],
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));
