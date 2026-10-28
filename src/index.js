import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import cron from 'node-cron';
import { config } from './config.js';
import { saveMember, saveMembers, countUsers, addPoints } from './db.js';
import { isAdmin } from './permissions.js';
import { handleInteraction } from './commands.js';
import { announceAll } from './announcer.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: enable "Server Members Intent" in the dev portal
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: enable "Message Content Intent" for the "+N" reply shortcut
  ],
  partials: [Partials.Message, Partials.Channel],
});

async function syncGuild(guild) {
  try {
    const members = await guild.members.fetch();
    saveMembers(members.values());
    console.log(`[sync] ${guild.name}: ${countUsers(guild.id)} members stored`);
  } catch (err) {
    console.error(`[sync] failed for ${guild.name}:`, err.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag} — ${c.guilds.cache.size} guild(s)`);
  for (const guild of c.guilds.cache.values()) await syncGuild(guild);

  if (!cron.validate(config.weeklyCron)) {
    console.error(`Invalid WEEKLY_CRON "${config.weeklyCron}" — weekly announcements disabled`);
    return;
  }
  cron.schedule(config.weeklyCron, () => announceAll(client), { timezone: config.timezone });
  console.log(`[weekly] scheduled "${config.weeklyCron}" (${config.timezone}) -> #${config.mvpChannelName}`);
});

client.on(Events.GuildCreate, syncGuild);
client.on(Events.GuildMemberAdd, (m) => saveMember(m));
client.on(Events.GuildMemberUpdate, (_old, m) => saveMember(m));

// Reply shortcut: an admin replies to an answer with "+3" or "+3 great explanation"
// (or "-2 reason") and the author of the replied-to message gets the points.
const SHORTCUT = /^([+-])\s?(\d{1,4})(?:\s+([\s\S]{1,200}))?$/;
client.on(Events.MessageCreate, async (message) => {
  if (!message.inGuild() || message.author.bot) return;
  if (!message.reference?.messageId) return;
  const m = SHORTCUT.exec(message.content.trim());
  if (!m) return;
  if (!isAdmin(message.member)) return;

  const amount = Number(m[2]) * (m[1] === '-' ? -1 : 1);
  if (amount === 0 || Math.abs(amount) > 1000) return;

  let target;
  try {
    target = await message.fetchReference();
  } catch {
    return;
  }
  if (target.author.bot) return;

  const total = addPoints({
    guildId: message.guildId,
    userId: target.author.id,
    amount,
    reason: m[3]?.trim() ?? null,
    awardedBy: message.author.id,
    messageUrl: target.url,
  });
  const sign = amount > 0 ? '+' : '';
  const unit = Math.abs(amount) === 1 ? 'point' : 'points';
  await message.reply({
    content: `${amount > 0 ? '🎉' : '📉'} <@${target.author.id}> ${sign}${amount} ${unit} • now **${total}** this month`,
    allowedMentions: { users: [target.author.id], repliedUser: false },
  });
  await message.react('✅').catch(() => {});
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    console.error('[interaction] error:', err);
    if (!interaction.isRepliable()) return;
    const payload = { content: 'Something went wrong handling that command.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

// Network hiccups surface as error events; log them and let discord.js reconnect instead of crashing.
client.on(Events.Error, (err) => console.error('[client error]', err.message));
client.on(Events.ShardError, (err, shardId) => console.error(`[shard ${shardId} error]`, err.message));
client.on(Events.ShardDisconnect, (event, shardId) => console.warn(`[shard ${shardId}] disconnected (${event.code}), reconnecting...`));
client.on(Events.ShardReconnecting, (shardId) => console.log(`[shard ${shardId}] reconnecting`));
client.on(Events.ShardResume, (shardId) => console.log(`[shard ${shardId}] resumed`));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

client.login(config.token);
