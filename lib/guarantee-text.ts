// «Гарантия заселения» (concept 2026-11-27): what the guest at the door can say happened, shared by the server
// (the report the owner and the administrator read) and the app (the choice on the sheet).
export const GUARANTEE_WAIT=600;
export const GUARANTEE_REASONS=/* i18n */{no_answer:'Не открывают, владелец молчит',key:'Ключ или код не подходит',not_as_photo:'Жильё не как на фото',other:'Другое'} as const;
export type GuaranteeReason=keyof typeof GUARANTEE_REASONS;
export const guaranteeReason=(v:unknown):GuaranteeReason=>Object.hasOwn(GUARANTEE_REASONS,String(v))?String(v) as GuaranteeReason:'other';
