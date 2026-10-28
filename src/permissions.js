import { PermissionFlagsBits } from 'discord.js';
import { config } from './config.js';

/** Admins = Administrator or Manage Server permission, or the optional ADMIN_ROLE_ID. */
export function isAdmin(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (config.adminRoleId && member.roles?.cache?.has(config.adminRoleId)) return true;
  return false;
}
