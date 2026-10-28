function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: process.env.GUILD_ID || null,
  mvpChannelName: process.env.MVP_CHANNEL_NAME || 'MVPs',
  weeklyCron: process.env.WEEKLY_CRON || '0 18 * * 0',
  timezone: process.env.TIMEZONE || 'Africa/Cairo',
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
  topN: Number(process.env.TOP_N || 5),
  dbPath: process.env.DB_PATH || 'data/points.db',
};
