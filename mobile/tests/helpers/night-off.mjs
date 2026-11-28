// «Тихие часы» (lib/night-hours.ts) depend on the time of day; these tests follow the real clock, so the rule is off
// here, as in the root tests (tests/helpers/platform.mjs), where tests/night-hours.test.mjs checks it.
import {nightRule} from '../../server/generated/night-hours.js';
nightRule.on=false;
