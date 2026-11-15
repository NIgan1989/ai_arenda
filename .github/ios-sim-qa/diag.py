# Diagnostic lines for this simulator build only: every touch, the press of «Открыть …», openDeal and each App render.
import re
def patch(path, old, new, count=1):
    s = open(path).read()
    assert s.count(old) >= 1, (path, old)
    s = s.replace(old, new, count)
    open(path, 'w').write(s)
patch('src/loading.ts', 'export function markGesture(){', "export function markGesture(e?:any){console.log('DIAG touch',Math.round(e?.nativeEvent?.pageX),Math.round(e?.nativeEvent?.pageY));")
patch('src/AutopilotThreads.tsx', "<Pressable accessibilityRole=\"button\" onPress={() => onOpen(t.kind, t.id)} style={({ pressed }) => [a.open",
      "<Pressable accessibilityRole=\"button\" onPressIn={() => console.log('DIAG pressIn open')} onPressOut={() => console.log('DIAG pressOut open')} onPress={() => { console.log('DIAG press open', t.kind, t.id); onOpen(t.kind, t.id); }} style={({ pressed }) => [a.open")
patch('App.tsx', "const openDeal=(kind:'booking'|'job',id:string)=>{", "const openDeal=(kind:'booking'|'job',id:string)=>{console.log('DIAG openDeal',kind,id,pageId,!!flow);")
patch('App.tsx', "const dealOpen=pageId==='overview'&&!!deal&&!flow;", "const dealOpen=pageId==='overview'&&!!deal&&!flow;console.log('DIAG render',pageId,deal?.kind||'',!!flow,dealCover);")
patch('src/MapHome.tsx', "onOpenProcess={(kind,id)=>openDeal", "onOpenProcess={(kind,id)=>openDeal") if False else None
print('diag patched')
