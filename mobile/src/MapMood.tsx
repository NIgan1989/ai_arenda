import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { MOOD_BEAT, type Mood } from './map-motion';
import { C } from './styles';

// The mood of the map (map-motion.ts mapMood): one soft light that rises from under the top edge of the sheet.
// It says how things stand without a word: the AI's colours while things go by themselves, amber while an answer or
// a payment is awaited, red and quick while something is late. With nothing going on there is no light at all.
// When a thing comes to a happy end, the crown of the yurt (the sign of the service) rises in gold on its night
// plate, as on the icon of the app, sends its rays out and fades.
const glowImage = require('../assets/brand/glow.png');
const ringImage = require('../assets/brand/dome-ring.png'), barsUpright = require('../assets/brand/dome-bars-v.png'), barsLevel = require('../assets/brand/dome-bars-h.png');
const LIGHTS: Exclude<Mood, 'calm'>[] = ['lead', 'wait', 'alert'];
// The line of the ornament on the sheet takes the mood's colour (readable on white); the light itself is brighter.
export const MOOD_COLOR: Record<Mood, string> = { calm: C.accent, lead: C.aiFrom, wait: C.warning, alert: C.danger };
const LIGHT: Record<Exclude<Mood, 'calm'>, string> = { lead: C.aiFrom, wait: C.gold, alert: C.danger };
// The light is this tall; half of it is hidden behind the sheet, so it reads as coming from under its edge.
export const MOOD_HEIGHT = 176;
const DOME = 64, RAYS = Array.from({ length: 16 }, (_, i) => i), JOY_MS = 2000;

// bottom: where the top edge of the sheet is, from the bottom of the map (it moves with the sheet).
// joy: a counter; each new value plays the crown once. still: «reduce motion» is on.
export function MapMood({ mood, joy, still, bottom }: { mood: Mood; joy: number; still: boolean; bottom: Animated.Value }) {
  const levels = useRef({ lead: new Animated.Value(0), wait: new Animated.Value(0), alert: new Animated.Value(0) }).current;
  const breath = useRef(new Animated.Value(0)).current, rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fades = LIGHTS.map(key => Animated.timing(levels[key], { toValue: key === mood ? 1 : 0, duration: still ? 0 : 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    Animated.parallel(fades).start();
    const beat = MOOD_BEAT[mood];
    if (still || !beat) { breath.setValue(0.5); return; }
    const half = { duration: beat / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const loop = Animated.loop(Animated.sequence([Animated.timing(breath, { toValue: 1, ...half }), Animated.timing(breath, { toValue: 0, ...half })]));
    loop.start();
    return () => loop.stop();
  }, [mood, still]);
  const played = useRef(joy);
  useEffect(() => {
    if (joy === played.current) return;
    played.current = joy;
    if (still) return;
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: JOY_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [joy, still]);
  const pulse = { opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }), transform: [{ scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.08] }) }] };
  // The second colour of the AI drifts across the first, so «things go by themselves» reads as alive, not as a lamp.
  const drift = { transform: [{ translateX: breath.interpolate({ inputRange: [0, 1], outputRange: [-48, 48] }) }] };
  const gold = [m.domePart, { tintColor: C.gold }];
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[m.host, { bottom: Animated.add(bottom, -MOOD_HEIGHT / 2) }]}>
      <Animated.View style={[m.fill, pulse]}>
        {LIGHTS.map(key => (
          <Animated.View key={key} style={[m.fill, { opacity: levels[key] }]}>
            <Image source={glowImage} resizeMode="stretch" accessibilityIgnoresInvertColors style={[m.light, { tintColor: LIGHT[key] }]} />
            {key === 'lead' && <Animated.View style={[m.fill, drift]}><Image source={glowImage} resizeMode="stretch" accessibilityIgnoresInvertColors style={[m.light, m.second, { tintColor: C.aiTo }]} /></Animated.View>}
          </Animated.View>
        ))}
      </Animated.View>
      <Animated.View style={[m.fill, { opacity: rise.interpolate({ inputRange: [0, 0.08, 0.6, 1], outputRange: [0, 0.9, 0.5, 0] }) }]}>
        <Image source={glowImage} resizeMode="stretch" accessibilityIgnoresInvertColors style={[m.light, { tintColor: C.gold }]} />
      </Animated.View>
      <Animated.View style={[m.dome, { opacity: rise.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [28, -40] }) }, { scale: rise.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0.5, 1.08, 1.2] }) }, { rotate: rise.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '33deg'] }) }] }]}>
        <Animated.View style={[m.rays, { opacity: rise.interpolate({ inputRange: [0, 0.2, 0.5, 1], outputRange: [0, 0, 1, 0] }), transform: [{ scale: rise.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.8, 0.8, 1.25] }) }] }]}>
          {RAYS.map(i => <View key={i} style={[m.rayTurn, { transform: [{ rotate: i * 22.5 + 'deg' }] }]}><View style={m.ray} /></View>)}
        </Animated.View>
        <View style={m.plate}>
          <Image source={ringImage} accessibilityIgnoresInvertColors style={gold} />
          <Image source={barsUpright} accessibilityIgnoresInvertColors style={gold} />
          <Image source={barsLevel} accessibilityIgnoresInvertColors style={gold} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const m = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, height: MOOD_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  light: { width: '130%', height: MOOD_HEIGHT, opacity: 0.7 },
  second: { width: '70%', opacity: 0.5 },
  dome: { position: 'absolute', top: 24, width: DOME, height: DOME, alignItems: 'center', justifyContent: 'center' },
  plate: { width: DOME, height: DOME, borderRadius: DOME / 2, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center', shadowColor: C.gold, shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  domePart: { position: 'absolute', width: DOME - 8, height: DOME - 8 },
  rays: { position: 'absolute', width: DOME + 40, height: DOME + 40 },
  rayTurn: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center' },
  ray: { width: 3, height: 12, borderRadius: 2, backgroundColor: C.gold },
});
