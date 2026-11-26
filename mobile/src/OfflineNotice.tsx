import {t} from '../../lib/i18n';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';

// One quiet line, shown only while the server cannot be reached. Nothing is shown when the connection is fine.
// Since 2026-11-26 (board «Экраны старой версии») it floats as a thin dark pill over the top of the screen instead of
// pushing the whole screen down, and says it once: «Нет связи · Повторить».
export function OfflineNotice({ busy = false, onRetry }: { busy?: boolean; onRetry: () => void }) {
  return (
    <View style={o.row} accessibilityRole="alert">
      <View style={o.dot}/><Text numberOfLines={1} style={o.text}>{t('Нет связи')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Повторить')} disabled={busy} onPress={onRetry} style={({ pressed }) => [o.retry, (pressed || busy) && o.dim]}>
        <Text style={o.retryText}>{t('Повторить')}</Text>
      </Pressable>
    </View>
  );
}

const o = StyleSheet.create({
  row: { position: 'absolute', top: 66, alignSelf: 'center', zIndex: 1500, elevation: 20, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 2, borderRadius: T.radius.full, backgroundColor: C.ink, shadowColor: C.ink, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.danger },
  text: { ...type.label, color: C.onAccent, fontWeight: '600' },
  retry: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center' },
  retryText: { ...type.label, color: C.onAccent, fontWeight: '600', textDecorationLine: 'underline' },
  dim: { opacity: 0.45 }
});
