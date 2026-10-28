import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandData } from './commands.js';

const rest = new REST().setToken(config.token);

const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

const result = await rest.put(route, { body: commandData });
const where = config.guildId ? `to guild ${config.guildId}` : 'globally (can take up to an hour to show up)';
console.log(`Registered ${result.length} commands ${where}.`);
