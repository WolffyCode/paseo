import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";

// throbber_small.svg: a three-quarter arc on a 16 unit canvas that turns once every 1568.63 ms.
const TURN_DURATION_MS = 1568.63;
const ARC_PATH = "M8 1.125A6.875 6.875 0 1 1 1.125 8";
const ARC_STROKE_WIDTH = 2.25;

function Arc({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d={ARC_PATH}
        fill="none"
        stroke={color}
        strokeWidth={ARC_STROKE_WIDTH}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const ThemedArc = withUnistyles(Arc, (theme) => ({ color: theme.webui.throbber }));

/** The small throbber WebUI pages show while they wait, as the 删除浏览数据 dialog's spinner. */
export function CrThrobber({ size }: { size: number }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: TURN_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const spinStyle = useMemo(
    () => ({
      width: size,
      height: size,
      transform: [
        { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
      ],
    }),
    [size, turn],
  );
  return (
    <Animated.View style={spinStyle}>
      <ThemedArc size={size} />
    </Animated.View>
  );
}
