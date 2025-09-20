# Boosting Bot – React + Express + Discord.js

**Features**
- Admin Page (React) mit Raidlead-Gate (Discord-Rolle)
- Raids: erstellen, bearbeiten, löschen
- Beim Erstellen: Channel-Autocreate (`tag-uhrzeit-schwierigkeit-runtype`)
- Direktes Embed im Signup-Channel inkl. Buttons (Main/Alt anmelden, Abmelden)
- Booster: Charaktere anlegen (Auto-Import via Raider.IO)
- Admin: Anmeldungen sehen, **picken**, **Roster** in den Raid-Channel posten

## Entwicklung (Dev)
```bash
npm install
cp .env.example .env
# .env füllen (GUILD_ID, SIGNUP_CHANNEL_ID, CHANNEL_CATEGORY_ID, Discord OAuth/Bot)
npm run setup
npm run dev
```
- React Dev: http://localhost:5173
- API + Bot: http://localhost:3000 (OAuth Callback: `http://localhost:3000/auth/callback`)

## Produktion
```bash
npm run build         # React build
npm start             # startet Bot + API und dient das React build aus
```
- Prod UI: http://localhost:3000

> Im Discord Dev Portal: **Server Members Intent** aktivieren, Redirect URL setzen, Bot einladen.
