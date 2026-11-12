import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';
import { unbrokenTime, type NowCard as NowCardModel } from './now-card';

// Shown only when now-card.ts found something real. No card is rendered for an empty state.
export function NowCard({ card, onOpen }: { card: NowCardModel; onOpen: () => void }) {
  return (
    <View style={[n.card, card.urgent && n.urgent]} accessibilityLabel={'Сейчас: ' + card.title + '. ' + card.detail}>
      <View style={n.text}>
        <Text style={[n.label, card.urgent && n.labelUrgent]}>Сейчас</Text>
        <Text numberOfLines={2} style={n.title}>
          {card.title}
        </Text>
        <Text numberOfLines={2} style={n.detail}>
          {unbrokenTime(card.detail)}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={card.action + ': ' + card.title} onPress={onOpen} style={({ pressed }) => [n.action, pressed && n.pressed]}>
        <Text style={n.actionText}>{card.action}</Text>
      </Pressable>
    </View>
  );
}

const n = StyleSheet.create({
  // The button stays on the right while the text keeps a readable column beside it (160px);
  // on a card narrower than that it goes under the text and takes the whole row. The same rule as on the site.
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 8,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: C.glassLine,
    backgroundColor: C.glass
  },
  urgent: { borderColor: C.accentLine, backgroundColor: C.accentSoft },
  text: { flexGrow: 999, flexShrink: 1, flexBasis: 160, minWidth: 0 },
  label: { ...type.caption, color: C.muted, fontWeight: '600' },
  labelUrgent: { color: C.accentPressed },
  title: { ...type.body, color: C.ink, fontWeight: '600' },
  detail: { ...type.label, color: C.inkSoft },
  action: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: T.control.touch,
    minWidth: 88,
    paddingHorizontal: 16,
    borderRadius: T.radius.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pressed: { backgroundColor: C.accentPressed },
  actionText: { ...type.label, color: C.onAccent, fontWeight: '600' }
});
