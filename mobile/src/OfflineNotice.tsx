import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';

// One quiet line, shown only while the server cannot be reached. Nothing is shown when the connection is fine.
export function OfflineNotice({ busy = false, onRetry }: { busy?: boolean; onRetry: () => void }) {
  return (
    <View style={o.row} accessibilityRole="alert">
      <Text style={o.text}>Нет связи. Проверьте интернет.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Повторить" disabled={busy} onPress={onRetry} style={({ pressed }) => [o.retry, (pressed || busy) && o.dim]}>
        <Text style={o.retryText}>Повторить</Text>
      </Pressable>
    </View>
  );
}

const o = StyleSheet.create({
  row: { minHeight: T.control.touch, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4, backgroundColor: C.surfaceAlt },
  text: { flex: 1, ...type.label, color: C.inkSoft },
  retry: { minHeight: T.control.touch, paddingHorizontal: 12, justifyContent: 'center' },
  retryText: { ...type.label, color: C.accent, fontWeight: '600' },
  dim: { opacity: 0.45 }
});
