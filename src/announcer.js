import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from './config.js';
import { monthKey, monthLeaderboard, rangeLeaderboard, wasAnnounced, markAnnounced } from './db.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function findMvpChannel(guild) {
  const wanted = config.mvpChannelName.toLowerCase();
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase() === wanted,
  ) ?? null;
}

function formatRows(rows) {
  if (!rows.length) return '_No points awarded yet._';
  return rows
    .map((r, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${r.user_id}> — **${r.total}** pts (${r.awards} award${r.awards === 1 ? '' : 's'})`)
    .join('\n');
}

/** ISO week key like 2026-W43, used to avoid double announcements. */
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function buildWeeklyEmbed(guild) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekly = rangeLeaderboard(guild.id, weekAgo.toISOString(), now.toISOString(), config.topN);
  const month = monthKey(now);
  const monthly = monthLeaderboard(guild.id, month, config.topN);

  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: config.timezone }).format(now);

  return new EmbedBuilder()
    .setTitle('🏆 Weekly MVPs')
    .setColor(0xf1c40f)
    .setDescription(weekly.length ? `Congrats to this week's top helpers!` : 'Quiet week — no points awarded.')
    .addFields(
      { name: '📅 This week', value: formatRows(weekly) },
      { name: `📊 ${monthName} standings`, value: formatRows(monthly) },
    )
    .setFooter({ text: `Points reset every month • ${guild.name}` })
    .setTimestamp(now);
}

export async function announceWeekly(guild, { force = false } = {}) {
  const key = weekKey();
  if (!force && wasAnnounced(guild.id, 'weekly', key)) return { skipped: 'already-announced' };

  const channel = findMvpChannel(guild);
  if (!channel) return { skipped: 'no-channel' };

  const me = guild.members.me;
  if (me && !channel.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return { skipped: 'no-permission' };
  }

  await channel.send({ embeds: [buildWeeklyEmbed(guild)] });
  markAnnounced(guild.id, 'weekly', key);
  return { ok: true, channel };
}

export async function announceAll(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const r = await announceWeekly(guild);
      if (r.ok) console.log(`[weekly] announced in ${guild.name} #${r.channel.name}`);
      else console.log(`[weekly] skipped ${guild.name}: ${r.skipped}`);
    } catch (err) {
      console.error(`[weekly] failed for ${guild.name}:`, err);
    }
  }
}
