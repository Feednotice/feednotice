// Local copies of the database, every night, kept in data/backups. The backup container
// (docker/backup) sends the latest one off the server, encrypted, and tests a restore weekly;
// it reports in status files that the operator's daily report reads.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Ctx } from './context.ts';
import { slotStart } from './delivery.ts';
import { DAY, HOUR } from './ratelimit.ts';
import { getState, setState } from './stats.ts';

/** Consistent copy (VACUUM INTO) while the service keeps running; keeps the last `keep` copies. */
export function backup(ctx: Ctx, keep: number): string {
  const dir = join(dirname(ctx.config.dbPath), 'backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `feednotice-${new Date(ctx.now()).toISOString().replace(/[:.]/g, '-')}.sqlite`);
  ctx.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = readdirSync(dir).filter((f) => /^feednotice-.*\.sqlite$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old));
  return file;
}

/** Once a day at BACKUP_HOUR (if BACKUP_KEEP > 0). */
export function nightlyBackup(ctx: Ctx): string | null {
  const { config, db } = ctx;
  if (config.backupKeep <= 0 || config.dbPath === ':memory:') return null;
  const slot = slotStart(ctx.now(), config.timeZone, config.backupHour, null);
  if (Number(getState(db, 'backup.local') ?? 0) >= slot) return null;
  setState(db, 'backup.local', String(ctx.now()));
  return backup(ctx, config.backupKeep);
}

export interface OffsiteStatus {
  at: number;
  ok: boolean;
  detail: string;
}

function readStatus(dir: string, name: string): OffsiteStatus | null {
  const file = join(dir, `${name}.json`);
  if (!dir || !existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { at: string; ok: boolean; detail: string };
    return { at: Date.parse(raw.at), ok: raw.ok === true, detail: String(raw.detail ?? '') };
  } catch {
    return { at: 0, ok: false, detail: 'unreadable status file' };
  }
}

/** What the backup container last reported; null when it is not set up. */
export function offsiteStatus(ctx: Ctx): { backup: OffsiteStatus | null; restore: OffsiteStatus | null } | null {
  const dir = ctx.config.backupStatusDir;
  const backupStatus = readStatus(dir, 'backup');
  const restore = readStatus(dir, 'restore');
  return backupStatus || restore ? { backup: backupStatus, restore } : null;
}

/** Problems worth an alert: no successful off-site backup for 36 hours, or a failed restore test. */
export function backupProblems(ctx: Ctx): string[] {
  const s = offsiteStatus(ctx);
  if (!s) return [];
  const now = ctx.now();
  const out: string[] = [];
  if (!s.backup || !s.backup.ok) out.push(`off-site backup failed${s.backup ? `: ${s.backup.detail}` : ': never ran'}`);
  else if (now - s.backup.at > 36 * HOUR) out.push(`no off-site backup for ${Math.round((now - s.backup.at) / HOUR)} hours`);
  if (s.restore && !s.restore.ok) out.push(`restore test failed: ${s.restore.detail}`);
  else if (s.restore && now - s.restore.at > 8 * DAY) out.push(`no restore test for ${Math.round((now - s.restore.at) / DAY)} days`);
  return out;
}
