import React from 'react';
import {Image} from 'react-native';
import {C} from './styles';
// The AI administrator's mark: the sign (lib/brand.ts) with eight rays, a thin line in the colour of the text. It stands
// where the app used to put a sparkle, so the AI is recognised by a sign only AiQonaq has.
const MARK=require('../assets/menu/shanyrak.png');
export function AiMark({size=20,color=C.ink}:{size?:number;color?:string}){
 return <Image source={MARK} accessibilityElementsHidden importantForAccessibility="no" style={{width:size,height:size,tintColor:color}}/>;
}
