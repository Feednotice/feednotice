// Nightly local copies, and what the operator's report says about the off-site backups.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { backupProblems, nightlyBackup } from '../src/backup.ts';
import { openDb } from '../src/db.ts';
import { renderReport } from '../src/ops.ts';
import { HOUR, makeCtx } from './helpers.ts';

const dir = mkdtempSync(join(tmpdir(), 'fn-backup-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('backups', () => {
  it('copies the database once a night, keeping the last copies', () => {
    const ctx = makeCtx({ dbPath: join(dir, 'feednotice.sqlite'), backupKeep: 2, backupHour: 3 });
    ctx.db = openDb(ctx.config.dbPath);
    // 1 September 2026, 12:00 in Paris: the 3:00 slot has passed.
    assert.ok(nightlyBackup(ctx));
    assert.equal(nightlyBackup(ctx), null, 'once per night');
    for (let i = 0; i < 3; i++) {
      ctx.clock.t += 24 * HOUR;
      assert.ok(nightlyBackup(ctx));
    }
    assert.equal(readdirSync(join(dir, 'backups')).length, 2);
  });

  it('reports the off-site backup and the restore test, and alerts when they fail or stop', () => {
    const status = join(dir, 'status');
    mkdirSync(status, { recursive: true });
    const ctx = makeCtx({ backupStatusDir: status });
    const iso = (ms: number) => new Date(ms).toISOString();
    assert.deepEqual(backupProblems(ctx), [], 'not set up: nothing to say');
    assert.match(renderReport(ctx, '2026-08-31', {}, {}).text, /off-site backup\s+not set up/);

    writeFileSync(join(status, 'backup.json'), JSON.stringify({ at: iso(ctx.now() - 2 * HOUR), ok: true, detail: 'feednotice-x.sqlite' }));
    writeFileSync(join(status, 'restore.json'), JSON.stringify({ at: iso(ctx.now() - 3 * HOUR), ok: true, detail: '12 subscribers' }));
    assert.deepEqual(backupProblems(ctx), []);
    assert.match(renderReport(ctx, '2026-08-31', {}, {}).text, /off-site backup\s+ok, 2026-09-01 08:00 UTC \(feednotice-x\.sqlite\)\n\s+restore test\s+ok/);

    ctx.clock.t += 40 * HOUR;
    writeFileSync(join(status, 'restore.json'), JSON.stringify({ at: iso(ctx.now()), ok: false, detail: 'integrity check failed' }));
    assert.deepEqual(backupProblems(ctx), ['no off-site backup for 42 hours', 'restore test failed: integrity check failed']);
    assert.match(renderReport(ctx, '2026-09-02', {}, {}).subject, /Needs attention/);
  });
});
