// For the operator: a daily report and alerts by email (OPS_EMAIL), and the same numbers on
// the command line (`cli.ts stats`). Counts only: no subscriber address ever appears.
// Written in English, like the logs.

import type { Ctx } from './context.ts';
import { backupProblems, offsiteStatus } from './backup.ts';
import { slotStart } from './delivery.ts';
import { sendCounted } from './mail/quota.ts';
import { DAY, HOUR } from './ratelimit.ts';
import { dayOf, getState, setState, totals, type StatKey } from './stats.ts';

/** Thresholds above which the operator is alerted (the same ones flag the daily report). */
export const LIMITS = {
  /** Hard bounces per email sent: lists are clean thanks to double opt-in; above this, something is wrong. */
  bounceRate: 0.05,
  /** Gmail's published ceiling for spam complaints. */
  complaintRate: 0.003,
  /** Emails refused at submission (MTA down or misconfigured). */
  failureRate: 0.2,
  /** Below this many emails in the window, rates are not meaningful. */
  minVolume: 50,
};
const ALERT_EVERY = 6 * HOUR;

export interface Snapshot {
  subscribers: number;
  suspended: number;
  subscriptions: { immediate: number; daily: number; weekly: number; pending: number };
  feeds: { active: number; failing: number; dead: number };
  suppressions: number;
  publishers: number;
}

export function snapshot(ctx: Ctx): Snapshot {
  const { db } = ctx;
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    subscribers: one("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'active'"),
    suspended: one("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'suspended'"),
    subscriptions: {
      immediate: one("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND cadence = 'immediate'"),
      daily: one("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND cadence = 'daily'"),
      weekly: one("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND cadence = 'weekly'"),
      pending: one("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'pending'"),
    },
    feeds: {
      active: one("SELECT COUNT(*) AS n FROM feeds WHERE status = 'active' AND error_count = 0"),
      failing: one("SELECT COUNT(*) AS n FROM feeds WHERE status = 'active' AND error_count > 0"),
      dead: one("SELECT COUNT(*) AS n FROM feeds WHERE status = 'dead'"),
    },
    suppressions: one('SELECT COUNT(*) AS n FROM suppressions'),
    publishers: one('SELECT COUNT(DISTINCT publisher_id) AS n FROM publisher_domains WHERE verified_at IS NOT NULL'),
  };
}

type Totals = Partial<Record<StatKey, number>>;

export interface Problem {
  kind: 'bounces' | 'complaints' | 'failures' | 'backup';
  text: string;
}

/** What is wrong in these totals, in plain words (empty: all is well). */
export function problems(t: Totals): Problem[] {
  const sent = t['mail.sent'] ?? 0;
  const failed = t['mail.failed'] ?? 0;
  const out: Problem[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (sent >= LIMITS.minVolume) {
    const bounces = (t['bounce.hard'] ?? 0) / sent;
    if (bounces > LIMITS.bounceRate) out.push({ kind: 'bounces', text: `hard bounce rate ${pct(bounces)} (limit ${pct(LIMITS.bounceRate)}): check where the addresses come from` });
    const complaints = (t.complaint ?? 0) / sent;
    if (complaints > LIMITS.complaintRate) out.push({ kind: 'complaints', text: `spam complaint rate ${pct(complaints)} (limit ${pct(LIMITS.complaintRate)}): mailbox providers will start filtering` });
  }
  if (failed >= 10 && failed / (sent + failed) > LIMITS.failureRate) {
    out.push({ kind: 'failures', text: `${failed} emails refused at submission (${pct(failed / (sent + failed))}): is the mta container up?` });
  }
  return out;
}

function table(rows: [string, string | number][]): string {
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`).join('\n');
}

export function renderReport(ctx: Ctx, day: string, week: Totals, yesterday: Totals): { subject: string; text: string } {
  const s = snapshot(ctx);
  const n = (t: Totals, k: StatKey) => t[k] ?? 0;
  const issues = [...problems(yesterday), ...backupProblems(ctx).map((text) => ({ kind: 'backup' as const, text }))];
  const offsite = offsiteStatus(ctx);
  const when = (s: { at: number; ok: boolean; detail: string } | null) =>
    (s ? `${s.ok ? 'ok' : 'FAILED'}, ${new Date(s.at).toISOString().slice(0, 16).replace('T', ' ')} UTC (${s.detail})` : 'never');
  const counts = (t: Totals): [string, number][] => [
    ['emails sent', n(t, 'mail.sent')],
    ['  carrying updates', n(t, 'mail.updates')],
    ['refused at submission', n(t, 'mail.failed')],
    ['rounds held by the cap', n(t, 'mail.deferred')],
    ['hard bounces', n(t, 'bounce.hard')],
    ['spam complaints', n(t, 'complaint')],
    ['subscriptions requested', n(t, 'sub.requested')],
    ['  confirmed', n(t, 'sub.confirmed')],
    ['  stopped', n(t, 'sub.stopped')],
    ['feeds declared dead', n(t, 'feed.died')],
  ];
  const dead = ctx.db.prepare("SELECT title, url, dead_at FROM feeds WHERE status = 'dead' ORDER BY dead_at DESC LIMIT 10").all() as { title: string; url: string }[];
  const text = [
    `${ctx.config.serviceName} — report for ${day}`,
    '',
    issues.length ? `NEEDS ATTENTION\n${issues.map((i) => `  - ${i.text}`).join('\n')}\n` : 'All indicators are within limits.\n',
    `Yesterday (${day})`,
    table(counts(yesterday)),
    '',
    'Last 7 days',
    table(counts(week)),
    '',
    'Now',
    table([
      ['active subscribers', s.subscribers],
      ['suspended (bounced) addresses', s.suspended],
      ['subscriptions, one email per item', s.subscriptions.immediate],
      ['subscriptions, daily digest', s.subscriptions.daily],
      ['subscriptions, weekly digest', s.subscriptions.weekly],
      ['awaiting confirmation', s.subscriptions.pending],
      ['feeds read normally', s.feeds.active],
      ['feeds currently failing', s.feeds.failing],
      ['feeds dead', s.feeds.dead],
      ['addresses blocked after a complaint', s.suppressions],
      ['verified publishers', s.publishers],
      ['off-site backup', offsite ? when(offsite.backup) : 'not set up (docs/deploy.md, Backups)'],
      ...(offsite ? [['restore test', when(offsite.restore)] as [string, string]] : []),
    ]),
    ...(dead.length ? ['', 'Dead feeds (most recent first)', ...dead.map((f) => `  ${f.title || '(untitled)'} — ${f.url}`)] : []),
    '',
    `-- ${ctx.config.baseUrl}`,
  ].join('\n');
  return { subject: `[${ctx.config.serviceName}] ${issues.length ? 'Needs attention: ' : ''}report for ${day}`, text };
}

async function mailOperator(ctx: Ctx, subject: string, text: string): Promise<void> {
  await sendCounted(ctx, { to: ctx.config.opsEmail, fromName: ctx.config.serviceName, subject, text, headers: { 'Auto-Submitted': 'auto-generated' } });
}

/** Once a day at OPS_REPORT_HOUR: yesterday's numbers, the week's, and the current state. */
export async function sendOpsReport(ctx: Ctx): Promise<boolean> {
  const { config, db } = ctx;
  if (!config.opsEmail) return false;
  const now = ctx.now();
  const slot = slotStart(now, config.timeZone, config.opsReportHour, null);
  const last = Number(getState(db, 'ops.report') ?? 0);
  if (last >= slot) return false;
  // Marked first: a report that cannot be sent is not retried every minute.
  setState(db, 'ops.report', String(now));
  const day = dayOf(slot - DAY / 2, config.timeZone);
  const { subject, text } = renderReport(ctx, day, totals(db, dayOf(slot - 7 * DAY, config.timeZone), day), totals(db, day, day));
  await mailOperator(ctx, subject, text);
  return true;
}

/** Checked every round on today's numbers; each kind of alert at most every 6 hours. */
export async function checkAlerts(ctx: Ctx): Promise<string[]> {
  const { config, db } = ctx;
  const now = ctx.now();
  const today = dayOf(now, config.timeZone);
  const raised: string[] = [];
  const backupIssues = backupProblems(ctx).map((text) => ({ kind: 'backup' as const, text }));
  for (const issue of [...problems(totals(db, today, today)), ...backupIssues]) {
    const key = `ops.alert.${issue.kind}`;
    if (now - Number(getState(db, key) ?? 0) < ALERT_EVERY) continue;
    setState(db, key, String(now));
    ctx.log(`ALERT: ${issue.text}`);
    raised.push(issue.text);
  }
  if (raised.length && config.opsEmail) {
    await mailOperator(ctx, `[${config.serviceName}] Alert: ${raised[0]}`, [
      `Today (${today}) on ${config.baseUrl}:`, '', ...raised.map((r) => `  - ${r}`), '',
      'Run `docker compose exec app node src/cli.ts stats` for the numbers.',
    ].join('\n'));
  }
  return raised;
}

/** `cli.ts stats [days]`: the counters per day, then the current state. */
export function statsText(ctx: Ctx, days: number): string {
  const { config, db } = ctx;
  const now = ctx.now();
  const keys: StatKey[] = ['mail.sent', 'mail.updates', 'mail.failed', 'bounce.hard', 'complaint', 'sub.requested', 'sub.confirmed', 'sub.stopped', 'feed.died'];
  const header = ['day', ...keys.map((k) => k.replace('mail.', '').replace('sub.', ''))];
  const lines = [header];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOf(now - i * DAY, config.timeZone);
    const t = totals(db, day, day);
    lines.push([day, ...keys.map((k) => String(t[k] ?? 0))]);
  }
  const widths = header.map((_, c) => Math.max(...lines.map((l) => l[c].length)));
  const s = snapshot(ctx);
  return [
    ...lines.map((l) => l.map((v, c) => (c === 0 ? v.padEnd(widths[c]) : v.padStart(widths[c]))).join('  ')),
    '',
    JSON.stringify(s, null, 2),
  ].join('\n');
}
