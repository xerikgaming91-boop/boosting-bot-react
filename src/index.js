// src/index.js
import { startBot } from "./lib/bot.js";
import { startServer } from "./lib/server.js";

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

await startBot();
await startServer();
