// «Показы»: the phone tells the server which cards the guest had on screen, so an owner can see on the object's
// card how often guests were shown it. Each place is told once for one answer of the search, in small batches,
// and nothing about the guest is sent: only the ids (lib/property-views.ts). Covered by mobile/tests/guest-views.test.mjs.

export type ViewLog = { key: string; told: Set<string>; queue: string[] };
export const viewLog = (): ViewLog => ({ key: '', told: new Set(), queue: [] });

/** Puts the cards now on screen in the queue, each once for this answer; a new answer starts the count again. */
export function noteViews(log: ViewLog, answer: string, ids: string[]) {
  if (log.key !== answer) {
    log.key = answer;
    log.told = new Set();
  }
  for (const id of ids)
    if (id && !log.told.has(id)) {
      log.told.add(id);
      log.queue.push(id);
    }
  return log.queue.length;
}

/** Takes what is waiting to be sent. */
export function takeViews(log: ViewLog) {
  return log.queue.splice(0);
}
