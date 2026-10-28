import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('clientReady', async (c) => {
  for (const guild of c.guilds.cache.values()) {
    const wanted = (process.env.MVP_CHANNEL_NAME || 'MVPs').toLowerCase();
    const ch = guild.channels.cache.find((x) => x.type === ChannelType.GuildText && x.name.toLowerCase() === wanted);
    if (!ch) {
      console.log(`${guild.name}: NO channel named ${wanted}. Text channels: ${guild.channels.cache.filter((x) => x.type === ChannelType.GuildText).map((x) => x.name).join(', ')}`);
    } else {
      const perms = ch.permissionsFor(guild.members.me);
      const need = { SendMessages: PermissionFlagsBits.SendMessages, EmbedLinks: PermissionFlagsBits.EmbedLinks, ViewChannel: PermissionFlagsBits.ViewChannel };
      const missing = Object.entries(need).filter(([, bit]) => !perms?.has(bit)).map(([n]) => n);
      console.log(`${guild.name}: found #${ch.name} (${ch.id}). Missing perms: ${missing.length ? missing.join(', ') : 'none'}`);
    }
  }
  client.destroy();
});
client.login(process.env.DISCORD_TOKEN);
