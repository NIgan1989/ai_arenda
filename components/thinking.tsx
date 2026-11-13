// The one «the service is thinking» sign of the site: three dots in the AI colours that rise in a wave.
// Used wherever something waits for an answer — a button that was pressed, a line of status text, the AI's reply,
// the long-action pill. `tone="plain"` takes the colour of the text around it (white on a filled button);
// `lead` keeps a word's distance before text where the container sets no gap of its own.
export function Thinking({size='md',tone='ai',lead,label,className}:{size?:'sm'|'md'|'lg';tone?:'ai'|'plain';lead?:boolean;label?:string;className?:string}){
  return <span className={'thinking-dots'+(className?' '+className:'')} data-size={size} data-tone={tone} data-lead={lead?'':undefined} role={label?'status':undefined} aria-label={label} aria-hidden={label?undefined:true}><i/><i/><i/></span>;
}
