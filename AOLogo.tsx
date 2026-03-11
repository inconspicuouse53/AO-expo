/**
 * AO Logo - White "A" chevron + "O" eye rendered as SVG for web,
 * stylized text fallback for native (Expo Go)
 */
import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';

interface AOLogoProps {
  size?: number;
}

export default function AOLogo({ size = 110 }: AOLogoProps) {
  if (Platform.OS === 'web') {
    // SVG logo: white A-chevron on top, white eye (oval + dark pupil) below
    // Viewbox is 100x100, scaled to size
    const svgMarkup = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
        <!-- A chevron (bigger, spans wider) -->
        <path d="M50 2 L90 58 L78 58 L50 16 L22 58 L10 58 Z" fill="white" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        <!-- O eye - smaller, nestled inside the A -->
        <ellipse cx="50" cy="58" rx="20" ry="12" fill="none" stroke="white" stroke-width="5"/>
        <!-- O eye - pupil -->
        <circle cx="50" cy="58" r="5" fill="#222"/>
      </svg>
    `;
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <div style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: svgMarkup }} />
      </View>
    );
  }

  // Native fallback: stylized "AO" text
  const fontSize = size * 0.5;
  return (
    <View style={[nativeStyles.container, { width: size, height: size }]} pointerEvents="none">
      <Text style={[nativeStyles.logoText, { fontSize }]}>AO</Text>
    </View>
  );
}

const nativeStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 4,
  },
});
