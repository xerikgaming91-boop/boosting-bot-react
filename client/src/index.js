// src/index.js
import { startBot } from "./server/bot.js";
import { startServer } from "./server/server.js";

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

await startBot();
await startServer();
