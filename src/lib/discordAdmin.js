import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

/**
 * Löscht einen Discord-Channel über die REST API.
 * Benötigt: Bot-Token in process.env.DISCORD_TOKEN und Rechte "Manage Channels".
 */
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

export async function deleteChannelSafe(channelId) {
  if (!channelId) return;
  try {
    await rest.delete(Routes.channel(channelId));
  } catch (e) {
    // 10003 = Unknown Channel, 50013 = Missing Permissions
    const code = e?.rawError?.code;
    if (code === 10003) return; // schon weg
    throw e;
  }
}
