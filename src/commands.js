import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from './config.js';
import { addPoints, monthKey, monthLeaderboard, userRank, recentAwards, countUsers } from './db.js';
import { isAdmin } from './permissions.js';
import { announceWeekly, buildWeeklyEmbed, findMvpChannel } from './announcer.js';

export const commandData = [
  new SlashCommandBuilder()
    .setName('points')
    .setDescription('Monthly points system')
    .addSubcommand((s) => s
      .setName('add')
      .setDescription('Give points to a user (admins only)')
      .addUserOption((o) => o.setName('user').setDescription('Who gets the points').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('How many points (default 1)').setMinValue(1).setMaxValue(1000))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(200)))
    .addSubcommand((s) => s
      .setName('remove')
      .setDescription('Remove points from a user (admins only)')
      .addUserOption((o) => o.setName('user').setDescription('Who loses the points').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('How many points (default 1)').setMinValue(1).setMaxValue(1000))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(200)))
    .addSubcommand((s) => s
      .setName('me')
      .setDescription('Show your points this month'))
    .addSubcommand((s) => s
      .setName('user')
      .setDescription('Show the points of a user this month')
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)))
    .addSubcommand((s) => s
      .setName('history')
      .setDescription('Show the latest awards for a user')
      .addUserOption((o) => o.setName('user').setDescription('Who (default: you)'))),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top users this month')
    .addStringOption((o) => o.setName('month').setDescription('YYYY-MM (default: current month)').setMinLength(7).setMaxLength(7)),
  new SlashCommandBuilder()
    .setName('mvp')
    .setDescription('Weekly MVP announcement controls (admins only)')
    .addSubcommand((s) => s.setName('preview').setDescription('Preview the weekly MVP announcement here'))
    .addSubcommand((s) => s.setName('announce').setDescription(`Post the weekly MVP announcement in #${config.mvpChannelName} now`)),
  new ContextMenuCommandBuilder()
    .setName('Give points for this answer')
    .setType(ApplicationCommandType.Message),
].map((c) => c.toJSON());

function ephemeral(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

function plural(n, word) {
  return `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;
}

async function award(interaction, { target, amount, reason, messageUrl }) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply(ephemeral('❌ Only admins can give or remove points.'));
  }
  if (target.bot) return interaction.reply(ephemeral('🤖 Bots do not collect points.'));

  const total = addPoints({
    guildId: interaction.guildId,
    userId: target.id,
    amount,
    reason,
    awardedBy: interaction.user.id,
    messageUrl,
  });
  const sign = amount > 0 ? '+' : '';
  const emoji = amount > 0 ? '🎉' : '📉';
  const reasonText = reason ? ` — ${reason}` : '';
  const linkText = messageUrl ? ` • [answer](${messageUrl})` : '';
  return interaction.reply({
    content: `${emoji} <@${target.id}> ${sign}${plural(amount, 'point')}${reasonText} • now **${total}** this month${linkText}`,
    allowedMentions: { users: [target.id] },
  });
}

export async function handleInteraction(interaction) {
  if (!interaction.inGuild()) return;

  // Message context menu: right click an answer -> Apps -> "Give points for this answer"
  if (interaction.isMessageContextMenuCommand()) {
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral('❌ Only admins can give points.'));
    const msg = interaction.targetMessage;
    if (msg.author.bot) return interaction.reply(ephemeral('🤖 Bots do not collect points.'));

    const modal = new ModalBuilder()
      .setCustomId(`award:${msg.author.id}:${msg.id}`)
      .setTitle(`Points for ${msg.author.displayName ?? msg.author.username}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('amount').setLabel('Amount (negative to remove)').setStyle(TextInputStyle.Short)
            .setValue('1').setRequired(true).setMaxLength(5),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Short)
            .setRequired(false).setMaxLength(200),
        ),
      );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('award:')) {
    const [, userId, messageId] = interaction.customId.split(':');
    const amount = Number.parseInt(interaction.fields.getTextInputValue('amount'), 10);
    const reason = interaction.fields.getTextInputValue('reason') || null;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000) {
      return interaction.reply(ephemeral('Amount must be a whole number between -1000 and 1000 (not 0).'));
    }
    const target = await interaction.client.users.fetch(userId);
    const messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${messageId}`;
    return award(interaction, { target, amount, reason, messageUrl });
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'points') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add' || sub === 'remove') {
      const target = interaction.options.getUser('user', true);
      const n = interaction.options.getInteger('amount') ?? 1;
      const reason = interaction.options.getString('reason');
      return award(interaction, { target, amount: sub === 'add' ? n : -n, reason });
    }

    if (sub === 'me' || sub === 'user') {
      const target = sub === 'me' ? interaction.user : interaction.options.getUser('user', true);
      const { rank, total, of } = userRank(interaction.guildId, target.id);
      return interaction.reply({
        content: rank
          ? `📊 <@${target.id}> has **${plural(total, 'point')}** this month — rank **#${rank}** of ${of}.`
          : `📊 <@${target.id}> has no points yet this month.`,
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'history') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const rows = recentAwards(interaction.guildId, target.id, 10);
      if (!rows.length) return interaction.reply(ephemeral(`No awards recorded for <@${target.id}>.`));
      const lines = rows.map((r) => {
        const ts = Math.floor(new Date(r.created_at).getTime() / 1000);
        const sign = r.amount > 0 ? '+' : '';
        const reasonText = r.reason ? ` — ${r.reason}` : '';
        const linkText = r.message_url ? ` [↗](${r.message_url})` : '';
        return `<t:${ts}:d> **${sign}${r.amount}** by <@${r.awarded_by}>${reasonText}${linkText}`;
      });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`Latest awards for ${target.displayName ?? target.username}`)
          .setDescription(lines.join('\n'))
          .setColor(0x3498db)],
        allowedMentions: { parse: [] },
      });
    }
  }

  if (interaction.commandName === 'leaderboard') {
    const month = interaction.options.getString('month') ?? monthKey();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return interaction.reply(ephemeral('Month must look like 2026-10.'));
    const rows = monthLeaderboard(interaction.guildId, month, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const body = rows.length
      ? rows.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.user_id}> — **${r.total}** pts`).join('\n')
      : '_No points awarded in this month._';
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle(`🏆 Leaderboard — ${month}`)
        .setDescription(body)
        .setFooter({ text: `${countUsers(interaction.guildId)} members tracked` })
        .setColor(0xf1c40f)],
      allowedMentions: { parse: [] },
    });
  }

  if (interaction.commandName === 'mvp') {
    if (!isAdmin(interaction.member)) return interaction.reply(ephemeral('❌ Admins only.'));
    const sub = interaction.options.getSubcommand();
    if (sub === 'preview') {
      return interaction.reply({ embeds: [buildWeeklyEmbed(interaction.guild)], flags: MessageFlags.Ephemeral });
    }
    if (sub === 'announce') {
      const channel = findMvpChannel(interaction.guild);
      if (!channel) return interaction.reply(ephemeral(`No text channel named **${config.mvpChannelName}** found. Create it first.`));
      const r = await announceWeekly(interaction.guild, { force: true });
      if (r.ok) return interaction.reply(ephemeral(`✅ Posted in <#${channel.id}>.`));
      return interaction.reply(ephemeral(`Could not post: ${r.skipped}. Check my permissions in <#${channel.id}>.`));
    }
  }
}
