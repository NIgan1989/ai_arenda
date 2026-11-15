// Asks the stand everything the app asks at sign-in once, so the dev server has compiled every route before the app's
// 15-second request limit applies.
const api = process.env.API || 'http://127.0.0.1:5174';
const call = async (path, body, token, role) => {
  const t = Date.now();
  const r = await fetch(api + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...(role ? { 'x-workspace-role': role } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); console.log(r.status, Date.now() - t + 'ms', path);
  try { return JSON.parse(text); } catch { return {}; }
};
const login = await call('/api/mobile/auth/login', { phone: '+77000000001', password: 'Browser-fixture-2026' });
const token = login.token || login.session || '';
console.log('token', !!token, Object.keys(login));
for (let i = 0; i < 2; i++) {
  await call('/api/access', undefined, token);
  await call('/api/state', undefined, token, 'owner');
  await call('/api/conversation', undefined, token, 'owner');
  await call('/api/operations/discussion/inbox', undefined, token, 'owner');
  await call('/api/operations/matching/inbox', {}, token, 'owner');
  await call('/api/operations/map/search', { filters: { city: 'Павлодар' } }, token, 'owner');
}
await call('/api/mobile/auth/logout', {}, token);
