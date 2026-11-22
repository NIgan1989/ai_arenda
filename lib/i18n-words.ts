// All translations: the Russian line → [Kazakh, English]. One file per part of the app, joined here.
// How to write them: docs/memory/i18n.md (neutral words, «жильё/объект» not «квартира», short buttons).
import {CHATS} from './i18n-chats';
import {CLEANER} from './i18n-cleaner';
import {COMMON} from './i18n-common';
import {DEALS} from './i18n-deals';
import {GUEST} from './i18n-guest';
import {NOTICES} from './i18n-notices';
import {OWNER} from './i18n-owner';
import {SERVER} from './i18n-server';
import {SERVER_MORE} from './i18n-server-more';

export type Words=Record<string,readonly [kk:string,en:string]>;
// SERVER goes first: a line the app already translates keeps the app's wording.
export const WORDS:Words={...SERVER,...SERVER_MORE,...NOTICES,...COMMON,...GUEST,...DEALS,...CHATS,...OWNER,...CLEANER};
