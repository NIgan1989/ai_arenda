export function avatarInitials(name:string){const parts=name.trim().split(/\s+/).filter(Boolean);return parts.length?(Array.from(parts[0])[0]+(parts.length>1?Array.from(parts.at(-1)!)[0]:'')).toLocaleUpperCase('ru-RU'):'?';}
export function avatarCrop(width:number,height:number,zoom:number,x:number,y:number){
 if(![width,height,zoom,x,y].every(Number.isFinite)||width<=0||height<=0)throw Error('Повреждён размер фото.');
 const size=Math.min(width,height)/Math.min(3,Math.max(1,zoom)),left=(width-size)/2,top=(height-size)/2;
 return {x:left+Math.min(1,Math.max(-1,x/100))*left,y:top+Math.min(1,Math.max(-1,y/100))*top,size};
}
