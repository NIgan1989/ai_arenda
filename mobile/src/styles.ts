import { StyleSheet,Platform } from 'react-native';
import {T} from './tokens';
// The app paints in one ink, as the main screen and the menu do: the indigo of the tokens stays on the site, the
// splash and the brand moments (night, dome, gold). Status colours (success, warning, danger) keep their meaning.
const ink=T.color.ink,soft=T.color.inkSoft;
export const C={...T.color,accent:ink,accentPressed:soft,accentSoft:T.color.surfaceAlt,accentLine:T.color.lineStrong,
 aiFrom:ink,aiMid:soft,aiTo:T.color.muted,focus:ink,info:soft,infoSoft:T.color.surfaceAlt,infoLine:T.color.line,
 bubbleMine:T.color.line,chatWall:T.color.bg};
// Every size below comes from design/tokens.json: 4pt spacing, seven text sizes, five radii, 44/48/56 controls.
const [caption,label,body,subtitle,title,heading,display]=Object.values(T.font).map(([fontSize,lineHeight])=>({fontSize,lineHeight}));
const R=T.radius,H=T.control;
export const type={caption,label,body,subtitle,title,heading,display};
// The typeface of the name (lib/brand.ts, Unbounded): the titles of screens and of marked moments, nothing else.
// The file is loaded once, before the first screen (App.tsx). It has one weight, so `fontWeight` stays normal.
export const brandFont={fontFamily:'Unbounded',fontWeight:'normal',letterSpacing:0} as const;
export const s=StyleSheet.create({
  // The consent at sign-up: a box and one line whose document names are links, as other services do.
  checkBox:{width:24,height:24,borderRadius:R.xs,borderWidth:2,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},checkBoxOn:{backgroundColor:C.accent,borderColor:C.accent},
  checkTick:{...label,color:C.onAccent,fontWeight:'600'},inlineLink:{color:C.accent,textDecorationLine:'underline'},
  groupTitle:{...caption,color:C.muted,fontWeight:'600',marginTop:8,marginBottom:8,marginHorizontal:4},
  pageTitle:{...title,...brandFont,color:C.ink,marginBottom:16},
  recommendation:{padding:16,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.accentSoft,borderRadius:R.lg,gap:4,marginBottom:16},
  urgentRecommendation:{backgroundColor:C.warningSoft,borderColor:C.warningLine},
  recommendationLabel:{...caption,color:C.muted},
  screen:{flex:1,backgroundColor:C.bg},shell:{flex:1,width:'100%',maxWidth:760,alignSelf:'center'},
  stage:{flex:1,minHeight:0},sheetLayer:{position:'absolute',top:0,right:0,bottom:0,left:0},sheetScrim:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:C.scrim},
  // Over the map with the card of one deal: the map stays bright, so the pin of that deal and its mood are seen.
  sheetScrimDeal:{opacity:.4},
  pageSheetFill:{flex:1,marginTop:44},pageSheet:{minHeight:0,backgroundColor:C.bg,borderTopLeftRadius:R.xl,borderTopRightRadius:R.xl,overflow:'hidden'},pageSheetFull:{marginTop:0,borderTopLeftRadius:0,borderTopRightRadius:0},
  // One opened booking or cleaning: the sheet is as tall as its card, so the map stays in view above it.
  // It must never carry `flex`: on a phone `flex:1` beats `flexBasis:'auto'` (Yoga reads «auto» as «not set»), and the sheet gets no height at all.
  pageSheetFit:{flexGrow:0,flexShrink:1,marginTop:'auto',maxHeight:'92%'},fitScroll:{flexGrow:0,flexShrink:1},fitContent:{flexGrow:0},
  sheetTitle:{...body,flex:1,textAlign:'center',color:C.ink,fontWeight:'600'},sheetSide:{width:H.touch},sheetHead:{minHeight:H.primary,paddingTop:16,paddingBottom:4,paddingLeft:20,paddingRight:8,flexDirection:'row',alignItems:'center',gap:8},sheetGrab:{position:'absolute',top:8,left:'50%',marginLeft:-20,width:40,height:4,borderRadius:R.xs,backgroundColor:C.lineStrong},
  sheetClose:{width:H.touch,height:H.touch,borderRadius:R.full,alignItems:'center',justifyContent:'center'},sheetBackText:{fontSize:28,lineHeight:32,color:C.ink,fontWeight:'500'},sheetCloseText:{width:32,height:32,borderRadius:R.full,backgroundColor:C.surfaceAlt,color:C.ink,textAlign:'center',lineHeight:32,fontSize:16,overflow:'hidden'},
  header:{minHeight:H.primary,paddingVertical:4,paddingLeft:16,paddingRight:8,flexDirection:'row',alignItems:'center',gap:8},
  headerTitle:{...title,...brandFont,color:C.ink},
  headerAI:{width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},headerAIText:{...label,color:C.onAccent,fontWeight:'600'},
  logo:{width:H.compact,height:H.compact,backgroundColor:C.accent,borderRadius:R.md,alignItems:'center',justifyContent:'center'},logoText:{...subtitle,color:C.onAccent,fontWeight:'600'},subtitle:{...caption,color:C.muted},
  status:{width:8,height:8,borderRadius:R.xs},connection:{alignItems:'center',flexDirection:'row',gap:8},connectionText:{...caption,color:C.muted},
  transcript:{paddingHorizontal:16,paddingTop:8,paddingBottom:24,flexGrow:1},
  welcome:{paddingTop:8,paddingBottom:16},eyebrow:{...caption,color:C.muted,marginBottom:12},hero:{...title,...brandFont,color:C.ink},lead:{...body,color:C.muted,marginTop:8,maxWidth:440},
  suggestions:{marginTop:24,gap:8},chip:{minHeight:H.touch,paddingVertical:12,paddingHorizontal:16,borderWidth:1,borderColor:C.accentLine,borderRadius:R.full,backgroundColor:C.glassStrong},chipText:{...label,color:C.ink},
  welcomeAction:{borderWidth:1,borderColor:C.glassLine,borderRadius:R.lg,padding:16,minHeight:72,justifyContent:'center',backgroundColor:C.glassStrong,gap:4},welcomeActionTitle:{...body,fontWeight:'600',color:C.ink},welcomeActionDetail:{...label,color:C.muted},welcomeNote:{marginTop:16,...caption,color:C.muted},
  shortcutWrap:{height:H.primary},shortcutList:{gap:8,paddingHorizontal:16,paddingBottom:12},shortcut:{height:H.touch,paddingHorizontal:16,borderWidth:1,borderColor:C.accentLine,borderRadius:R.full,backgroundColor:C.glassStrong,justifyContent:'center'},shortcutText:{...label,color:C.inkSoft},
  message:{marginBottom:24,maxWidth:'100%'},user:{alignSelf:'flex-end',backgroundColor:C.surfaceAlt,paddingHorizontal:16,paddingVertical:12,borderRadius:R.lg,borderBottomRightRadius:R.xs,maxWidth:'88%'},assistant:{alignSelf:'stretch'},sender:{...caption,color:C.muted,marginBottom:8},text:{...body,color:C.ink},
  card:{borderWidth:1,borderColor:C.glassLine,backgroundColor:C.glassStrong,borderRadius:R.lg,padding:16,marginTop:12,gap:12},cardTitle:{...subtitle,color:C.ink,fontWeight:'600',letterSpacing:-.2},meta:{...label,color:C.muted},price:{...title,color:C.ink,fontWeight:'600',letterSpacing:-.4},badge:{...caption,color:C.success,backgroundColor:C.successSoft,alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:4,borderRadius:R.sm,overflow:'hidden'},badgeWarn:{color:C.warning,backgroundColor:C.warningSoft},
  button:{backgroundColor:C.accent,borderRadius:R.full,paddingVertical:12,paddingHorizontal:16,alignItems:'center',justifyContent:'center',minHeight:H.field},buttonText:{...label,fontWeight:'600',color:C.onAccent,textAlign:'center'},secondary:{backgroundColor:C.glassStrong,borderWidth:1,borderColor:C.line},secondaryText:{color:C.ink},buttonRow:{flexDirection:'row',gap:8,flexWrap:'wrap'},disabled:{opacity:.45},
  disclosure:{minHeight:H.field,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  // The line above a long list: what is shown and a text link that widens or narrows it.
  listScope:{minHeight:H.touch,flexDirection:'row',alignItems:'center',gap:12},listScopeLink:{minHeight:H.touch,justifyContent:'center',paddingLeft:8},listScopeText:{...label,color:C.accent,fontWeight:'600'},
  field:{borderWidth:1,borderColor:C.lineStrong,borderRadius:R.md,paddingHorizontal:12,paddingVertical:12,...body,color:C.ink,minHeight:H.field,backgroundColor:C.surface},fieldLabel:{...label,color:C.muted,marginTop:4},focusRing:Platform.OS==='web'?{outlineStyle:'solid',outlineWidth:2,outlineColor:C.focus,outlineOffset:2} as any:{borderWidth:2,borderColor:C.focus},
  keyval:{flexDirection:'row',justifyContent:'space-between',gap:16,paddingVertical:8,borderBottomColor:C.line,borderBottomWidth:1},key:{...label,color:C.muted,flex:1},value:{...label,color:C.ink,flex:2,textAlign:'right'},
  dealFoot:{paddingHorizontal:16,paddingTop:12,paddingBottom:16,borderTopWidth:1,borderTopColor:C.line,backgroundColor:C.surface},
  composerWrap:{padding:12,borderTopColor:C.line,borderTopWidth:1,backgroundColor:C.bg,gap:8},composer:{borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,borderRadius:R.xl,flexDirection:'row',alignItems:'flex-end',padding:4,paddingLeft:16,gap:8},input:{flex:1,...body,height:H.touch,minHeight:H.touch,maxHeight:120,paddingVertical:8,color:C.ink},send:{minHeight:H.touch,minWidth:88,paddingHorizontal:12,borderRadius:R.xl,alignItems:'center',justifyContent:'center',backgroundColor:C.accent},sendText:{...label,color:C.onAccent,fontWeight:'600'},footnote:{...caption,textAlign:'center',color:C.muted},error:{...label,color:C.danger},saved:{...caption,color:C.muted,paddingBottom:8,textAlign:'center'},
  progressRow:{flexDirection:'row',gap:8,alignItems:'center'},quoteTotal:{borderTopWidth:1,borderTopColor:C.line,paddingTop:16,gap:8},
  metrics:{flexDirection:'row',gap:8,marginVertical:8},metric:{flex:1,borderRadius:R.md,padding:12,backgroundColor:C.surfaceAlt,gap:4},metricNumber:{...title,color:C.ink,fontWeight:'600'},metricLabel:{...caption,color:C.muted},eventGroup:{gap:8,marginTop:8},event:{borderTopWidth:1,borderTopColor:C.line,paddingTop:12,gap:4},eventTitle:{...body,color:C.ink,fontWeight:'500'},urgentEvent:{borderTopColor:C.warningLine,backgroundColor:C.warningSoft,padding:12,borderRadius:R.md},flowProgress:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},flowLabel:{...caption,color:C.muted,flex:1},
});
