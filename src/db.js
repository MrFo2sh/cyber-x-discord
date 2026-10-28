import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    username   TEXT NOT NULL,
    display    TEXT NOT NULL,
    is_bot     INTEGER NOT NULL DEFAULT 0,
    joined_at  TEXT,
    synced_at  TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS awards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    reason      TEXT,
    awarded_by  TEXT NOT NULL,
    message_url TEXT,
    month       TEXT NOT NULL,          -- YYYY-MM, used for monthly counting
    created_at  TEXT NOT NULL           -- ISO timestamp
  );
  CREATE INDEX IF NOT EXISTS idx_awards_guild_month ON awards (guild_id, month);
  CREATE INDEX IF NOT EXISTS idx_awards_guild_created ON awards (guild_id, created_at);

  CREATE TABLE IF NOT EXISTS announcements (
    guild_id     TEXT NOT NULL,
    kind         TEXT NOT NULL,         -- 'weekly'
    period_key   TEXT NOT NULL,         -- e.g. 2026-W43
    announced_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, kind, period_key)
  );
`);

/** Returns the YYYY-MM key for a date in the configured timezone. */
export function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  return `${y}-${m}`;
}

const upsertUser = db.prepare(`
  INSERT INTO users (guild_id, user_id, username, display, is_bot, joined_at, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (guild_id, user_id) DO UPDATE SET
    username = excluded.username,
    display  = excluded.display,
    is_bot   = excluded.is_bot,
    joined_at = COALESCE(excluded.joined_at, users.joined_at),
    synced_at = excluded.synced_at
`);

export function saveMember(member) {
  upsertUser.run(
    member.guild.id,
    member.id,
    member.user.username,
    member.displayName ?? member.user.globalName ?? member.user.username,
    member.user.bot ? 1 : 0,
    member.joinedAt ? member.joinedAt.toISOString() : null,
    new Date().toISOString(),
  );
}

export function saveMembers(members) {
  db.exec('BEGIN');
  try {
    for (const m of members) saveMember(m);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function countUsers(guildId) {
  return db.prepare('SELECT COUNT(*) AS n FROM users WHERE guild_id = ?').get(guildId).n;
}

const insertAward = db.prepare(`
  INSERT INTO awards (guild_id, user_id, amount, reason, awarded_by, message_url, month, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function addPoints({ guildId, userId, amount, reason, awardedBy, messageUrl }) {
  const now = new Date();
  insertAward.run(guildId, userId, amount, reason ?? null, awardedBy, messageUrl ?? null, monthKey(now), now.toISOString());
  return monthTotal(guildId, userId);
}

export function monthTotal(guildId, userId, month = monthKey()) {
  return db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM awards WHERE guild_id = ? AND user_id = ? AND month = ?',
  ).get(guildId, userId, month).total;
}

export function monthLeaderboard(guildId, month = monthKey(), limit = 10) {
  return db.prepare(`
    SELECT a.user_id, SUM(a.amount) AS total, COUNT(*) AS awards,
           COALESCE(u.display, u.username) AS display
    FROM awards a
    LEFT JOIN users u ON u.guild_id = a.guild_id AND u.user_id = a.user_id
    WHERE a.guild_id = ? AND a.month = ?
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC, MIN(a.created_at) ASC
    LIMIT ?
  `).all(guildId, month, limit);
}

export function rangeLeaderboard(guildId, sinceIso, untilIso, limit = 10) {
  return db.prepare(`
    SELECT a.user_id, SUM(a.amount) AS total, COUNT(*) AS awards,
           COALESCE(u.display, u.username) AS display
    FROM awards a
    LEFT JOIN users u ON u.guild_id = a.guild_id AND u.user_id = a.user_id
    WHERE a.guild_id = ? AND a.created_at >= ? AND a.created_at < ?
    GROUP BY a.user_id
    HAVING total > 0
    ORDER BY total DESC, MIN(a.created_at) ASC
    LIMIT ?
  `).all(guildId, sinceIso, untilIso, limit);
}

export function userRank(guildId, userId, month = monthKey()) {
  const rows = db.prepare(`
    SELECT user_id, SUM(amount) AS total FROM awards
    WHERE guild_id = ? AND month = ?
    GROUP BY user_id HAVING total > 0
    ORDER BY total DESC, MIN(created_at) ASC
  `).all(guildId, month);
  const idx = rows.findIndex((r) => r.user_id === userId);
  return { rank: idx === -1 ? null : idx + 1, total: idx === -1 ? 0 : rows[idx].total, of: rows.length };
}

export function recentAwards(guildId, userId, limit = 10) {
  return db.prepare(`
    SELECT amount, reason, awarded_by, message_url, created_at FROM awards
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(guildId, userId, limit);
}

export function wasAnnounced(guildId, kind, periodKey) {
  return !!db.prepare(
    'SELECT 1 FROM announcements WHERE guild_id = ? AND kind = ? AND period_key = ?',
  ).get(guildId, kind, periodKey);
}

export function markAnnounced(guildId, kind, periodKey) {
  db.prepare(
    'INSERT OR REPLACE INTO announcements (guild_id, kind, period_key, announced_at) VALUES (?, ?, ?, ?)',
  ).run(guildId, kind, periodKey, new Date().toISOString());
}

export default db;
