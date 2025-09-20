// src/lib/config.js
import dotenv from "dotenv";
dotenv.config();

const toBool = (v) => v === "1" || v === "true" || v === true;

export const CONFIG = {
  // Web
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET || "change-me",

  // Discord / Guild
  guildId: process.env.GUILD_ID || null,
  channelCategoryId: process.env.CHANNEL_CATEGORY_ID || null,
  channelCategoryName: process.env.CHANNEL_CATEGORY_NAME || null,

  // Discord OAuth / Bot
  discordClientId: process.env.DISCORD_CLIENT_ID || "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",
  discordToken: process.env.DISCORD_TOKEN || "",

  // Dev-Flags
  devAllowSelfRaidlead: toBool(process.env.DEV_ALLOW_SELF_RAIDLEAD || "0"),
};

export function assertRequiredEnv() {
  const missing = [];
  if (!CONFIG.discordClientId) missing.push("DISCORD_CLIENT_ID");
  if (!CONFIG.discordClientSecret) missing.push("DISCORD_CLIENT_SECRET");
  if (!CONFIG.discordToken) missing.push("DISCORD_TOKEN");
  if (!CONFIG.guildId) missing.push("GUILD_ID");
  if (!CONFIG.sessionSecret) missing.push("SESSION_SECRET");
  if (missing.length) {
    throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(", ")}`);
  }
}
