// src/lib/server.js
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

import { CONFIG, assertRequiredEnv } from "./config.js";
import { db, Users, Raids, Characters, Signups, Presets } from "./db.js";
import { fetchFromRaiderIO } from "./raiderio.js";
import { maybeAddWarcraftLogsInfo } from "./wcl.js";

import {
  createRaidChannel,
  publishRoster,
  updateRaidMessage,
  postRaidAnnouncement,
  ensureMemberRaidleadFlag,
  hasElevatedRaidPermissions,
  renameRaidChannel,
  deleteGuildChannel,
  postRosterText,
  buildChannelName,
  postRosterTemplateWithPresets,
} from "./bot.js";

import {
  listRaidleadsFromGuild,
  listRaidleadsFromDb,
  listAllRoles,
  debugCurrentRaidleadRole,
} from "./raidleads.js";

import { buildAutoTitle } from "./format.js";
import { rebuildScheduleBoards } from "./schedule.js";

// Router
import createPresetRoutes from "./presets.routes.js";      // /api/presets
import usersRouter from "./routes/users.routes.js";        // /api/users ...
import createCycleRoutes from "./cycle.routes.js";         // /api/raids/:id/cycle-assignments (bestehend)

/* ---------------------------------------------------------
   Lazy Scheduler
--------------------------------------------------------- */
let _scheduler = null;
async function ensureSchedulerLoaded() {
  if (_scheduler) return _scheduler;
  try { _scheduler = await import("./scheduler.js"); }
  catch (e) { console.warn("⚠️ scheduler.js:", e?.message || e); _scheduler = null; }
  return _scheduler;
}

/* ---------------------------------------------------------
   Helpers / Konstanten
--------------------------------------------------------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(process.cwd(), "client");
const distRoot = path.join(clientRoot, "dist");

const LOOT_ALLOWED = new Set(["saved", "unsaved", "vip", "community"]);
const BLOCKING_LOOT = new Set(["unsaved", "vip"]);
const MIN_GAP_MINUTES = 90;

const pad = (n) => String(n).padStart(2, "0");
const fmtDateTime = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
};
function parseDbDate(s){ if(!s) return null; const d=new Date(String(s).replace(" ","T")); return isNaN(d)?null:d; }
function startOfCycle(dateLike){ const d=new Date(dateLike); const day=d.getDay(); const start=new Date(d); start.setHours(0,0,0,0); const diff=(day-3+7)%7; start.setDate(start.getDate()-diff); return start; }
function endOfCycle(dateLike){ const s=startOfCycle(dateLike); const e=new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); return e; }
function withinCurrentOrNextCycle(dt){ const now=new Date(); const curS=startOfCycle(now), curE=endOfCycle(now); const nextS=new Date(curS); nextS.setDate(nextS.getDate()+7); const nextE=new Date(curE); nextE.setDate(nextE.getDate()+7); return (dt>=curS&&dt<=curE)||(dt>=nextS&&dt<=nextE); }

async function isElevated(userId){ return !!(await hasElevatedRaidPermissions(userId)); }
function attachLead(r){ if(!r) return null; const u=Users.get(r.created_by); return { ...r, lead_user: u? { id:u.discord_id, username:u.username } : null }; }
async function assertCanManageRaid(reqUserId, raid){
  if (!raid) throw Object.assign(new Error("not_found"), { status:404 });
  const elevated = await isElevated(reqUserId);
  if (elevated) return true;
  if (String(raid.created_by) === String(reqUserId)) return true;
  throw Object.assign(new Error("forbidden_not_owner"), { status: 403 });
}

/** Prüft Zeitfenster-Konflikt ±windowMinutes zu targetDt für userId. */
function hasTimeWindowConflict({ targetRaidId, targetDt, userId, windowMinutes = MIN_GAP_MINUTES }) {
  if (!userId || !targetDt) return false;
  const start = new Date(targetDt.getTime() - Number(windowMinutes) * 60000);
  const end   = new Date(targetDt.getTime() + Number(windowMinutes) * 60000);
  const startStr = fmtDateTime(start);
  const endStr   = fmtDateTime(end);

  const rows = db.prepare(`
    SELECT r.id, r.datetime
    FROM signups s
    JOIN raids r ON r.id = s.raid_id
    WHERE s.user_id = ?
      AND s.picked = 1
      AND r.id != ?
      AND r.datetime BETWEEN ? AND ?
    ORDER BY r.datetime ASC
  `).all(userId, targetRaidId, startStr, endStr);

  return rows && rows.length > 0;
}

/* ---------------------------------------------------------
   Server
--------------------------------------------------------- */
export async function startServer() {
  try { assertRequiredEnv(); } catch (e) { console.error("ENV-Fehler:", e.message); }

  const app = express();
  const isProd = process.env.NODE_ENV === "production";

  app.set("trust proxy", true);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({
    secret: CONFIG.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: "lax" },
  }));

  /* -------- Auth / Passport -------- */
  passport.use(new DiscordStrategy({
      clientID: CONFIG.discordClientId,
      clientSecret: CONFIG.discordClientSecret,
      callbackURL: `${CONFIG.baseUrl}/auth/callback`,
      scope: ["identify","guilds"],
    },
    async (_a,_r,profile,done)=>{
      try {
        Users.upsert({
          discord_id: profile.id,
          username: profile.username,
          avatar: profile.avatar,
          is_raidlead: 0,
        });
        return done(null, { id: profile.id, username: profile.username });
      } catch (e) { return done(e); }
    }
  ));
  passport.serializeUser((u,done)=>done(null,u));
  passport.deserializeUser((o,done)=>done(null,o));
  app.use(passport.initialize());
  app.use(passport.session());

  const computeRedirect=(req)=> {
    const proto=(req.headers["x-forwarded-proto"]||req.protocol||"http").split(",")[0].trim();
    const host=req.headers["x-forwarded-host"]||req.get("host");
    return `${proto}://${host}/auth/callback`;
  };

  app.get("/login",(req,res,next)=> passport.authenticate("discord",{ callbackURL: computeRedirect(req) })(req,res,next));
  app.get("/auth/callback",
    (req,res,next)=> passport.authenticate("discord",{ failureRedirect:"/", callbackURL: computeRedirect(req) })(req,res,next),
    (_req,res)=>res.redirect("/")
  );
  app.get("/logout",(req,res)=>{ req.logout(()=>{}); res.redirect("/"); });

  // Auth-Middlewares
  function ensureAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    res.status(401).json({ ok:false, error:"unauthorized" });
  }
  async function requireElevated(req,res,next){
    if(!req.isAuthenticated || !req.isAuthenticated()) return res.status(401).json({ ok:false, error:"unauthorized" });
    const elevated=await isElevated(req.user.id);
    return elevated? next() : res.status(403).json({ ok:false, error:"elevated_required" });
  }

  /* -------- Router mounten -------- */

  // Presets: /api/presets
  app.use(createPresetRoutes({ db, ensureAuth }));

  // Users/Chars: /api/...
  app.use("/api", usersRouter);

  // Cycle-Assignments (bestehende Datei / richtige Route)
  app.use(createCycleRoutes({ ensureAuth }));

  /* -------- Static / Assets -------- */
  app.use("/assets", express.static(path.join(__dirname, "../client/assets")));

  /* -------- WhoAmI -------- */
  app.get("/api/whoami", async (req,res)=>{
    let u=null, elevated=false;
    if (req.isAuthenticated && req.isAuthenticated()) {
      try { await ensureMemberRaidleadFlag(req.user.id); } catch {}
      u=Users.get(req.user.id);
      elevated=await isElevated(req.user.id);
    }
    res.json({ ok:true, user: u? { id:u.discord_id, username:u.username, is_raidlead:!!u.is_raidlead, is_elevated:!!elevated } : null });
  });

  /* -------- Admin: Raidlead-Infos -------- */
  app.get("/api/admin/raidleads", ensureAuth, requireElevated, async (_req,res)=>{
    try {
      const g = await listRaidleadsFromGuild({ debug:false });
      res.json({ ok:true, data: g.length? g : listRaidleadsFromDb() });
    } catch(e){ res.json({ ok:true, data: listRaidleadsFromDb() }); }
  });
  app.get("/api/admin/debug/roles", ensureAuth, requireElevated, async (_req,res)=>{
    try { res.json({ ok:true, data: await listAllRoles() }); }
    catch(e){ res.status(500).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.get("/api/admin/debug/raidlead-role", ensureAuth, requireElevated, async (_req,res)=>{
    try { res.json({ ok:true, data: await debugCurrentRaidleadRole() }); }
    catch(e){ res.status(500).json({ ok:false, error:e?.message||String(e) }); }
  });

  /* -------- Characters (Self) -------- */
  app.get("/api/me/chars", ensureAuth, (req,res)=> {
    try { res.json({ ok:true, data: Characters.listByUser(req.user.id) }); }
    catch(e){ res.status(500).json({ ok:false, error:e?.message||String(e) }); }
  });
  app.post("/api/me/chars/import", ensureAuth, async (req,res)=>{
    try {
      let { name, realm, region } = req.body;
      name=(name||"").trim(); realm=(realm||"").trim().toLowerCase().replace(/\s+/g,"-"); region=(region||"eu").trim().toLowerCase();
      if(!name||!realm||!region) throw new Error("Bitte Name, Realm, Region");
      let basics=await fetchFromRaiderIO(region,realm,name);
      basics=await maybeAddWarcraftLogsInfo({ ...basics, name, realm, region });
      Characters.create({ user_id:req.user.id, name, realm, region, class:basics.class, spec:basics.spec, ilvl:basics.ilvl, rio_score:basics.rio_score, wcl_rank: basics.wcl_rank||null, wcl_url: basics.wcl_url||null, imported_from:"raider.io" });
      res.json({ ok:true });
    } catch(e){ res.status(400).json({ ok:false, error:e.message }); }
  });
  app.post("/api/me/chars/:id/delete", ensureAuth, (req,res)=>{
    try { Characters.delete(req.params.id); res.json({ ok:true }); }
    catch(e){ res.status(500).json({ ok:false, error:e?.message||String(e) }); }
  });

  /* -------- Meine geplanten Raids -------- */
  app.get("/api/me/raids", ensureAuth, (req,res)=>{
    const rows = db.prepare(`
      SELECT r.*, s.role, s.slot,
             c.name AS char_name, c.class AS char_class, c.spec AS char_spec, c.wcl_url AS char_wcl_url
      FROM signups s
      JOIN raids r ON r.id = s.raid_id
      LEFT JOIN characters c ON c.id = s.character_id
      WHERE s.user_id=? AND s.picked=1
      ORDER BY r.datetime ASC
    `).all(req.user.id);
    res.json({ ok:true, data: rows });
  });

  /* -------- Raids (CRUD + Signups) -------- */
  app.get("/api/raids", ensureAuth, (_req,res)=> res.json({ ok:true, data: Raids.list().map(attachLead) }));
  app.get("/api/raids/:id", ensureAuth, (req,res)=> res.json({ ok:true, data: attachLead(Raids.get(req.params.id)) }));

  // ⬇︎ SIGNUPS – erweitert um picked_in_other
  app.get("/api/raids/:id/signups", ensureAuth, (req,res)=> {
    try {
      const raidId = Number(req.params.id);
      const raid    = Raids.get(raidId);
      if (!raid) return res.status(404).json({ ok:false, error:"not_found" });

      const dt = parseDbDate(raid.datetime) || new Date();
      const sC = fmtDateTime(startOfCycle(dt));
      const eC = fmtDateTime(endOfCycle(dt));

      const rows = db.prepare(`
        SELECT s.*, 
               c.name  AS char_name, 
               c.class AS char_class, 
               c.spec  AS char_spec, 
               c.wcl_url AS char_wcl_url,
               -- Flag: derselbe Charakter ist in einem anderen Raid bereits picked (im gleichen Cycle bei unsaved/vip ODER im 90-Minuten-Fenster)
               EXISTS(
                 SELECT 1 FROM signups s2 
                 JOIN raids r2 ON r2.id = s2.raid_id
                 WHERE s2.character_id = s.character_id
                   AND s2.picked = 1
                   AND s2.raid_id != s.raid_id
                   AND (
                        -- Cycle-Block für unsaved/vip gleicher Difficulty
                        (r2.difficulty = r.difficulty AND r2.loot_type IN ('unsaved','vip') 
                         AND r2.datetime BETWEEN ? AND ?) 
                        OR
                        -- Zeitfenster-Konflikt ±90min
                        (r2.datetime BETWEEN ? AND ?)
                   )
               ) AS picked_in_other,
               (
                 SELECT r2.id FROM signups s2 
                 JOIN raids r2 ON r2.id = s2.raid_id
                 WHERE s2.character_id = s.character_id
                   AND s2.picked = 1
                   AND s2.raid_id != s.raid_id
                 ORDER BY r2.datetime DESC LIMIT 1
               ) AS picked_other_raid_id,
               (
                 SELECT r2.datetime FROM signups s2 
                 JOIN raids r2 ON r2.id = s2.raid_id
                 WHERE s2.character_id = s.character_id
                   AND s2.picked = 1
                   AND s2.raid_id != s.raid_id
                 ORDER BY r2.datetime DESC LIMIT 1
               ) AS picked_other_dt
        FROM signups s
        JOIN raids r ON r.id = s.raid_id
        LEFT JOIN characters c ON c.id = s.character_id
        WHERE s.raid_id = ?
        ORDER BY s.role ASC, s.slot ASC, s.id ASC
      `).all(
        sC, eC,
        fmtDateTime(new Date((dt.getTime() - MIN_GAP_MINUTES*60000))),
        fmtDateTime(new Date((dt.getTime() + MIN_GAP_MINUTES*60000))),
        raidId
      );

      res.json({ ok:true, data: rows });
    } catch(e){
      res.status(500).json({ ok:false, error:e?.message||String(e) });
    }
  });

  // Konfliktprüfung – robuster & kompatibel
  app.post("/api/raids/:id/conflicts", ensureAuth, async (req, res) => {
    try {
      const id = req.params.id;
      const raid = Raids.get(id);
      if (!raid) return res.status(404).json({ ok: false, error: "not_found" });

      // Einzeluser optional
      const qUser = req.query?.user_id ? [String(req.query.user_id)] : null;
      const { user_ids, window_minutes = MIN_GAP_MINUTES } = req.body || {};
      const setIds = qUser || user_ids || [];
      const unique = Array.from(new Set(setIds.map(String)));
      const dt = parseDbDate(raid.datetime) || new Date();
      const start = new Date(dt.getTime() - Number(window_minutes) * 60000);
      const end   = new Date(dt.getTime() + Number(window_minutes) * 60000);
      const startStr = fmtDateTime(start);
      const endStr   = fmtDateTime(end);

      const stmt = db.prepare(`
        SELECT r.id, r.title, r.datetime, r.difficulty, r.loot_type, s.role
        FROM signups s
        JOIN raids r ON r.id = s.raid_id
        WHERE s.user_id = ?
          AND s.picked = 1
          AND r.id != ?
          AND r.datetime BETWEEN ? AND ?
        ORDER BY r.datetime ASC
      `);

      const outMap = {};
      const outArr = [];
      for (const uid of unique) {
        const rows = stmt.all(uid, id, startStr, endStr);
        outMap[uid] = rows;
        outArr.push({ user_id: uid, conflicts: rows });
      }

      res.json({ ok: true, data: outMap, map: outMap, array: outArr, window_minutes: Number(window_minutes) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Create raid (Preset-Snapshot optional)
  app.post("/api/raids", ensureAuth, async (req,res)=>{
    try {
      const { datetime, difficulty, loot_type, description, created_by, run_type, title, preset_id } = req.body||{};
      if(!datetime||!difficulty||!loot_type) throw new Error("Pflichtfelder fehlen.");
      if(!LOOT_ALLOWED.has(String(loot_type))) throw new Error("Ungültiger loot_type.");

      const dt=parseDbDate(datetime); if(!dt) throw new Error("Ungültiges Datum.");
      if(!withinCurrentOrNextCycle(dt)) throw new Error("Raids nur im aktuellen oder nächsten Cycle erlaubt.");
      if(String(difficulty).toLowerCase()==="mythic" && String(loot_type)==="saved") throw new Error("In Mythic sind saved-runs nicht erlaubt.");

      const elevated = await isElevated(req.user.id);
      const self = Users.get(req.user.id);
      if (!elevated && !self?.is_raidlead) return res.status(403).json({ ok:false, error:"raidlead_required" });

      let ownerId = req.user.id;
      if (created_by && created_by !== req.user.id) {
        if (!elevated) return res.status(403).json({ ok:false, error:"forbidden_not_elevated" });
        const target = Users.get(created_by);
        if (!target?.is_raidlead) return res.status(400).json({ ok:false, error:"target_not_raidlead" });
        ownerId = created_by;
      }

      const autoTitle = title && title.trim() ? title.trim() : buildAutoTitle({ datetime, difficulty, loot_type });
      const raid = Raids.create({ title: autoTitle, datetime, difficulty, run_type: run_type||"Raid", loot_type, description: description||"", created_by: ownerId });

      // optional Preset-Snapshot übernehmen
      if (preset_id) {
        const p = Presets.get(preset_id);
        if (p) {
          Raids.update({
            id: raid.id,
            preset_id: p.id,
            cap_tanks: p.tanks,
            cap_healers: p.healers ?? p.heals,
            cap_dps: p.dps,
            cap_lootbuddies: p.lootbuddies ?? p.loot,
          });
        }
      }

      try {
        const chId = await createRaidChannel(raid);
        if (chId) {
          const updated = Raids.update({ ...raid, channel_id: chId });
          await postRaidAnnouncement(updated.id);
        }
      } catch(e){ console.warn("⚠️ createRaidChannel/postRaidAnnouncement:", e?.message||e); }

      try { rebuildScheduleBoards().catch(()=>{}); } catch {}

      res.json({ ok:true, data: attachLead(Raids.get(raid.id)) });
    } catch(e){ res.status(400).json({ ok:false, error:e.message }); }
  });

  // Update raid
  app.put("/api/raids/:id", ensureAuth, async (req,res)=>{
    try {
      const id=req.params.id;
      const exist=Raids.get(id);
      await assertCanManageRaid(req.user.id, exist);

      const { datetime, difficulty, loot_type, description, created_by } = req.body||{};
      if(!datetime||!difficulty||!loot_type) throw new Error("Pflichtfelder fehlen.");
      if(!LOOT_ALLOWED.has(String(loot_type))) throw new Error("Ungültiger loot_type.");
      const dt=parseDbDate(datetime); if(!dt) throw new Error("Ungültiges Datum.");
      if(!withinCurrentOrNextCycle(dt)) throw new Error("Nur aktueller oder nächster Cycle.");
      if(String(difficulty).toLowerCase()==="mythic" && String(loot_type)==="saved") throw new Error("In Mythic sind saved-runs nicht erlaubt.");

      let ownerId = exist.created_by;
      if (created_by && created_by !== exist.created_by) {
        const elevated = await isElevated(req.user.id);
        if (!elevated) return res.status(403).json({ ok:false, error:"forbidden_not_elevated" });
        const target = Users.get(created_by);
        if (!target?.is_raidlead) return res.status(400).json({ ok:false, error:"target_not_raidlead" });
        ownerId = created_by;
      }

      const title=buildAutoTitle({ datetime, difficulty, loot_type });
      const updated = Raids.update({ ...exist, title, datetime, difficulty, loot_type, description: description||"", created_by: ownerId });

      try { await updateRaidMessage(id); } catch(e){ console.warn("⚠️ updateRaidMessage:", e?.message||e); }
      try { await renameRaidChannel(id); } catch(e){ console.warn("⚠️ renameRaidChannel:", e?.message||e); }

      try { rebuildScheduleBoards().catch(()=>{}); } catch {}

      res.json({ ok:true, data: attachLead(updated) });
    } catch(e){
      res.status(e?.status||400).json({ ok:false, error:e?.message||String(e) });
    }
  });

  // Toggle picked – Logik unverändert, nur robuste Returns
  app.post("/api/signups/:id/toggle-picked", ensureAuth, async (req,res)=>{
    const sId=req.params.id; const { picked } = req.body||{};
    const s=Signups.getById(sId); if(!s) return res.status(404).json({ ok:false, error:"signup_not_found" });

    const targetRaid=Raids.get(s.raid_id); if(!targetRaid) return res.status(404).json({ ok:false, error:"raid_not_found" });

    try { await assertCanManageRaid(req.user.id, targetRaid); } 
    catch(e){ return res.status(e?.status||403).json({ ok:false, error: e?.message || "forbidden" }); }

    if(String(targetRaid.difficulty).toLowerCase()==="mythic" && String(targetRaid.loot_type)==="saved")
      return res.status(400).json({ ok:false, error:"mythic_no_saved" });

    try {
      if (picked) {
        const tdt = parseDbDate(targetRaid.datetime) || new Date();
        if (hasTimeWindowConflict({ targetRaidId: s.raid_id, targetDt: tdt, userId: s.user_id, windowMinutes: MIN_GAP_MINUTES })) {
          return res.status(409).json({ ok:false, error:"time_window_conflict", minutes: MIN_GAP_MINUTES });
        }

        const loot=String(targetRaid.loot_type||"").toLowerCase();
        if (BLOCKING_LOOT.has(loot)) {
          const dt = tdt;
          const sC = fmtDateTime(startOfCycle(dt)), eC = fmtDateTime(endOfCycle(dt));
          const diff = String(targetRaid.difficulty);
          const conflict = db.prepare(`
            SELECT s.id AS signup_id, s.raid_id FROM signups s
            JOIN raids r ON r.id = s.raid_id
            WHERE s.character_id=? AND s.picked=1 AND r.difficulty=? AND r.loot_type IN ('unsaved','vip')
              AND r.datetime BETWEEN ? AND ?
          `).get(s.character_id, diff, sC, eC);
          if (conflict && conflict.raid_id !== s.raid_id) {
            return res.status(409).json({ ok:false, error:"already_picked_this_cycle" });
          }
        }

        Signups.setExclusivePick(s.raid_id, s.user_id, s.id);

        if (["unsaved","vip"].includes(String(targetRaid.loot_type))) {
          const dt = tdt;
          const sC = fmtDateTime(startOfCycle(dt)), eC = fmtDateTime(endOfCycle(dt));
          const diff = String(targetRaid.difficulty);
          const affected = db.prepare(`
            SELECT DISTINCT s.raid_id FROM signups s
            JOIN raids r ON r.id = s.raid_id
            WHERE s.character_id=? AND s.raid_id != ? AND r.difficulty=? AND r.loot_type IN ('unsaved','vip')
              AND r.datetime BETWEEN ? AND ?
          `).all(s.character_id, s.raid_id, diff, sC, eC).map(r=>r.raid_id);

          db.prepare(`
            DELETE FROM signups WHERE character_id=? AND raid_id != ? AND raid_id IN (
              SELECT id FROM raids WHERE difficulty=? AND loot_type IN ('unsaved','vip') AND datetime BETWEEN ? AND ?
            )
          `).run(s.character_id, s.raid_id, diff, sC, eC);

          for (const rid of affected) { try { await updateRaidMessage(rid); } catch{} }
        }
      } else {
        Signups.setPicked(s.id, 0);
      }

      try { await updateRaidMessage(s.raid_id); } catch {}
      res.json({ ok:true });
    } catch(e){ res.status(400).json({ ok:false, error:e?.message||"pick_failed" }); }
  });

  // Pick/Unpick kompatible Endpoints
  app.post("/api/raids/:id/pick", ensureAuth, async (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const signupId = Number(req.body?.signup_id ?? req.body?.signupId ?? req.body?.id);
      if (!raidId || !signupId) return res.status(400).json({ ok:false, error:"missing_params" });

      const s = Signups.getById(signupId);
      if (!s || Number(s.raid_id) !== raidId) return res.status(404).json({ ok:false, error:"signup_not_found" });

      const raid = Raids.get(raidId);
      await assertCanManageRaid(req.user.id, raid);

      const tdt = parseDbDate(raid.datetime) || new Date();
      if (hasTimeWindowConflict({ targetRaidId: raidId, targetDt: tdt, userId: s.user_id, windowMinutes: MIN_GAP_MINUTES })) {
        return res.status(409).json({ ok:false, error:"time_window_conflict", minutes: MIN_GAP_MINUTES });
      }

      Signups.setExclusivePick(s.raid_id, s.user_id, s.id);
      try { await updateRaidMessage(s.raid_id); } catch {}

      return res.json({ ok:true });
    } catch (e) {
      console.error("pick route error:", e);
      res.status(500).json({ ok:false, error:"internal_error" });
    }
  });

  app.post("/api/raids/:id/unpick", ensureAuth, async (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const signupId = Number(req.body?.signup_id ?? req.body?.signupId ?? req.body?.id);
      if (!raidId || !signupId) return res.status(400).json({ ok:false, error:"missing_params" });

      const s = Signups.getById(signupId);
      if (!s || Number(s.raid_id) !== raidId) return res.status(404).json({ ok:false, error:"signup_not_found" });

      const raid = Raids.get(raidId);
      await assertCanManageRaid(req.user.id, raid);

      Signups.setPicked(s.id, 0);
      try { await updateRaidMessage(s.raid_id); } catch {}

      return res.json({ ok:true });
    } catch (e) {
      console.error("unpick route error:", e);
      res.status(500).json({ ok:false, error:"internal_error" });
    }
  });

  // Raid löschen – stabilisiert
  app.delete("/api/raids/:id", ensureAuth, async (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const raid = Raids.get(raidId);
      if (!raid) {
        // Bereits entfernt? Dann idempotent OK zurückgeben
        return res.json({ ok: true, id: raidId, note: "already_missing" });
      }
      await assertCanManageRaid(req.user.id, raid);

      try {
        if (raid?.channel_id) await deleteGuildChannel(raid.channel_id);
      } catch (e) {
        console.warn("deleteGuildChannel:", e?.message||e);
      }

      try { db.prepare(`DELETE FROM signups WHERE raid_id=?`).run(raidId); } catch(e){ console.warn("delete signups:", e?.message||e); }
      try { db.prepare(`DELETE FROM raids WHERE id=?`).run(raidId); } catch(e){ console.warn("delete raid:", e?.message||e); }

      try { rebuildScheduleBoards().catch(()=>{}); } catch {}

      return res.json({ ok: true, id: raidId });
    } catch (e) {
      const status = e?.status || 500;
      return res.status(status).json({ ok: false, error: e?.message || "delete_failed" });
    }
  });

  /* -------- Roster posten -------- */
  app.post("/api/raids/:id/publish", ensureAuth, async (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const raid = Raids.get(raidId);
      await assertCanManageRaid(req.user.id, raid);

      const msg = await publishRoster(raidId);
      res.json({ ok:true, message_id: msg?.id || null });
    } catch (e) {
      console.error("publish roster:", e);
      res.status(500).json({ ok:false, error:"publish_failed" });
    }
  });

  app.post("/api/raids/:id/publish-template", ensureAuth, async (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const raid = Raids.get(raidId);
      await assertCanManageRaid(req.user.id, raid);

      const msg = await postRosterTemplateWithPresets(raidId);
      res.json({ ok:true, message_id: msg?.id || null });
    } catch (e) {
      console.error("publish roster template:", e);
      res.status(500).json({ ok:false, error:"publish_template_failed" });
    }
  });

  app.post("/api/raids/:id/post-roster", ensureAuth, async (req, res) => {
    try {
      const raidId = Number(req.params.id);
      if (!raidId) return res.status(400).json({ ok:false, error:"invalid raid id" });

      const r = await postRosterTemplateWithPresets(raidId);
      if (!r?.ok) console.warn("postRosterTemplateWithPresets:", r?.error);

      try { await updateRaidMessage(raidId); } catch (e) { console.warn("updateRaidMessage after template:", e?.message||e); }

      res.json({ ok:true, posted: !!r?.ok, messageId: r?.messageId, channelId: r?.channelId });
    } catch(e) {
      res.status(500).json({ ok:false, error: e?.message || "failed to post roster" });
    }
  });

  /* -------- Static/Vite -------- */
  if (isProd) {
    app.use(express.static(distRoot));
    app.get("*", async (_req,res)=>{
      try { const html=await fs.readFile(path.join(distRoot,"index.html"),"utf8");
        res.setHeader("Content-Type","text/html; charset=utf-8").send(html); }
      catch { res.status(500).send('Build fehlt. Bitte "npm run build" und danach "npm start".'); }
    });
  } else {
    let viteServer=null;
    try {
      const vite=await import("vite");
      viteServer=await vite.createServer({ root:clientRoot, server:{ middlewareMode:true }, appType:"custom" });
      app.use(viteServer.middlewares);
      app.use("*", async (req,res,next)=>{
        if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/auth")) return next();
        try {
          let html=await fs.readFile(path.join(clientRoot,"index.html"),"utf8");
          html=await viteServer.transformIndexHtml(req.originalUrl, html);
          res.status(200).setHeader("Content-Type","text/html; charset=utf-8").end(html);
        } catch(e){ next(e); }
      });
      console.log("✅ Bot + API + React (Vite) auf einem Port aktiv.");
    } catch(e){
      console.warn("⚠️ Vite nicht installiert – Fallback:", e?.message||e);
      app.use(express.static(clientRoot));
      app.get("*", async (_req,res)=>{
        try { const html=await fs.readFile(path.join(clientRoot,"index.html"),"utf8");
          res.setHeader("Content-Type","text/html; charset=utf-8").send(html); }
        catch { res.status(500).send('Vite fehlt. Bitte "npm install" oder "npm run dev".'); }
      });
    }
  }

  app.listen(CONFIG.port, ()=> console.log(`🌐 Server läuft auf Port ${CONFIG.port} (${process.env.NODE_ENV||"dev"})`));
  const mod=await ensureSchedulerLoaded(); if (mod?.startCharacterSync) mod.startCharacterSync(); if (mod?.startPickRelease) mod.startPickRelease?.();
}

// Autostart
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startServer().catch((e)=> {
    console.error("Server start failed:", e);
    process.exit(1);
  });
}
