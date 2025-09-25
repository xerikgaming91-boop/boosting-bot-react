// src/discord/send.js
import { ChannelType } from "discord.js";

export default function createDiscordSender(client) {
  return {
    /**
     * sendEmbedToChannel(channelId, { content?, embed? })
     */
    async sendEmbedToChannel(channelId, payload) {
      const ch = await client.channels.fetch(channelId);
      if (!ch || ch.type !== ChannelType.GuildText) {
        throw new Error("Target channel not found or not a text channel");
      }
      const message = await ch.send({
        content: payload.content || undefined,
        embeds: payload.embed ? [payload.embed] : undefined,
        allowedMentions: { parse: ["users", "roles"] },
      });
      return message;
    },
  };
}
