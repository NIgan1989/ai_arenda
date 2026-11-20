// All translations: the Russian line → [Kazakh, English]. One file per part of the app, joined here.
// How to write them: docs/memory/i18n.md (neutral words, «жильё/объект» not «квартира», short buttons).
import {COMMON} from './i18n-common';

export type Words=Record<string,readonly [kk:string,en:string]>;
export const WORDS:Words={...COMMON};
