const clientsAll = new Set();
const clientsByRaid = new Map();

function keepAlive(res) {
  const t = setInterval(() => {
    try { res.write(`event: ping\ndata: {}\n\n`); } catch {}
  }, 25000);
  res.on("close", () => clearInterval(t));
}

export function registerSSE(app) {
  app.get("/api/raids/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    clientsAll.add(res);
    keepAlive(res);
    req.on("close", () => clientsAll.delete(res));
  });

  app.get("/api/raids/:id/events", (req, res) => {
    const id = String(req.params.id);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    if (!clientsByRaid.has(id)) clientsByRaid.set(id, new Set());
    const set = clientsByRaid.get(id);
    set.add(res);
    keepAlive(res);
    req.on("close", () => set.delete(res));
  });
}

function send(set, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data||{})}\n\n`;
  for (const res of set) { try { res.write(payload); } catch {} }
}

export function emitGlobalEvent(event = "raid", data = {}) {
  send(clientsAll, event, data);
}
export function emitRaidEvent(raidId, event = "updated", data = {}) {
  const set = clientsByRaid.get(String(raidId));
  if (set && set.size) send(set, event, data);
  emitGlobalEvent("raid", { id: raidId, event });
}
