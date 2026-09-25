const { getVoiceConnection } = require('@discordjs/voice');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
let mentionReply = 'hahowa baki jay l3endek';
let mentionReplyEnabled = true;

function readInstagramMeta(html, property) {
    const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'));
    return match?.[1]
        ?.replace(/&quot;/g, '"')
        .replace(/&#064;|&#x40;/g, '@')
        .replace(/&amp;/g, '&') || '';
}

function parseInstagramCount(value) {
    const match = value.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
    if (!match) return 0;
    return Math.round(Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1));
}

async function lookupInstagramFromPage(username) {
    const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) {
        const error = new Error(`User "${username}" not found`);
        error.statusCode = 404;
        throw error;
    }
    if (!response.ok) throw new Error(`Instagram returned HTTP ${response.status}`);

    const html = await response.text();
    const description = readInstagramMeta(html, 'og:description');
    const pageDescription = readInstagramMeta(html, 'description');
    const counts = description.match(/^([\d,.]+[KMB]?) Followers, ([\d,.]+[KMB]?) Following, ([\d,.]+[KMB]?) Posts/i);
    const title = readInstagramMeta(html, 'og:title');
    const fullName = title.match(/^(.+?)\s*\(@/i)?.[1] || username;
    const biography = pageDescription.match(/:\s*"([\s\S]*?)"\s*$/)?.[1] || 'Not provided';
    if (!counts) throw new Error('Instagram profile data was not found');

    return {
        username,
        fullName,
        followers: parseInstagramCount(counts[1]),
        following: parseInstagramCount(counts[2]),
        posts: parseInstagramCount(counts[3]),
        profile_pic_url: readInstagramMeta(html, 'og:image'),
        description: biography,
    };
}

function formatInstagramProfile(profile, username) {
    const truncate = (value, maxLength) => {
        const text = String(value || 'None');
        return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
    };

    return [
        '# 🎈 __MAMOUNI 1XP__ 🎈',
        `\`🔏\` **Username:** ${truncate(profile.username || username, 100)}`,
        `\`🔏\` **Full Name:** ${truncate(profile.fullName, 100)}`,
        `\`🔏\` **Followers:** ${profile.followers ?? 0}`,
        `\`🔏\` **Following:** ${profile.following ?? 0}`,
        `\`🔏\` **Number of Posts:** ${profile.posts ?? 0}`,
        `\`🔏\` **Bio:** ${truncate(profile.description, 500)}`,
    ].join('\n');
}

async function fetchPickupLine() {
    const response = await fetch('https://rizzapi.vercel.app/random', {
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Rizz API returned HTTP ${response.status}`);

    const data = await response.json();
    return data?.text || "Couldn't fetch a pickup line.";
}

async function lookupInstagramProfile(username) {
    try {
        const pythonScript = [
            'import instaloader, json, sys',
            'try:',
            '    profile = instaloader.Profile.from_username(instaloader.Instaloader().context, sys.argv[1])',
            '    print(json.dumps({"username": profile.username, "fullName": profile.full_name, "followers": profile.followers, "following": profile.followees, "posts": profile.mediacount, "profile_pic_url": profile.profile_pic_url, "description": profile.biography}))',
            'except instaloader.exceptions.ProfileNotExistsException:',
            '    print(json.dumps({"notFound": True}))',
            '    sys.exit(3)',
        ].join('\n');
        const { stdout } = await execFileAsync('python', ['-c', pythonScript, username], {
            timeout: 30000,
            maxBuffer: 1024 * 1024,
        });
        const profile = JSON.parse(stdout);
        if (profile.notFound) {
            const notFoundError = new Error(`User "${username}" not found`);
            notFoundError.statusCode = 404;
            throw notFoundError;
        }
        return profile;
    } catch (err) {
        if (err?.statusCode !== 404) {
            try {
                return await lookupInstagramFromPage(username);
            } catch (fallbackError) {
                err = fallbackError;
            }
        }
        const normalizedError = new Error(err?.statusCode === 404
            ? `User "${username}" not found`
            : err?.message || 'Instagram profile lookup unavailable');
        normalizedError.statusCode = err?.statusCode || (err?.code === 3 ? 404 : undefined);
        normalizedError.code = normalizedError.statusCode === 404 ? 'PROFILE_NOT_FOUND' : 'INSTAGRAM_UNAVAILABLE';
        throw normalizedError;
    }
}

async function handleCommand(message, context) {
    const {
        client,
        ownerId,
        userEmojis,
        prefix,
        setPrefix,
        updatePresence,
        safeJoinVoiceChannel,
        stopTracking,
        setTrackedVoiceUser,
        lookupInstagramUser = lookupInstagramProfile,
        lookupPickupLine = fetchPickupLine,
    } = context;

    const command = (name) => `${prefix}${name}`;
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (message.author?.id === ownerId) {
        const replyToggle = message.content.match(new RegExp(`^${escapeRegex(prefix)}reply\\s+(on|off)$`, 'i'));
        if (replyToggle) {
            mentionReplyEnabled = replyToggle[1].toLowerCase() === 'on';
            await message.channel.send(`Mention replies are now ${mentionReplyEnabled ? 'on' : 'off'}.`);
            return;
        }

        const replyCommand = message.content.match(new RegExp(`^${escapeRegex(prefix)}setreply\\s+([\\s\\S]+)$`, 'i'));
        if (replyCommand) {
            mentionReply = replyCommand[1].trim();
            await message.channel.send(`Reply changed to: ${mentionReply}`);
            return;
        }
    }

    if (mentionReplyEnabled && ownerId && new RegExp(`<@!?${ownerId}>`).test(message.content)) {
        await message.channel.send(mentionReply);
        return;
    }

    if (message.author?.id !== ownerId) return;

    const prefixCommand = message.content.match(new RegExp(`^${escapeRegex(prefix)}setprefix\\s+(.+)$`, 'i'));
    if (prefixCommand) {
        const newPrefix = prefixCommand[1].trim();
        if (newPrefix.length > 5 || /\s/.test(newPrefix)) {
            await message.channel.send('> Prefix must be 1-5 characters with no spaces.');
            return;
        }

        setPrefix(newPrefix);
        await message.channel.send(`> Prefix changed to \`${newPrefix}\``);
        return;
    }

    const sayCommand = message.content.match(new RegExp(`^${escapeRegex(prefix)}say\\s+(\\S+)\\s+(\\S+)\\s+([\\s\\S]+)$`, 'i'));
    if (sayCommand) {
        const [, channelId, guildId, text] = sayCommand;
        const guild = client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(channelId);

        if (!guild) {
            await message.channel.send(`> Server not found: ${guildId}`);
            return;
        }
        if (!channel || typeof channel.send !== 'function') {
            await message.channel.send(`> Text channel not found: ${channelId}`);
            return;
        }

        try {
            await channel.send(text.trim());
            await message.channel.send(`> Message sent to **${channel.name}** in **${guild.name}**.`);
        } catch (err) {
            console.error('> Failed to send message with !say:', err);
            await message.channel.send('> I could not send the message to that channel.');
        }
        return;
    }

    const instaCommand = message.content.match(new RegExp(`^${escapeRegex(prefix)}insta\\s+@?([a-z0-9._]+)$`, 'i'));
    if (instaCommand) {
        const username = instaCommand[1];

        try {
            if (typeof message.delete === 'function') {
                await message.delete().catch((err) => console.error('> Could not delete insta command:', err?.message || err));
            }

            const profile = await lookupInstagramUser(username);
            await message.channel.send(formatInstagramProfile(profile, username));
        } catch (err) {
            if (err?.code === 'PROFILE_NOT_FOUND' || err?.statusCode === 404 || /not found|does not exist/i.test(err?.message || '')) {
                await message.channel.send(`> Instagram profile \`${username}\` does not exist.`);
            } else {
                console.error('> Instagram lookup unavailable:', err?.message || err);
                await message.channel.send('> Instagram lookup failed. The profile may be private or Instagram may be unavailable.');
            }
        }
        return;
    }

    const rizzCommand = message.content.match(new RegExp(`^${escapeRegex(prefix)}rizz(?:\\s+(.+))?$`, 'i'));
    if (rizzCommand) {
        const args = rizzCommand[1]?.trim().split(/\s+/) || [];
        let targetUser = message.author;
        let targetChannel = message.channel;
        let targetGuild = message.guild;

        if (args.length === 1 && args[0].toLowerCase() !== 'me') {
            await message.channel.send(`> Usage: \`${prefix}rizz me\` or \`${prefix}rizz <user_id> <channel_id> <server_id>\``);
            return;
        }

        if (args.length === 3) {
            const [userId, channelId, guildId] = args;
            targetGuild = client.guilds.cache.get(guildId);
            targetChannel = targetGuild?.channels.cache.get(channelId);

            if (!targetGuild) {
                await message.channel.send(`> Server not found: ${guildId}`);
                return;
            }
            if (!targetChannel || typeof targetChannel.send !== 'function') {
                await message.channel.send(`> Text channel not found: ${channelId}`);
                return;
            }

            try {
                targetUser = await client.users.fetch(userId);
            } catch (err) {
                console.error('> Failed to find rizz target:', err?.message || err);
                await message.channel.send(`> User not found: ${userId}`);
                return;
            }
        } else if (args.length !== 1 || args[0].toLowerCase() !== 'me') {
            await message.channel.send(`> Usage: \`${prefix}rizz me\` or \`${prefix}rizz <user_id> <channel_id> <server_id>\``);
            return;
        }

        try {
            if (typeof message.delete === 'function') {
                await message.delete().catch((err) => console.error('> Could not delete rizz command:', err?.message || err));
            }

            const pickupLine = await lookupPickupLine();
            await targetChannel.send(`${targetUser} ${pickupLine}`);
        } catch (err) {
            console.error('> Rizz command failed:', err?.message || err);
            try {
                await message.channel.send('> Could not fetch or send the pickup line.');
            } catch (sendErr) {
                console.error('> Could not report rizz failure:', sendErr?.message || sendErr);
            }
        }
        return;
    }

    if (message.content === command('help')) {
        await message.channel.send([
                '# 🎂 __mamouni 1xp__ 🎂',
                `\`🎁\` **${prefix}setprefix <prefix> :** Change the command prefix. Example: ${prefix}setprefix ?`,
                `\`🎁\` **${prefix}setreply <text> :** Change the reply sent when someone mentions you.`,
                `\`🎁\` **${prefix}reply <on|off> :** Enable or disable mention replies.`,
                `\`🎁\` **${prefix}say <channel_id> <server_id> <text> :** Send text to a server channel from a DM. Example: ${prefix}say 123456789 987654321 Hello everyone`,
                `\`🎁\` **${prefix}insta <username> :** Check an Instagram profile. The @ before the username is optional.`,
                `\`🎁\` **${prefix}rizz me :** Send a random pickup line to yourself in the current channel.`,
                `\`🎁\` **${prefix}rizz <user_id> <channel_id> <server_id> :** Tag a user with a random pickup line in a specified server channel.`,
                `\`🎁\` **${prefix}help :** Show all commands using the current prefix.`,
                `\`🎁\` **${prefix}zidd @user <emoji> :** Track reactions for a user.`,
                `\`🎁\` **${prefix}kherej @user :** Stop tracking a user.`,
                `\`🎁\` **${prefix}lista :** List tracked reactions.`,
                `\`🎀\` **${prefix}setappid <id> :** Set the Rich Presence application ID.`,
                `\`🎀\` **${prefix}settype <PLAYING|STREAMING|LISTENING|WATCHING|CUSTOM|COMPETING> :** Set the Rich Presence type.`,
                `\`🎀\` **${prefix}setname <text> :** Set the Rich Presence name.`,
                `\`🎀\` **${prefix}setdetails <text> :** Set the Rich Presence details.`,
                `\`🎀\` **${prefix}setstate <text> :** Set the Rich Presence state.`,
                `\`🎀\` **${prefix}setlargeimage <url> :** Set the large Rich Presence image.`,
                `\`🎀\` **${prefix}largset <url> :** Alias for ${prefix}setlargeimage.`,
                `\`🎀\` **${prefix}setlargetext <text> :** Set the large image hover text.`,
                `\`🎀\` **${prefix}setbutton <1|2> <label> | <url> :** Set one of the two Rich Presence buttons.`,
                `\`🎀\` **${prefix}track [server_id] :** Follow your voice channel.`,
                `\`🎀\` **${prefix}sf :** Stop voice tracking.`,
                `\`🎀\` **${prefix}rwa7 <voice_channel_id> :** Join a voice channel.`,
                `\`🎀\` **${prefix}9awed :** Leave the current voice channel.`,
                `\`🎀\` **${prefix}jc <server_id> <voice_channel_id> :** Join a voice channel by server and channel IDs.`,
                '',
                '\`🍳\` **Made by `mamouni1xp`**',
        ].join('\n'));
        return;
    }

    if (!message.guild) return;

    if (message.content.startsWith(command('zidd'))) {
        const user = message.mentions.users.first();
        const customEmoji = message.content.split(' ')[2] || '😎';
        if (user) userEmojis.set(user.id, customEmoji);
    }

    if (message.content.startsWith(command('kherej'))) {
        const user = message.mentions.users.first();
        if (user && userEmojis.has(user.id)) userEmojis.delete(user.id);
    }

    if (message.content.startsWith(command('lista'))) {
        if (userEmojis.size === 0) {
            await message.channel.send('No users tracked yet.');
        } else {
            const lines = [];
            for (const [userId, emoji] of userEmojis.entries()) {
                const user = client.users.cache.get(userId);
                const label = user ? user.tag : userId;
                lines.push(`${emoji} — ${label} (${userId})`);
            }
            await message.channel.send(`**Tracked reactions:**\n${lines.join('\n')}`);
        }
    }

    const presenceCommand = message.content.match(new RegExp(`^${escapeRegex(prefix)}(setappid|settype|setname|setdetails|setstate|setlargeimage|largset|setlargetext)\\s+(.+)$`, 'i'));
    if (presenceCommand) {
        const command = presenceCommand[1].toLowerCase();
        const value = presenceCommand[2].trim();
        const field = {
            setappid: 'applicationId',
            settype: 'type',
            setname: 'name',
            setdetails: 'details',
            setstate: 'state',
            setlargeimage: 'largeImage',
            largset: 'largeImage',
            setlargetext: 'largeText',
        }[command];

        if (command === 'settype') {
            const validTypes = ['PLAYING', 'STREAMING', 'LISTENING', 'WATCHING', 'CUSTOM', 'COMPETING'];
            if (!validTypes.includes(value.toUpperCase())) {
                await message.channel.send(`> Type must be one of: ${validTypes.join(', ')}`);
                return;
            }
        }

        if (field === 'largeImage') {
            try {
                const parsedUrl = new URL(value);
                if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                    throw new Error('Unsupported URL protocol');
                }
            } catch {
                await message.channel.send('> Please provide a valid image link.');
                return;
            }
        }

        updatePresence(field, command === 'settype' ? value.toUpperCase() : value);
        await message.channel.send(`> Presence ${field} updated.`);
        return;
    }

    if (message.content.startsWith(command('setbutton'))) {
        const buttonArgs = message.content.slice(command('setbutton').length).trim().split('|');
        const buttonNumber = Number(buttonArgs[0]?.trim());
        const label = buttonArgs[1]?.trim();
        const url = buttonArgs[2]?.trim();

        if (![1, 2].includes(buttonNumber) || !label || !url) {
            await message.channel.send('> Usage: `!setbutton <1|2> <label> | <url>`');
            return;
        }

        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                throw new Error('Unsupported URL protocol');
            }
        } catch {
            await message.channel.send('> Please provide a valid button URL.');
            return;
        }

        context.setButton(buttonNumber - 1, [label, url]);
        await message.channel.send(`> Presence button ${buttonNumber} updated.`);
        return;
    }

    if (message.content.startsWith(command('track'))) {
        const args = message.content.split(' ');
        const guildId = args[1] || message.guild.id;
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            console.log(`> Guild not found or bot not in it: ${guildId}`);
            return;
        }

        setTrackedVoiceUser(message.author.id, guild.id);
        const member = guild.members.cache.get(message.author.id);
        if (member?.voice?.channelId) context.followVoiceUser(member.voice);
        console.log(`> Tracking ${message.author.tag} in ${guild.name}`);
    }

    if (message.content === command('sf')) stopTracking();

    if (message.content.startsWith(command('rwa7'))) {
        const channelId = message.content.split(' ')[1];
        if (!channelId) return;

        const channel = message.guild.channels.cache.get(channelId);
        if (!channel || (channel.type !== 'GUILD_VOICE' && channel.type !== 'GUILD_STAGE_VOICE')) return;

        try {
            safeJoinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });
        } catch (err) {
            console.error('> Failed to join voice channel:', err);
        }
    }

    if (message.content === command('9awed')) {
        const connection = getVoiceConnection(message.guild.id);
        if (connection) connection.destroy();
    }

    if (message.content.startsWith(command('jc'))) {
        const args = message.content.split(' ');
        const guildId = args[1];
        const vcId = args[2];

        if (!guildId || !vcId) {
            console.log('> Usage: !jc <server_id> <vc_id>');
            return;
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.log(`> Guild not found or bot not in it: ${guildId}`);
            return;
        }

        const channel = guild.channels.cache.get(vcId);
        if (!channel || (channel.type !== 'GUILD_VOICE' && channel.type !== 'GUILD_STAGE_VOICE')) {
            console.log(`> Voice channel not found: ${vcId}`);
            return;
        }

        try {
            safeJoinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });
            console.log(`> Joined ${channel.name} in ${guild.name}`);
        } catch (err) {
            console.error('> Failed to join voice channel via !jc:', err);
        }
    }
}

module.exports = { handleCommand };
