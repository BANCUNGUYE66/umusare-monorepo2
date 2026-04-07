import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

const styles = StyleSheet.create({
  glassPanel: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
});

export default function GlassSurface({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.glassPanel, style]}>{children}</View>;
}

export { styles as glassSurfaceStyles };
