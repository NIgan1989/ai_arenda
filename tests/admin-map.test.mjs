import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {hexOf,shortageCells,shortageText,cleaningStep,sortProblems,dayStart,minutesText,adminLiveMap,SHORTAGE_MIN}=await load('admin-map');
const {readPlatformAdmin}=await load('platform-admin');

test('a hexagon holds the points near its centre and closes its outline', () => {
  const a = hexOf([76.95, 52.28], 52.28), b = hexOf([a.center[0] + 0.002, a.center[1] + 0.001], 52.28), far = hexOf([76.99, 52.31], 52.28);
  assert.deepEqual(hexOf(a.center, 52.28).key, a.key);
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, far.key);
  assert.equal(a.polygon.length, 7);
  assert.deepEqual(a.polygon[0], a.polygon[6]);
});

test('соты show only places where several searches ended without a stay, busiest first', () => {
  const centre = [76.95, 52.28], river = [76.99, 52.31], lone = [76.90, 52.25];
  const searches = [
    ...Array.from({length: 5}, () => ({point: centre, place: 'Центр'})),
    ...Array.from({length: SHORTAGE_MIN}, () => ({point: river, place: 'Набережная'})),
    {point: lone, place: 'Усолка'},
    {point: [NaN, 1]}
  ];
  const cells = shortageCells(searches, [centre, centre, [70, 40]]);
  assert.deepEqual(cells.map(c => [c.place, c.unmet, c.supply, c.weight]), [['Центр', 5, 2, 1], ['Набережная', 2, 0, 0.4]]);
  assert.match(shortageText(cells, 14), /^В районе «Центр» за 14 дней 5 поисков закончились без жилья, а объектов там 2\./);
  assert.match(shortageText(cells.slice(1), 14), /объектов там нет/);
  assert.equal(shortageText([], 14), 'За 14 дней гости находили жильё везде, где искали.');
  assert.deepEqual(shortageCells([], []), []);
});

test('the pulse names the latest step of a cleaning', () => {
  assert.deepEqual(cleaningStep({status: 'open', created_at: 100}), {at: 100, ai: 'ищем исполнителя'});
  assert.deepEqual(cleaningStep({status: 'assigned', created_at: 100}), {at: 100, ai: 'исполнитель назначен'});
  assert.deepEqual(cleaningStep({status: 'in_progress', created_at: 100, started_at: 200}), {at: 200, ai: 'уборка началась'});
  assert.deepEqual(cleaningStep({status: 'completed', created_at: 100, started_at: 200, submitted_at: 300, completed_at: 400}), {at: 400, ai: 'уборка принята, оплата исполнителю'});
});

test('problems go by urgency and then by the nearest deadline; the day starts at midnight in Kazakhstan', () => {
  const list = [
    {id: 'a', tone: 'normal', since: 1}, {id: 'b', tone: 'resolved', since: 0}, {id: 'c', tone: 'urgent', since: 5, deadline: 50},
    {id: 'd', tone: 'urgent', since: 9, deadline: 20}, {id: 'e', tone: 'high', since: 3}
  ];
  assert.deepEqual(sortProblems(list).map(p => p.id), ['d', 'c', 'e', 'a', 'b']);
  assert.equal(dayStart(Date.UTC(2026, 10, 13, 20) / 1000), Date.UTC(2026, 10, 13, 19) / 1000);
  assert.equal(dayStart(Date.UTC(2026, 10, 13, 18) / 1000), Date.UTC(2026, 10, 12, 19) / 1000);
  assert.equal(minutesText(90), '2 мин');
  assert.equal(minutesText(3600 * 2 + 600), '2 ч 10 мин');
});

test('the admin map tells the pulse, the problems and the shortage without anyone\'s own position', async () => {
  const f = await fixture();
  try {
    const t = now(), raw = f.db.raw;
    raw.prepare("INSERT INTO property_locations(property_id,longitude,latitude,source,address_fingerprint,updated_at) VALUES (?,?,?,?,?,?)").run(f.property, 76.95321, 52.28777, 'owner', 'Павлодар|Центр|PRIVATE ADDRESS', t);
    raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property);
    // Three searches near the same spot that found nothing, and one that did.
    for (const [i, status] of ['empty', 'expired', 'empty', 'ready'].entries())
      raw.prepare('INSERT INTO matching_requests(id,guest_id,request_key,filters,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').run('r' + i, 'guest', 'k' + i, JSON.stringify({city: 'Павлодар', district: 'Центр', near: {longitude: 76.97, latitude: 52.3, radius: 2000}}), status, t - 600 - i, t + 600);
    raw.prepare("INSERT INTO administrator_issues(id,owner_id,property_id,entity_kind,entity_id,opened_by,opened_role,other_user,other_role,description,created_at) VALUES ('i1','owner',?,'booking',?,'guest','guest','owner','owner','Не могу попасть, код от двери не подходит',?)").run(f.property, f.booking, t - 300);
    raw.prepare("INSERT INTO operator_tickets(issue_id,status,priority,deadline,created_at,updated_at) VALUES ('i1','open','urgent',?,?,?)").run(t + 1500, t - 300, t - 300);
    raw.prepare("UPDATE cleaning_jobs SET status='assigned',assigned_to='cleaner',start=?,end=? WHERE id=?").run(t - 7200, t - 1200, f.job.id);

    const map = await adminLiveMap(f.db, t);
    assert.equal(map.pulse.events.filter(e => e.kind === 'ask').length, 4);
    assert.ok(map.pulse.events.some(e => e.kind === 'booking' && e.ai === 'подтверждена' && e.place === 'Центр'));
    const issue = map.pulse.events.find(e => e.kind === 'issue');
    assert.equal(issue.ai, 'доступ в жильё, срочно');
    // Flats are shown at the public 1 km cell, never at the owner's exact point.
    assert.deepEqual(issue.point, [76.955, 52.285]);

    assert.deepEqual(map.problems.map(p => [p.kind, p.tone]), [['issue', 'urgent'], ['overdue', 'high']]);
    assert.match(map.problems[0].text, /^доступ в жильё · пишет гость · ответ в течение 25 мин$/);
    assert.equal(map.problems[1].text, 'Уборка просрочена на 20 мин');

    assert.equal(map.shortage.cells.length, 1);
    assert.equal(map.shortage.cells[0].unmet, 3);
    assert.equal(map.shortage.cells[0].place, 'Центр');

    // Solved: the ring turns green with the time it took.
    raw.prepare("UPDATE administrator_issues SET status='resolved',resolved_at=? WHERE id='i1'").run(t - 60);
    const after = await adminLiveMap(f.db, t);
    assert.deepEqual(after.problems.map(p => [p.kind, p.tone, p.text]), [['overdue', 'high', 'Уборка просрочена на 20 мин'], ['issue', 'resolved', 'Решено за 4 мин']]);
    assert.equal(after.pulse.today.resolved, 1);
    assert.equal(after.pulse.today.withoutAdmin, 1);

    // A cleaning nobody took stays a problem after its end, as the most urgent kind.
    raw.prepare("UPDATE cleaning_jobs SET status='open',assigned_to=NULL WHERE id=?").run(f.job.id);
    const late = (await adminLiveMap(f.db, t)).problems.find(p => p.kind === 'unassigned');
    assert.deepEqual([late.tone, late.text], ['urgent', 'Нет исполнителя, срок уборки прошёл 20 мин назад']);
    // Busy day: the counters count the whole day, the feed keeps the latest; an old urgent issue is not pushed out by newer ones.
    raw.prepare("INSERT INTO administrator_issues(id,owner_id,property_id,entity_kind,entity_id,opened_by,opened_role,other_user,other_role,description,created_at) VALUES ('old','owner',?,'booking',?,'guest','guest','owner','owner','Нет ключей, не могу войти',?)").run(f.property, f.booking, t - 200);
    raw.prepare("INSERT INTO operator_tickets(issue_id,status,priority,deadline,created_at,updated_at) VALUES ('old','open','urgent',?,?,?)").run(t - 100, t - 200, t - 200);
    for (let i = 0; i < 70; i++) {
      raw.prepare('INSERT INTO matching_requests(id,guest_id,request_key,filters,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').run('busy' + i, 'guest', 'busy' + i, '{}', 'ready', t - 10, t + 600);
      raw.prepare("INSERT INTO administrator_issues(id,owner_id,property_id,entity_kind,entity_id,opened_by,opened_role,other_user,other_role,description,created_at) VALUES (?,'owner',?,'booking',?,'guest','guest','owner','owner','Вопрос по счёту',?)").run('n' + i, f.property, f.booking, t - 5);
      raw.prepare("INSERT INTO operator_tickets(issue_id,status,priority,deadline,created_at,updated_at) VALUES (?,'open','normal',?,?,?)").run('n' + i, t + 86400, t - 5, t - 5);
    }
    const busy = await adminLiveMap(f.db, t);
    if (dayStart(t) <= t - 700) assert.ok(busy.pulse.today.asks >= 74);
    assert.equal(busy.pulse.events.length, 40);
    assert.deepEqual(busy.problems.slice(0, 2).map(p => p.tone), ['urgent', 'urgent']);
    assert.ok(busy.problems.slice(0, 2).some(p => p.id === 'issue:old'));

    // The admin route carries it all and nothing personal.
    const route = await readPlatformAdmin(f.guest, 'map', {}, {PLATFORM_ADMIN_IDS: f.guest.userId});
    assert.ok(route.pulse && route.problems && route.shortage);
    assert.doesNotMatch(JSON.stringify(route), /PRIVATE ADDRESS|owner_id|guest_id|contact|52\.28777|76\.95321|код от двери/);
  } finally { f.db.close(); }
});
