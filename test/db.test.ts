// Schema migrations: a database created by an older version is brought up to date, data kept.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { openDb, SCHEMA_VERSION } from '../src/db.ts';

describe('migrations', () => {
  it('upgrades a version 1 database without losing its rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fn-db-'));
    try {
      const file = join(dir, 'db.sqlite');
      // A version 1 database, as the first release created it.
      const v1 = openDb(file);
      v1.exec('PRAGMA user_version = 1');
      v1.exec('DROP TABLE publisher_domains; DROP TABLE publishers; DROP TABLE stats_daily; DROP TABLE state;');
      v1.exec('ALTER TABLE feeds DROP COLUMN dead_at; ALTER TABLE subscriptions DROP COLUMN dead_notice_at;');
      v1.exec('DROP INDEX entry_keys_entry; DROP INDEX deliveries_entry; DROP INDEX deliveries_updated; DROP INDEX deliveries_failed; DROP INDEX entries_seen;');
      v1.exec('ALTER TABLE feeds DROP COLUMN self_url; ALTER TABLE feeds DROP COLUMN websub_expires_at; ALTER TABLE feeds DROP COLUMN websub_requested_at;');
      v1.prepare("INSERT INTO feeds (url, title, created_at) VALUES ('https://x.example/feed', 'X', 0)").run();
      v1.close();

      const db = openDb(file);
      assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
      assert.equal((db.prepare('SELECT title, websub_expires_at FROM feeds').get() as { title: string }).title, 'X');
      db.prepare("INSERT INTO publishers (email, created_at, terms_version) VALUES ('p@x.example', 0, 1)").run();
      db.prepare("INSERT INTO stats_daily (day, key, n) VALUES ('2026-01-01', 'mail.sent', 1)").run();
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a database written by a newer version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fn-db-'));
    try {
      const file = join(dir, 'db.sqlite');
      const raw = new DatabaseSync(file);
      raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
      raw.close();
      assert.throws(() => openDb(file), /newer than this code/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
