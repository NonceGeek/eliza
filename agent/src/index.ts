import { PostgresDatabaseAdapter } from "@ai16z/adapter-postgres";
import { SqliteDatabaseAdapter } from "@ai16z/adapter-sqlite";
import { AutoClientInterface } from "@ai16z/client-auto";
import { DirectClientInterface } from "@ai16z/client-direct";
import { DiscordClientInterface } from "@ai16z/client-discord";
import { TelegramClientInterface } from "@ai16z/client-telegram";
import { TwitterClientInterface } from "@ai16z/client-twitter";
import {
    AgentRuntime,
    CacheManager,
    Character,
    DbCacheAdapter,
    FsCacheAdapter,
    IAgentRuntime,
    ICacheManager,
    IDatabaseAdapter,
    IDatabaseCacheAdapter,
    ModelProviderName,
    defaultCharacter,
    elizaLogger,
    settings,
    stringToUuid,
    validateCharacterConfig,
} from "@ai16z/eliza";
import { zgPlugin } from "@ai16z/plugin-0g";
import { goatPlugin } from "@ai16z/plugin-goat";
import { bootstrapPlugin } from "@ai16z/plugin-bootstrap";
// import { buttplugPlugin } from "@ai16z/plugin-buttplug";
import {
    coinbaseCommercePlugin,
    coinbaseMassPaymentsPlugin,
    tradePlugin,
} from "@ai16z/plugin-coinbase";
import { confluxPlugin } from "@ai16z/plugin-conflux";
import { imageGenerationPlugin } from "@ai16z/plugin-image-generation";
import { evmPlugin } from "@ai16z/plugin-evm";
import { createNodePlugin } from "@ai16z/plugin-node";
import { solanaPlugin } from "@ai16z/plugin-solana";
import { teePlugin } from "@ai16z/plugin-tee";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import yargs from "yargs";

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export function parseArguments(): {
    character?: string;
    characters?: string;
} {
    try {
        return yargs(process.argv.slice(3))
            .option("character", {
                type: "string",
                description: "Path to the character JSON file",
            })
            .option("characters", {
                type: "string",
                description:
                    "Comma separated list of paths to character JSON files",
            })
            .parseSync();
    } catch (error) {
        elizaLogger.error("Error parsing arguments:", error);
        return {};
    }
}

function tryLoadFile(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (e) {
        return null;
    }
}

function isAllStrings(arr: unknown[]): boolean {
    return Array.isArray(arr) && arr.every((item) => typeof item === "string");
}

export async function loadCharacters(
    charactersArg: string
): Promise<Character[]> {
    let characterPaths = charactersArg
        ?.split(",")
        .map((filePath) => filePath.trim());
    const loadedCharacters = [];

    if (characterPaths?.length > 0) {
        for (const characterPath of characterPaths) {
            console.log("characterPath", characterPath);
            // Handle bodhi protocol format
            if (characterPath.startsWith("bodhi://")) {
                try {
                    const bodhiPostId = characterPath.replace("bodhi://", "");
                    elizaLogger.info("bodhiPostId", bodhiPostId);

                    let postNumbers: number[] = [];

                    // Check if the input has plus symbol
                    if (bodhiPostId.includes("+")) {
                        // Split by + and convert each part to number
                        postNumbers = bodhiPostId
                            .split("+")
                            .map((num) => parseInt(num.trim()));
                    } else {
                        // Single number case
                        postNumbers = [parseInt(bodhiPostId)];
                    }

                    // Filter out any NaN values
                    postNumbers = postNumbers.filter((num) => !isNaN(num));

                    elizaLogger.info("postNumbers", postNumbers);

                    let mergedCharacterData: Character | null = null;

                    // Fetch data for each post number individually
                    for (const postNumber of postNumbers) {
                        const response = await fetch(
                            `https://bodhi-data.deno.dev/assets?asset_begin=${postNumber}&asset_end=${postNumber}`
                        );
                        const data = await response.json();

                        if (data.assets?.[0]?.content) {
                            // Process each post's content
                            const content = data.assets[0].content;

                            // Remove first and last line (which contain ```json and ```)
                            const contentLines = content.split("\n");
                            const jsonContent = contentLines
                                .slice(1, -1) // Remove first and last lines
                                .join("\n")
                                .replace(/\r\n/g, "") // Remove any \r\n
                                .replace(/\r/g, ""); // Remove any \r

                            // Add this: Convert invalid JSON to valid JSON by adding quotes to keys
                            let validJsonContent = jsonContent.replace(
                                /(\s*?{\s*?|\s*?,\s*?)(['"])?([a-zA-Z0-9_]+)(['"])?:/g,
                                '$1"$3":'
                            );

                            // Remove trailing commas from arrays and objects
                            validJsonContent = validJsonContent.replace(
                                /,(\s*[}\]])/g,
                                "$1"
                            ); // Remove trailing commas

                            try {
                                const characterData =
                                    JSON.parse(validJsonContent);
                                elizaLogger.info(
                                    "characterData.username",
                                    characterData.username
                                );

                                // Initialize merged data structure if this is the first post
                                if (!mergedCharacterData) {
                                    mergedCharacterData = {
                                        ...characterData,
                                        lore: [],
                                        bio: [],
                                        messageExamples: [],
                                        postExamples: [],
                                        topics: [],
                                        adjectives: [],
                                    };
                                }

                                // Merge arrays if they exist, ensuring no duplicates
                                if (Array.isArray(characterData.lore)) {
                                    mergedCharacterData.lore.push(
                                        ...characterData.lore
                                    );
                                }
                                if (Array.isArray(characterData.bio)) {
                                    mergedCharacterData.bio.push(
                                        ...characterData.bio
                                    );
                                }
                                if (
                                    Array.isArray(characterData.messageExamples)
                                ) {
                                    mergedCharacterData.messageExamples.push(
                                        ...characterData.messageExamples
                                    );
                                }
                                if (Array.isArray(characterData.postExamples)) {
                                    mergedCharacterData.postExamples.push(
                                        ...characterData.postExamples
                                    );
                                }
                                if (Array.isArray(characterData.topics)) {
                                    mergedCharacterData.topics.push(
                                        ...characterData.topics
                                    );
                                }
                                if (Array.isArray(characterData.adjectives)) {
                                    mergedCharacterData.adjectives.push(
                                        ...characterData.adjectives
                                    );
                                }

                                // If this is the last post, process the final merged data
                                if (
                                    postNumber ===
                                    postNumbers[postNumbers.length - 1]
                                ) {
                                    // Remove duplicates from arrays
                                    mergedCharacterData.lore = [
                                        ...new Set(mergedCharacterData.lore),
                                    ];
                                    mergedCharacterData.bio = [
                                        ...new Set(mergedCharacterData.bio),
                                    ];
                                    mergedCharacterData.messageExamples = [
                                        ...new Set(
                                            mergedCharacterData.messageExamples
                                        ),
                                    ];
                                    mergedCharacterData.postExamples = [
                                        ...new Set(
                                            mergedCharacterData.postExamples
                                        ),
                                    ];
                                    mergedCharacterData.topics = [
                                        ...new Set(mergedCharacterData.topics),
                                    ];
                                    mergedCharacterData.adjectives = [
                                        ...new Set(
                                            mergedCharacterData.adjectives
                                        ),
                                    ];

                                    // Add default settings
                                    mergedCharacterData.modelProvider =
                                        "redpill";
                                    mergedCharacterData.plugins = [];
                                    mergedCharacterData.clients = [];
                                    mergedCharacterData.settings = {
                                        secrets: {},
                                        voice: {
                                            model: "en_US-hfc_female-medium",
                                        },
                                    };

                                    // Save the merged character data
                                    const characterFileName = `${mergedCharacterData.username}.character.json`;
                                    const characterFilePath = path.resolve(
                                        __dirname,
                                        "../../characters",
                                        characterFileName
                                    );

                                    fs.mkdirSync(
                                        path.dirname(characterFilePath),
                                        {
                                            recursive: true,
                                        }
                                    );
                                    fs.writeFileSync(
                                        characterFilePath,
                                        JSON.stringify(
                                            mergedCharacterData,
                                            null,
                                            2
                                        )
                                    );
                                    validateCharacterConfig(
                                        mergedCharacterData
                                    );
                                    loadedCharacters.push(mergedCharacterData);
                                    elizaLogger.info(
                                        `Successfully loaded character from Bodhi post #${postNumber}`
                                    );
                                }
                            } catch (e) {
                                elizaLogger.error(
                                    `Error parsing character data from Bodhi post #${postNumber}: ${e}`
                                );
                                continue;
                            }
                        }
                    }

                    // Add support link to lore
                    mergedCharacterData.lore.push(
                        `The support page is https://bodhi.wtf/${postNumbers[0]}?action=buy`
                    );
                    continue;
                } catch (e) {
                    elizaLogger.error(
                        `Error processing bodhi URL ${characterPath}: ${e}`
                    );
                    continue;
                }
            }

            let content = null;
            let resolvedPath = "";

            // Try different path resolutions in order
            const pathsToTry = [
                characterPath, // exact path as specified
                path.resolve(process.cwd(), characterPath), // relative to cwd
                path.resolve(process.cwd(), "agent", characterPath), // Add this
                path.resolve(__dirname, characterPath), // relative to current script
                path.resolve(
                    __dirname,
                    "characters",
                    path.basename(characterPath)
                ), // relative to agent/characters
                path.resolve(
                    __dirname,
                    "../characters",
                    path.basename(characterPath)
                ), // relative to characters dir from agent
                path.resolve(
                    __dirname,
                    "../../characters",
                    path.basename(characterPath)
                ), // relative to project root characters dir
            ];

            elizaLogger.info(
                "Trying paths:",
                pathsToTry.map((p) => ({
                    path: p,
                    exists: fs.existsSync(p),
                }))
            );

            for (const tryPath of pathsToTry) {
                content = tryLoadFile(tryPath);
                if (content !== null) {
                    resolvedPath = tryPath;
                    break;
                }
            }

            if (content === null) {
                elizaLogger.error(
                    `Error loading character from ${characterPath}: File not found in any of the expected locations`
                );
                elizaLogger.error("Tried the following paths:");
                pathsToTry.forEach((p) => elizaLogger.error(` - ${p}`));
                process.exit(1);
            }

            try {
                const character = JSON.parse(content);
                validateCharacterConfig(character);

                // Handle plugins
                if (isAllStrings(character.plugins)) {
                    elizaLogger.info("Plugins are: ", character.plugins);
                    const importedPlugins = await Promise.all(
                        character.plugins.map(async (plugin) => {
                            const importedPlugin = await import(plugin);
                            return importedPlugin.default;
                        })
                    );
                    character.plugins = importedPlugins;
                }

                loadedCharacters.push(character);
                elizaLogger.info(
                    `Successfully loaded character from: ${resolvedPath}`
                );
            } catch (e) {
                elizaLogger.error(
                    `Error parsing character from ${resolvedPath}: ${e}`
                );
                process.exit(1);
            }
        }
    }

    if (loadedCharacters.length === 0) {
        elizaLogger.info("No characters found, using default character");
        loadedCharacters.push(defaultCharacter);
    }

    return loadedCharacters;
}

export function getTokenForProvider(
    provider: ModelProviderName,
    character: Character
) {
    switch (provider) {
        case ModelProviderName.OPENAI:
            return (
                character.settings?.secrets?.OPENAI_API_KEY ||
                settings.OPENAI_API_KEY
            );
        case ModelProviderName.ETERNALAI:
            return (
                character.settings?.secrets?.ETERNALAI_API_KEY ||
                settings.ETERNALAI_API_KEY
            );
        case ModelProviderName.LLAMACLOUD:
        case ModelProviderName.TOGETHER:
            return (
                character.settings?.secrets?.LLAMACLOUD_API_KEY ||
                settings.LLAMACLOUD_API_KEY ||
                character.settings?.secrets?.TOGETHER_API_KEY ||
                settings.TOGETHER_API_KEY ||
                character.settings?.secrets?.XAI_API_KEY ||
                settings.XAI_API_KEY ||
                character.settings?.secrets?.OPENAI_API_KEY ||
                settings.OPENAI_API_KEY
            );
        case ModelProviderName.ANTHROPIC:
            return (
                character.settings?.secrets?.ANTHROPIC_API_KEY ||
                character.settings?.secrets?.CLAUDE_API_KEY ||
                settings.ANTHROPIC_API_KEY ||
                settings.CLAUDE_API_KEY
            );
        case ModelProviderName.REDPILL:
            return (
                character.settings?.secrets?.REDPILL_API_KEY ||
                settings.REDPILL_API_KEY
            );
        case ModelProviderName.OPENROUTER:
            return (
                character.settings?.secrets?.OPENROUTER ||
                settings.OPENROUTER_API_KEY
            );
        case ModelProviderName.GROK:
            return (
                character.settings?.secrets?.GROK_API_KEY ||
                settings.GROK_API_KEY
            );
        case ModelProviderName.HEURIST:
            return (
                character.settings?.secrets?.HEURIST_API_KEY ||
                settings.HEURIST_API_KEY
            );
        case ModelProviderName.GROQ:
            return (
                character.settings?.secrets?.GROQ_API_KEY ||
                settings.GROQ_API_KEY
            );
        case ModelProviderName.GALADRIEL:
            return (
                character.settings?.secrets?.GALADRIEL_API_KEY ||
                settings.GALADRIEL_API_KEY
            );
        case ModelProviderName.FAL:
            return (
                character.settings?.secrets?.FAL_API_KEY || settings.FAL_API_KEY
            );
        case ModelProviderName.ALI_BAILIAN:
            return (
                character.settings?.secrets?.ALI_BAILIAN_API_KEY ||
                settings.ALI_BAILIAN_API_KEY
            );
        case ModelProviderName.VOLENGINE:
            return (
                character.settings?.secrets?.VOLENGINE_API_KEY ||
                settings.VOLENGINE_API_KEY
            );
    }
}

function initializeDatabase(dataDir: string) {
    if (process.env.POSTGRES_URL) {
        elizaLogger.info("Initializing PostgreSQL connection...");
        const db = new PostgresDatabaseAdapter({
            connectionString: process.env.POSTGRES_URL,
            parseInputs: true,
        });

        // Test the connection
        db.init()
            .then(() => {
                elizaLogger.success(
                    "Successfully connected to PostgreSQL database"
                );
            })
            .catch((error) => {
                elizaLogger.error("Failed to connect to PostgreSQL:", error);
            });

        return db;
    } else {
        const filePath =
            process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
        // ":memory:";
        const db = new SqliteDatabaseAdapter(new Database(filePath));
        return db;
    }
}

export async function initializeClients(
    character: Character,
    runtime: IAgentRuntime
) {
    const clients = [];
    const clientTypes =
        character.clients?.map((str) => str.toLowerCase()) || [];

    if (clientTypes.includes("auto")) {
        const autoClient = await AutoClientInterface.start(runtime);
        if (autoClient) clients.push(autoClient);
    }

    if (clientTypes.includes("discord")) {
        clients.push(await DiscordClientInterface.start(runtime));
    }

    if (clientTypes.includes("telegram")) {
        const telegramClient = await TelegramClientInterface.start(runtime);
        if (telegramClient) clients.push(telegramClient);
    }

    if (clientTypes.includes("twitter")) {
        const twitterClients = await TwitterClientInterface.start(runtime);
        clients.push(twitterClients);
    }

    if (character.plugins?.length > 0) {
        for (const plugin of character.plugins) {
            if (plugin.clients) {
                for (const client of plugin.clients) {
                    clients.push(await client.start(runtime));
                }
            }
        }
    }

    return clients;
}

function getSecret(character: Character, secret: string) {
    return character.settings.secrets?.[secret] || process.env[secret];
}

let nodePlugin: any | undefined;

export function createAgent(
    character: Character,
    db: IDatabaseAdapter,
    cache: ICacheManager,
    token: string
) {
    elizaLogger.success(
        elizaLogger.successesTitle,
        "Creating runtime for character",
        character.name
    );

    nodePlugin ??= createNodePlugin();

    return new AgentRuntime({
        databaseAdapter: db,
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character,
        plugins: [
            bootstrapPlugin,
            getSecret(character, "CONFLUX_CORE_PRIVATE_KEY")
                ? confluxPlugin
                : null,
            nodePlugin,
            getSecret(character, "SOLANA_PUBLIC_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                !getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? solanaPlugin
                : null,
            getSecret(character, "EVM_PRIVATE_KEY") ||
            (getSecret(character, "WALLET_PUBLIC_KEY") &&
                !getSecret(character, "WALLET_PUBLIC_KEY")?.startsWith("0x"))
                ? evmPlugin
                : null,
            getSecret(character, "ZEROG_PRIVATE_KEY") ? zgPlugin : null,
            getSecret(character, "COINBASE_COMMERCE_KEY")
                ? coinbaseCommercePlugin
                : null,
            getSecret(character, "FAL_API_KEY") ||
            getSecret(character, "OPENAI_API_KEY") ||
            getSecret(character, "HEURIST_API_KEY")
                ? imageGenerationPlugin
                : null,
            ...(getSecret(character, "COINBASE_API_KEY") &&
            getSecret(character, "COINBASE_PRIVATE_KEY")
                ? [coinbaseMassPaymentsPlugin, tradePlugin]
                : []),
            getSecret(character, "WALLET_SECRET_SALT") ? teePlugin : null,
            getSecret(character, "ALCHEMY_API_KEY") ? goatPlugin : null,
        ].filter(Boolean),
        providers: [],
        actions: [],
        services: [],
        managers: [],
        cacheManager: cache,
    });
}

function intializeFsCache(baseDir: string, character: Character) {
    const cacheDir = path.resolve(baseDir, character.id, "cache");

    const cache = new CacheManager(new FsCacheAdapter(cacheDir));
    return cache;
}

function intializeDbCache(character: Character, db: IDatabaseCacheAdapter) {
    const cache = new CacheManager(new DbCacheAdapter(db, character.id));
    return cache;
}

async function startAgent(character: Character, directClient) {
    let db: IDatabaseAdapter & IDatabaseCacheAdapter;
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        const token = getTokenForProvider(character.modelProvider, character);
        const dataDir = path.join(__dirname, "../data");

        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = initializeDatabase(dataDir) as IDatabaseAdapter &
            IDatabaseCacheAdapter;

        await db.init();

        const cache = intializeDbCache(character, db);
        const runtime = createAgent(character, db, cache, token);

        await runtime.initialize();

        const clients = await initializeClients(character, runtime);

        directClient.registerAgent(runtime);

        return clients;
    } catch (error) {
        elizaLogger.error(
            `Error starting agent for character ${character.name}:`,
            error
        );
        console.error(error);
        if (db) {
            await db.close();
        }
        throw error;
    }
}

const startAgents = async () => {
    const directClient = await DirectClientInterface.start();
    const args = parseArguments();

    let charactersArg = args.characters || args.character;

    let characters = [defaultCharacter];

    if (charactersArg) {
        characters = await loadCharacters(charactersArg);
    }

    try {
        for (const character of characters) {
            await startAgent(character, directClient);
        }
    } catch (error) {
        elizaLogger.error("Error starting agents:", error);
    }

    function chat() {
        const agentId = characters[0].name ?? "Agent";
        rl.question("You: ", async (input) => {
            await handleUserInput(input, agentId);
            if (input.toLowerCase() !== "exit") {
                chat(); // Loop back to ask another question
            }
        });
    }

    elizaLogger.log("Chat started. Type 'exit' to quit.");
    if (!args["non-interactive"]) {
        chat();
    }
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1); // Exit the process after logging
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function handleUserInput(input, agentId) {
    if (input.toLowerCase() === "exit") {
        gracefulExit();
    }

    try {
        const serverPort = parseInt(settings.SERVER_PORT || "3000");

        const response = await fetch(
            `http://localhost:${serverPort}/${agentId}/message`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: input,
                    userId: "user",
                    userName: "User",
                }),
            }
        );

        const data = await response.json();
        data.forEach((message) =>
            elizaLogger.log(`${"Agent"}: ${message.text}`)
        );
    } catch (error) {
        console.error("Error fetching response:", error);
    }
}

async function gracefulExit() {
    elizaLogger.log("Terminating and cleaning up resources...");
    rl.close();
    process.exit(0);
}

rl.on("SIGINT", gracefulExit);
rl.on("SIGTERM", gracefulExit);
