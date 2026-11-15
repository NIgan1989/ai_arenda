# The state from the report: the owner's cleaning closed with «Убрали сами» yesterday (completed, nobody assigned).
import glob, sqlite3, sys, time
db = [p for p in glob.glob('outputs/browser-qa/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite') if not p.endswith('metadata.sqlite')][0]
c = sqlite3.connect(db)
c.execute('DELETE FROM auth_attempt_limits')
if '--clear-limits' not in sys.argv:
    start = int(time.time()) - 20 * 3600
    c.execute("UPDATE cleaning_jobs SET status='completed', assigned_to=NULL, start=?, end=?, completed_at=?, report='Убрано без исполнителя, закрыто владельцем.' WHERE owner_id='qa-owner'", (start, start + 5400, start + 5400))
    print(c.execute("SELECT id, status, assigned_to FROM cleaning_jobs WHERE owner_id='qa-owner'").fetchall())
c.commit()
