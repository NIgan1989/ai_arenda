export function Brand({subtitle='Жильё и заботы под контролем'}:{subtitle?:string}){
 return <a href="/" className="brand" aria-label="AI Аренда — главная"><img src="/brand-mark.png" width={48} height={48} alt=""/><span>AI Аренда<small>{subtitle}</small></span></a>;
}
