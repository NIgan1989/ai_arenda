import {t} from './i18n';
// Memos of the fraud check, step 2 (2026-11-26). The owner checks a transfer where the money comes: in the bank of the
// details they gave (today only Kaspi details can be given, lib/payout.ts), so the memo names that bank and is not tied
// to Kaspi when other banks come.
type Details={phone?:string;link?:string}|null|undefined;
export const bankOf=(p:Details)=>p&&(p.phone||/^https:\/\/(pay\.)?kaspi\.kz\//.test(String(p.link||'')))?'Kaspi':'';
export const receiptMemo=(p:Details)=>bankOf(p)?t('Чек или скриншот перевода не доказывает оплату: их легко подделать. Подтверждайте, только когда деньги пришли в {bank}.',{bank:bankOf(p)}):t('Чек или скриншот перевода не доказывает оплату: их легко подделать. Подтверждайте, только когда деньги пришли в приложение вашего банка.');
export const guestMemo=()=>t('Сервис никогда не просит код из SMS и не принимает деньги за жильё. Платите только владельцу и только по реквизитам из этой карточки.');
