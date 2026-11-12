// iOS Safari ignores user-scalable=no, and Android shows a "save image / open link" menu on a long press.
// This small inline script stops both on touch screens before React loads. The map is left alone:
// it zooms with its own touch handling, which Safari's gesture events do not take part in.
const script=`(function(){if(!window.matchMedia||!matchMedia('(hover:none) and (pointer:coarse)').matches)return;
var stop=function(e){e.preventDefault();};
['gesturestart','gesturechange','gestureend'].forEach(function(t){document.addEventListener(t,stop,{passive:false});});
var typing='input,textarea,select,[contenteditable],.discussion-log article p,.administrator-bubble p,.chat-message .message-content>p,.recovery-code,.selectable';
document.addEventListener('contextmenu',function(e){var t=e.target;if(t&&t.closest&&t.closest(typing))return;e.preventDefault();});
document.addEventListener('dragstart',function(e){var t=e.target;if(t&&t.closest&&t.closest('[draggable="true"]'))return;e.preventDefault();});
})();`;

export function NativeFeel(){return <script dangerouslySetInnerHTML={{__html:script}}/>;}
