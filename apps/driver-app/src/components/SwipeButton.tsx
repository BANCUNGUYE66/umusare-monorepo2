import React, { useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface SwipeButtonProps {
  label: string;
  onSwipeSuccess: () => Promise<void> | void;
  disabled?: boolean;
}

const KNOB_SIZE = 52;

export default function SwipeButton({
  label,
  onSwipeSuccess,
  disabled = false,
}: SwipeButtonProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const trackWidth = useRef(0);
  const busy = useRef(false);

  const maxTranslate = () => Math.max(0, trackWidth.current - KNOB_SIZE - 6);

  const resetKnob = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && !busy.current,
        onMoveShouldSetPanResponder: () => !disabled && !busy.current,
        onPanResponderMove: (_, gesture) => {
          const x = Math.max(0, Math.min(maxTranslate(), gesture.dx));
          translateX.setValue(x);
        },
        onPanResponderRelease: async (_, gesture) => {
          const threshold = maxTranslate() * 0.8;
          if (gesture.dx >= threshold && !busy.current) {
            busy.current = true;
            Animated.timing(translateX, {
              toValue: maxTranslate(),
              duration: 120,
              useNativeDriver: true,
            }).start();

            try {
              await onSwipeSuccess();
            } finally {
              busy.current = false;
              resetKnob();
            }
            return;
          }
          resetKnob();
        },
      }),
    [disabled, onSwipeSuccess, translateX]
  );

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled]}
      onLayout={(event) => {
        trackWidth.current = event.nativeEvent.layout.width;
      }}
    >
      <Text style={styles.label}>{label}</Text>
      <Animated.View
        style={[styles.knob, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.knobArrow}>→</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    height: 58,
    borderRadius: 999,
    backgroundColor: '#0047AB',
    justifyContent: 'center',
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  trackDisabled: {
    opacity: 0.5,
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  knob: {
    position: 'absolute',
    left: 3,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobArrow: {
    fontSize: 22,
    color: '#0047AB',
    fontWeight: '700',
  },
});
