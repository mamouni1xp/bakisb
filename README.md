# Mamouni 1XP Discord Bot

A Node.js Discord **selfbot** (built on `discord.js-selfbot-v13` and `@discordjs/voice`) with owner-only utility commands: Instagram lookups, pickup-line "rizz" pings, voice-channel join/leave/follow, rich presence control, and reaction tracking.

> ⚠️ **Note:** this runs on a normal user account token via `discord.js-selfbot-v13`, not the official bot API. Automating a user account this way violates Discord's Terms of Service and can get the account disabled — use at your own risk, on an account you're willing to lose.

## Features

- **Instagram profile lookup** — pulls follower/following/post counts and bio for a given username.
- **Rizz pickup lines** — sends a random pickup line to yourself or another user, either in the current channel or a specified server/channel.
- **Voice channel control** — join, leave, and auto-follow a tracked user between voice channels, with auto-reconnect on disconnect.
- **Rich Presence editor** — set application ID, activity type, name, details, state, images, and buttons live.
- **Reaction tracking** — assign a custom emoji per tracked user (`zidd`/`kherej`/`lista`).
- **Configurable prefix and mention auto-reply.**
- **Crash guards** — `unhandledRejection`/`uncaughtException` handlers keep the process alive, including a targeted workaround for a known `discord.js-selfbot-v13` bug (`ApplicationFlags is not a constructor`), and login auto-retries every 10s on failure.

## Commands

All commands (except the mention auto-reply) are restricted to the bot owner (`ownerId`).

| Command | Description |
|---|---|
| `!setprefix <prefix>` | Change the command prefix (1–5 chars, no spaces). |
| `!setreply <text>` | Change the auto-reply sent when the owner is mentioned. |
| `!reply <on\|off>` | Enable or disable the mention auto-reply. |
| `!say <channel_id> <server_id> <text>` | Send text to a specific server channel (e.g. from a DM). |
| `!insta <username>` | Look up an Instagram profile. |
| `!rizz me` | Send a random pickup line to yourself in the current channel. |
| `!r <@user\|user_id>` | Send a random pickup line to a user in the **current** channel/server. |
| `!rizz <user_id> <channel_id> <server_id>` | Send a random pickup line to a user in a specific server channel. |
| `!zidd @user <emoji>` | Track reactions for a user with a custom emoji. |
| `!kherej @user` | Stop tracking a user. |
| `!lista` | List all tracked users and their emoji. |
| `!setappid <id>` | Set the Rich Presence application ID. |
| `!settype <PLAYING\|STREAMING\|LISTENING\|WATCHING\|CUSTOM\|COMPETING>` | Set the Rich Presence activity type. |
| `!setname <text>` | Set the Rich Presence name. |
| `!setdetails <text>` | Set the Rich Presence details line. |
| `!setstate <text>` | Set the Rich Presence state line. |
| `!setlargeimage <url>` / `!largset <url>` | Set the large Rich Presence image. |
| `!setlargetext <text>` | Set the large image hover text. |
| `!setbutton <1\|2> <label> \| <url>` | Set one of the two Rich Presence buttons. |
| `!track [server_id]` | Follow the owner's current voice channel. |
| `!sf` | Stop voice tracking. |
| `!rwa7 <voice_channel_id>` | Join a voice channel in the current server. |
| `!9awed` | Leave the current voice channel. |
| `!jc <server_id> <voice_channel_id>` | Join a voice channel in a specific server. |
| `!help` | List all commands with the current prefix. |

> Replace `!` above with whatever prefix is currently set via `!setprefix`.

## Requirements

- Node.js
- `discord.js-selfbot-v13`
- `@discordjs/voice`
- `dotenv`
- Python 3 with `instaloader` installed (used as the primary Instagram lookup method, with an HTML-scrape fallback if it's unavailable)

## Project layout

- `index.js` — entry point: logs in, sets up Rich Presence, voice-follow logic, and dispatches incoming messages to `cmd.js`.
- `cmd.js` — `handleCommand(message, context)`, all command parsing/handling logic.

## Setup

1. Install dependencies:
   ```
   npm install discord.js-selfbot-v13 @discordjs/voice dotenv
   ```
2. Create a `.env` file in the project root:
   ```
   DISCORD_TOKEN=your_account_token_here
   OWNER_ID=your_discord_user_id_here
   ```
3. Run the bot:
   ```
   node index.js
   ```

The default command prefix is `!` (changeable at runtime with `!setprefix`). Default Rich Presence values (application ID, name, details, state, images, buttons) live in `presenceConfig` in `index.js` and can also be changed at runtime with the `!set...` commands.

## Notes

- State (prefix, reply text, presence config, tracked user) lives in memory in `index.js` only — nothing is persisted, so it resets on restart.
- Instagram lookups try `instaloader` first and fall back to scraping the public profile page if that fails or isn't installed.
- Voice connections auto-attempt to recover from `Disconnected` states before giving up and destroying the connection.

## License / Copyright

© 2026 mamouni1xp. All rights reserved.

This code is provided for personal/private use. No license is granted for redistribution, resale, or public re-publication without the author's permission.
