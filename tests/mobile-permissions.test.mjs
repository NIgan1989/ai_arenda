import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// 2026-11-18: the microphone closed the app on a real phone. The image picker's `microphonePermission: false` removed
// the iPhone's microphone text (iOS closes an app that opens the microphone without it) and blocked RECORD_AUDIO on
// Android, which voice input (expo-speech-recognition) needs.
test('voice input keeps its microphone permission on both phones',()=>{
 const plugins=JSON.parse(readFileSync('mobile/app.json','utf8')).expo.plugins;
 for(const p of plugins)if(Array.isArray(p))assert.notEqual(p[1]?.microphonePermission,false,p[0]+' must not switch the microphone off');
 assert.ok(plugins.some(p=>Array.isArray(p)&&p[0]==='expo-speech-recognition'&&p[1].microphonePermission));
});
