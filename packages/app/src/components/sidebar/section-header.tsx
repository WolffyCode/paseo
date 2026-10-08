import { useCallback, useMemo, type ComponentType, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { buttonControlHeight } from "@/components/ui/control-geometry";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE } from "@/styles/theme";

export const SIDEBAR_ACTION_ICON_SIZE = ICON_SIZE.md;
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);

interface SidebarSectionHeaderProps {
  title: string;
  testID: string;
  children?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}

export function SidebarSectionHeader({
  title,
  testID,
  children,
  collapsed,
  onToggle,
}: SidebarSectionHeaderProps) {
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);
  const Chevron = collapsed ? ThemedChevronRight : ThemedChevronDown;

  return (
    <View style={sidebarSectionStyles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={accessibilityState}
        aria-expanded={!collapsed}
        onPress={onToggle}
        style={sidebarSectionStyles.toggle}
        testID={testID}
      >
        <Text style={sidebarSectionStyles.title} numberOfLines={1}>
          {title}
        </Text>
        <Chevron size={ICON_SIZE.sm} uniProps={mutedIconColorMapping} />
      </Pressable>
      {children ? <View style={sidebarSectionStyles.actions}>{children}</View> : null}
    </View>
  );
}

interface SidebarSectionActionProps {
  icon: ComponentType<{ color: string; size: number }>;
  label: string;
  onPress: () => void;
  testID: string;
}

export function SidebarSectionAction({
  icon: Icon,
  label,
  onPress,
  testID,
}: SidebarSectionActionProps) {
  const renderIcon = useCallback(
    (color: string) => <Icon color={color} size={SIDEBAR_ACTION_ICON_SIZE} />,
    [Icon],
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          style={sidebarSectionStyles.action}
          leftIcon={renderIcon}
          onPress={onPress}
          accessibilityLabel={label}
          testID={testID}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <Text style={sidebarSectionStyles.tooltip}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

export const sidebarSectionStyles = StyleSheet.create((theme) => ({
  header: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: theme.spacing[2],
    gap: theme.spacing[2],
  },
  title: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  toggle: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  action: {
    width: buttonControlHeight.sm,
    height: buttonControlHeight.sm,
    paddingHorizontal: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
  },
  actionHighlighted: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  tooltip: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
