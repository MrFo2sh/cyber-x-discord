# MVP Points Bot

Discord bot (discord.js v14 + SQLite via the built-in `node:sqlite`) that:

- stores every member of every server it is in (`users` table), synced on startup, on join and on profile update
- lets **admins** give / remove points, counted **per month** (`awards` table keyed by `YYYY-MM`)
- posts a **weekly MVP announcement** in a text channel named `MVPs` (top of the last 7 days + current month standings)

## Giving points (admins only)

Admin = `Administrator` or `Manage Server` permission, or the role set in `ADMIN_ROLE_ID`.

| How | What happens |
| --- | --- |
| Reply to an answer with `+1`, `+5 nice explanation` or `-2 wrong` | The author of the replied-to message gets the points |
| Right click a message, then **Apps > Give points for this answer** | A modal asks amount + reason, points go to the message author |
| `/points add @user [amount] [reason]` | Direct award |
| `/points remove @user [amount] [reason]` | Direct deduction |

## Everyone

- `/points me`, `/points user @user`: points and rank this month
- `/points history [@user]`: last 10 awards with who gave them and a link to the answer
- `/leaderboard [YYYY-MM]`: top 10 for the current (or a past) month

## Admin announcement controls

- `/mvp preview`: see the weekly embed privately
- `/mvp announce`: post it to `#MVPs` right now

## Setup

1. Create an application at <https://discord.com/developers/applications>, add a bot, copy the token.
2. In **Bot > Privileged Gateway Intents** enable **Server Members Intent** and **Message Content Intent**.
3. Invite the bot with scopes `bot` + `applications.commands` and permissions: View Channels, Send Messages, Embed Links, Add Reactions, Read Message History.
4. Create a text channel named `MVPs` in the server.
5. Copy `.env.example` to `.env` and fill `DISCORD_TOKEN` and `CLIENT_ID` (and `GUILD_ID` for instant command registration while testing).
6. Install and run:

```bash
npm install
npm run deploy   # registers slash + context menu commands
npm start
```

Requires Node.js 23.4+ (uses the built-in `node:sqlite`, so no native build step). The database lives in `data/points.db`.

## Config (`.env`)

| Var | Default | Meaning |
| --- | --- | --- |
| `MVP_CHANNEL_NAME` | `MVPs` | Channel the weekly announcement goes to (case-insensitive) |
| `WEEKLY_CRON` | `0 18 * * 0` | When to announce (Sunday 18:00) |
| `TIMEZONE` | `Africa/Cairo` | Timezone for the cron and for month boundaries |
| `TOP_N` | `5` | How many users to list in the announcement |
| `ADMIN_ROLE_ID` | (none) | Extra role allowed to give points |
| `DB_PATH` | `data/points.db` | SQLite file |

Monthly reset is automatic: points are grouped by month, so on the 1st everyone starts from 0 while history is kept and `/leaderboard 2026-09` still works.
