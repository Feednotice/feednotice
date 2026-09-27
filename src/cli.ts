// Entry point.
//   node src/cli.ts serve                web server + built-in scheduler (feeds, sending, purge)
//   node src/cli.ts poll                 one full round, then exit
//   node src/cli.ts purge                erasure only
//   node src/cli.ts backup [keep]        consistent copy of the database into data/backups/
//   node src/cli.ts dkim-keygen          creates the DKIM key and prints the DNS record
//   node src/cli.ts bounce < message     reads one bounce from standard input (manual use)
//
// Configuration comes from environment variables (the .env file, loaded by Docker Compose).
// Outside Docker, a .env file at the project root is read too.

import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.ts';
import type { Ctx } from './context.ts';
import { runCycle } from './cycle.ts';
import { openDb } from './db.ts';
import { parseBounce } from './mail/bounce.ts';
import { createMailer, recipientTagger } from './mail/mailer.ts';
import { purge } from './purge.ts';
import { handleMailEvent } from './subscriptions.ts';
import { createServer } from './web/server.ts';

const ROOT = join(import.meta.dirname, '..');

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'serve';
  const envFile = process.env.ENV_FILE ?? join(ROOT, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const config = loadConfig();

  if (command === 'dkim-keygen') return dkimKeygen(config.dkim.keyFile || join(dirname(config.dbPath), 'dkim', `${config.dkim.selector}.pem`), config.dkim);

  if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
  const ctx: Ctx = {
    config,
    db: openDb(config.dbPath),
    mailer: createMailer(config),
    now: Date.now,
    log: (m) => console.log(`${new Date().toISOString()} ${m}`),
  };

  switch (command) {
    case 'poll':
      await runCycle(ctx);
      purge(ctx);
      process.exit(0);
    case 'purge':
      ctx.log(`purge: ${JSON.stringify(purge(ctx))}`);
      process.exit(0);
    case 'backup':
      backup(ctx, Number(process.argv[3] ?? 14));
      process.exit(0);
    case 'bounce': {
      const chunks: Buffer[] = [];
      for await (const c of process.stdin) chunks.push(c as Buffer);
      const events = parseBounce(Buffer.concat(chunks).toString('utf8'), recipientTagger(config.secret));
      for (const ev of events) handleMailEvent(ctx, ev.email, ev.type);
      ctx.log(`bounce: ${events.length} event(s)`);
      process.exit(0);
    }
    case 'serve':
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  const server = createServer(ctx).listen(config.port, () => ctx.log(`${config.serviceName} listening on port ${config.port} (${config.baseUrl})`));
  const stop = () => {
    ctx.log('stopping');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  if (!config.runScheduler) return;

  let lastPurge = 0;
  const tick = async () => {
    try {
      await runCycle(ctx);
      if (ctx.now() - lastPurge > 3600_000) {
        purge(ctx);
        lastPurge = ctx.now();
      }
    } catch (e) {
      ctx.log(`round failed: ${(e as Error).stack}`);
    }
  };
  setInterval(tick, 60_000).unref();
  void tick();
}

/** Consistent copy (VACUUM INTO) while the service keeps running; keeps the last `keep` copies. */
function backup(ctx: Ctx, keep: number): void {
  const dir = join(dirname(ctx.config.dbPath), 'backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `feednotice-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  ctx.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = readdirSync(dir).filter((f) => /^feednotice-.*\.sqlite$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old));
  ctx.log(`backup: ${file}`);
}

/** Creates an RSA 2048 key for DKIM signing (unless it exists) and prints the DNS TXT record. */
function dkimKeygen(keyFile: string, dkim: { domain: string; selector: string }): void {
  if (existsSync(keyFile)) {
    console.log(`${keyFile} already exists: not overwritten.`);
  } else {
    mkdirSync(dirname(keyFile), { recursive: true });
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    console.log(`Private key written to ${keyFile}`);
  }
  const pub = createPublicKey(createPrivateKey(readFileSync(keyFile, 'utf8'))).export({ type: 'spki', format: 'der' }).toString('base64');
  console.log(`\nDNS record to publish:\n\n${dkim.selector}._domainkey.${dkim.domain}. IN TXT "v=DKIM1; k=rsa; p=${pub}"\n`);
  console.log(`Then set DKIM_KEY_FILE=${keyFile} in .env (DKIM_SELECTOR=${dkim.selector}, DKIM_DOMAIN=${dkim.domain}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
