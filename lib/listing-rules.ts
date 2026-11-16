// What guests may read in a listing. The first review and every later save of a shown flat use the same rules.
export const MIN_PHOTOS=3;
const CONTACT=/(?:\+?[78])[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|https?:\/\/|www\.|t\.me\/|wa\.me|whatsapp|ватсап|вотсап|телеграм|telegram|инстаграм|instagram/i;
const DIRECT_PAY=/перевод(ом)? на карту|переведите|оплат[аиу] напрямую|предоплат|kaspi\s*(gold|перевод)|каспи\s*(голд|перевод)/i;
export function hasContacts(text:string){return CONTACT.test(text)||DIRECT_PAY.test(text);}
