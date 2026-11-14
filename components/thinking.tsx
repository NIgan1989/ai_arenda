// The one «the service is thinking» sign of the site: the crown of the yurt from the logo, drawn faintly, and a light
// in the AI colours that runs round its ring. The large size has the gold rays turning around it.
// Used wherever something waits for an answer — a button that was pressed, a line of status text, the AI's reply,
// the long-action pill. `tone="plain"` takes the colour of the text around it (white on a filled button);
// `lead` keeps a word's distance before text where the container sets no gap of its own.
// It is drawn by the stylesheet alone (app/loader.css); the app has the same sign in mobile/src/Thinking.tsx.
export function Thinking({size='md',tone='ai',lead,label,className}:{size?:'sm'|'md'|'lg';tone?:'ai'|'plain';lead?:boolean;label?:string;className?:string}){
  return <span className={'thinking-sign'+(className?' '+className:'')} data-size={size} data-tone={tone} data-lead={lead?'':undefined} role={label?'status':undefined} aria-label={label} aria-hidden={label?undefined:true}><i/></span>;
}
