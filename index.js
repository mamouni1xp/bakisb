require('dotenv').config(); // Load .env variables

function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}

// Catch anything that would otherwise crash the whole process
process.on('unhandledRejection', (err) => {
    console.error('> Unhandled rejection:', errorMessage(err));
});
process.on('uncaughtException', (err) => {
    if (err instanceof TypeError && err.message?.includes('ApplicationFlags is not a constructor')) {
        // Known discord.js-selfbot-v13 bug: crashes while patching the
        // "Application" data attached to some messages (bot-application
        // metadata). Usually caused by a version mismatch with
        // discord-api-types. The message that triggered it is simply
        // dropped; the bot keeps running.
        console.warn('> Known library bug hit (ApplicationFlags) - message skipped, bot still running.');
        return;
    }
    console.error('> Uncaught exception:', errorMessage(err));
});

// Best-effort patch for the ApplicationFlags bug above, applied before
// the library is loaded. Safe no-op if the export is already fine or if
// the internal path doesn't match your installed version.
try {
    const flagsPath = require.resolve('discord.js-selfbot-v13/src/util/ApplicationFlags.js');
    const exported = require(flagsPath);
    const isBroken = typeof exported !== 'function' && typeof exported?.ApplicationFlags !== 'function';
    if (isBroken) {
        console.warn('> Patching broken ApplicationFlags export from discord.js-selfbot-v13');
        class ApplicationFlagsPatch {
            constructor(bits) { this.bitfield = bits; }
            has() { return false; }
            toArray() { return []; }
        }
        require.cache[flagsPath].exports = ApplicationFlagsPatch;
    }
} catch (err) {
    console.warn('> Could not pre-patch ApplicationFlags (path may differ in your version):', errorMessage(err));
}

const { Client, RichPresence } = require('discord.js-selfbot-v13');
const { handleCommand } = require('./cmd');
const client = new Client({ checkUpdate: false });
const OWNER_ID = process.env.OWNER_ID;
const userEmojis = new Map();
let trackedUserId = null;
let trackedGuildId = null;
let commandPrefix = '!';
const presenceConfig = {
    applicationId: '1547994721581010964',
    type: 'PLAYING',
    name: '1xp🎮',
    details: 'Exploring discord',
    state: 'In a Mission...',
    largeImage: 'https://cdn.discordapp.com/attachments/1326195481855918150/1548307427252903936/r_1.gif?ex=6aa69528&is=6aa543a8&hm=bc7d79551036bf25daccdda7c819a8e6259ecd6f4098e9d9522d03c7140ddd23&',
    largeText: '1xp',
    buttons: [
        ['Follow 🎈', 'https://instagram.com/mamouni_1xp'],
        ['Instagram', 'https://instagram.com/mamouni_1xp'],
    ],
};

const {
    getVoiceConnection,
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
} = require('@discordjs/voice');

// Makes a voice connection auto-recover from temporary disconnects
// (e.g. Discord moving the bot, a bad network blip) instead of just
// dying silently or throwing an uncaught error.
function attachResilience(connection) {
    if (!connection) return;

    connection.on('error', (err) => {
        console.error('Voice connection error:', errorMessage(err));
    });

    connection.on('stateChange', async (oldState, newState) => {
        try {
            if (newState?.status === VoiceConnectionStatus.Disconnected) {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch {
                    try {
                        connection.destroy();
                    } catch (err) {
                        console.error('> Failed to destroy stuck connection:', errorMessage(err));
                    }
                    if (connection.joinConfig?.guildId === trackedGuildId) {
                        trackedUserId = null;
                        trackedGuildId = null;
                    }
                }
            } else if (newState?.status === VoiceConnectionStatus.Destroyed) {
                console.log('> Voice connection destroyed.');
            }
        } catch (err) {
            console.error('> Voice state recovery failed:', errorMessage(err));
        }
    });
}

function safeJoinVoiceChannel(options) {
    const connection = joinVoiceChannel(options);
    attachResilience(connection);
    return connection;
}

function stopTracking() {
    try {
        const connection = trackedGuildId ? getVoiceConnection(trackedGuildId) : null;
        if (connection) connection.destroy();
    } catch (err) {
        console.error('> Failed to stop voice tracking:', errorMessage(err));
    }
    trackedUserId = null;
    trackedGuildId = null;
}

function setRichPresence() {
    try {
        if (!client.user) return;

        const richPresence = new RichPresence(client)
            .setApplicationId(presenceConfig.applicationId)
            .setType(presenceConfig.type)
            .setName(presenceConfig.name)
            .setDetails(presenceConfig.details)
            .setState(presenceConfig.state)
            .setAssetsLargeImage(presenceConfig.largeImage)
            .setAssetsLargeText(presenceConfig.largeText)
            .setStartTimestamp(Date.now());

        for (const [label, url] of presenceConfig.buttons) {
            richPresence.addButton(label, url);
        }

        Promise.resolve(client.user.setPresence({ activities: [richPresence] }))
            .catch((err) => console.error('> Failed to update presence:', errorMessage(err)));
    } catch (err) {
        console.error('> Presence update skipped:', errorMessage(err));
    }
}

function updatePresence(field, value) {
    presenceConfig[field] = value;
    setRichPresence();
}

function setButton(index, button) {
    presenceConfig.buttons[index] = button;
    setRichPresence();
}

function setCommandPrefix(prefix) {
    commandPrefix = prefix;
}

function setTrackedVoiceUser(userId, guildId) {
    trackedUserId = userId;
    trackedGuildId = guildId;
}

async function autoReact(message) {
    const authorId = message.author?.id;
    const emoji = authorId ? userEmojis.get(authorId) : null;
    if (!emoji || typeof message.react !== 'function') return;

    try {
        await message.react(emoji);
    } catch (err) {
        console.error('> Auto-reaction skipped:', errorMessage(err));
    }
}

function followVoiceUser(state) {
    try {
        if (!trackedUserId || !state?.guild || state.id !== trackedUserId) return;

        const connection = getVoiceConnection(state.guild.id);
        if (!state.channelId) {
            if (connection) connection.destroy();
            return;
        }

        safeJoinVoiceChannel({
            channelId: state.channelId,
            guildId: state.guild.id,
            adapterCreator: state.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });
    } catch (err) {
        console.error('Failed to follow voice user:', errorMessage(err));
    }
}

client.once('ready', () => {
    try {
        console.log(`> Logged in as ${client.user?.tag || 'user'}`);
        setRichPresence();
    } catch (err) {
        console.error('> Ready handler failed:', errorMessage(err));
    }
});

client.on('messageCreate', async (message) => {
    try {
        if (message.author?.id === client.user?.id) return;

        await autoReact(message);

        await handleCommand(message, {
            client,
            ownerId: OWNER_ID,
            userEmojis,
            prefix: commandPrefix,
            setPrefix: setCommandPrefix,
            updatePresence,
            setButton,
            safeJoinVoiceChannel,
            stopTracking,
            setTrackedVoiceUser,
            followVoiceUser,
        });
    } catch (err) {
        // Last line of defense so a single bad message never kills the whole bot
        console.error('> Error handling message:', err);
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    try {
        if (newState?.guild?.id !== trackedGuildId) return;
        followVoiceUser(newState);
    } catch (err) {
        console.error('> Error in voiceStateUpdate:', errorMessage(err));
    }
});

async function loginWithRetry() {
    try {
        await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
        console.error('> Login failed; retrying in 10 seconds:', errorMessage(err));
        setTimeout(loginWithRetry, 10000).unref();
    }
}

loginWithRetry();