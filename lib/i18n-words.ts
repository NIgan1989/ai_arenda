// All translations: the Russian line → [Kazakh, English]. One file per part of the app, joined here.
// How to write them: docs/memory/i18n.md (neutral words, «жильё/объект» not «квартира», short buttons).
import {CHATS} from './i18n-chats';
import {COMMON} from './i18n-common';
import {DEALS} from './i18n-deals';
import {GUEST} from './i18n-guest';
import {OWNER} from './i18n-owner';

export type Words=Record<string,readonly [kk:string,en:string]>;
export const WORDS:Words={...COMMON,...GUEST,...DEALS,...CHATS,...OWNER};
