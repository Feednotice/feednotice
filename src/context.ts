import type { Config } from './config.ts';
import type { Db } from './db.ts';
import type { Mailer } from './mail/mailer.ts';
import type { VerifyDeps } from './publishers.ts';

/** What every operation needs; `now` is injectable for tests. */
export interface Ctx {
  config: Config;
  db: Db;
  mailer: Mailer;
  now: () => number;
  log: (message: string) => void;
  /** How publisher domain proofs are looked up; tests replace it. */
  publisherVerify?: VerifyDeps;
}
