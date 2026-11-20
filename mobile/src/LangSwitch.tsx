// The choice of language: three equal parts, each language named in itself (Қазақша, Русский, English), so a person
// who does not read the current language still finds their own. In the menu and on the sign-in screen.
import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {LANGS} from '../../lib/i18n';
import {chooseLang,useLang} from './lang';
import {a} from './AccountRows';

export function LangSwitch({label}:{label:string}){
  const current=useLang();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[a.seg,{padding:4,borderRadius:12}]}>
    {LANGS.map(l=><Pressable key={l.id} accessibilityRole="radio" accessibilityLabel={l.title} accessibilityState={{checked:l.id===current}} onPress={()=>void chooseLang(l.id)} hitSlop={4} style={[a.segItem,{flex:1,minHeight:40,alignItems:'center',paddingHorizontal:4},l.id===current&&a.segOn]}>
      <Text numberOfLines={1} style={[a.segText,{fontWeight:'600'},l.id===current&&a.segTextOn]}>{l.title}</Text>
    </Pressable>)}
  </View>;
}
