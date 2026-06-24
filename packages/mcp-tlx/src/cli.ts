#!/usr/bin/env node
// @ts-nocheck

import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";


function collectRepeatedValues(value, previous) {
  previous.push(value);
  return previous;
}

function validateServerName(value) {
  const serverName = String(value ?? "").trim();
  if (!serverName) {
    throw new Error("Server reference name must not be empty.");
  }

  return serverName;
}

function formatCliError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const details = [];
  const statusCode = typeof error.code === "number" ? error.code : undefined;

  if (statusCode !== undefined) {
    details.push(`status ${statusCode}`);
  }

  if ("cause" in error && error.cause) {
    details.push(`cause ${String(error.cause)}`);
  }

  if (details.length === 0) {
    return error.message;
  }

  return `${error.message} (${details.join(", ")})`;
}

function assertInstallArguments(options) {
  const disallowedFlags = [];

  if (options.name !== undefined) {
    disallowedFlags.push("--name");
  }

  if (options.transport !== undefined) {
    disallowedFlags.push("--transport");
  }

  if (options.command !== undefined) {
    disallowedFlags.push("--command");
  }

  if ((options.arg ?? []).length > 0) {
    disallowedFlags.push("--arg");
  }

  if ((options.env ?? []).length > 0) {
    disallowedFlags.push("--env");
  }

  if (options.cwd !== undefined) {
    disallowedFlags.push("--cwd");
  }

  if (options.url !== undefined) {
    disallowedFlags.push("--url");
  }

  if ((options.header ?? []).length > 0) {
    disallowedFlags.push("--header");
  }

  if (options.force) {
    disallowedFlags.push("--force");
  }

  if (disallowedFlags.length > 0) {
    throw new Error(`The install action does not accept any other arguments. Remove: ${disallowedFlags.join(", ")}`);
  }
}

function createTransportConfig(options) {
  const transport = String(options.transport).toLowerCase();

  if (transport === "stdio") {
    if (!options.command) {
      throw new Error("--command is required when --transport stdio is used.");
    }

    return {
      type: "stdio",
      command: options.command,
      args: options.arg ?? [],
      cwd: options.cwd ? resolve(process.cwd(), options.cwd) : undefined,
      env: parseEntryList(options.env ?? [], "--env"),
    };
  }

  if (!options.url) {
    throw new Error("--url is required when using a remote transport.");
  }

  if (transport === "http" || transport === "sse") {
    return {
      type: transport,
      url: options.url,
      headers: parseEntryList(options.header ?? [], "--header"),
    };
  }

  if (transport === "ws") {
    if ((options.header ?? []).length > 0) {
      throw new Error("--header is not currently supported for --transport ws.");
    }

    return {
      type: "ws",
      url: options.url,
    };
  }

  throw new Error(`Unsupported transport: ${transport}`);
}

function parseEntryList(entries, flagName) {
  const result = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`${flagName} values must be in KEY=VALUE format. Received: ${entry}`);
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1);

    if (!key) {
      throw new Error(`${flagName} keys must not be empty.`);
    }

    result[key] = value;
  }

  return result;
}

async function createConnectedClient(transportConfig) {
  const client = new Client(
    {
      name: "@cmdforge/mcp-tlx",
      version: "0.0.2",
    },
    {
      capabilities: {},
    },
  );

  let transport;
  switch (transportConfig.type) {
    case "stdio":
      transport = new StdioClientTransport({
        command: transportConfig.command,
        args: transportConfig.args,
        cwd: transportConfig.cwd,
        env: Object.keys(transportConfig.env).length > 0 ? transportConfig.env : undefined,
      });
      break;
    case "http":
      transport = new StreamableHTTPClientTransport(
        new URL(transportConfig.url),
        withHeaders(transportConfig.headers),
      );
      break;
    case "sse":
      transport = new SSEClientTransport(
        new URL(transportConfig.url),
        withHeaders(transportConfig.headers),
      );
      break;
    case "ws":
      transport = new WebSocketClientTransport(new URL(transportConfig.url));
      break;
    default:
      throw new Error(`Unsupported transport: ${transportConfig.type}`);
  }

  await client.connect(transport);
  return { client, transport };
}

function withHeaders(headers) {
  return {
    ...(headers && Object.keys(headers).length > 0
      ? {
          requestInit: {
            headers,
          },
        }
      : {}),
    fetch: createDebugFetch(),
  };
}

function createDebugFetch() {
  return async (input, init) => {
    const response = await fetch(input, init);

    if (!response.ok) {
      const debug = await serializeErrorResponse(response);
      console.error(`[mcp-skill] Remote transport error:\n${JSON.stringify(debug, null, 2)}`);
    }

    return response;
  };
}

async function serializeErrorResponse(response) {
  let bodyText = null;

  try {
    bodyText = await response.clone().text();
  } catch {
    bodyText = null;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    bodyText,
  };
}

async function resolveWorkspaceRoot(startDirectory) {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    if (await pathExists(resolve(currentDirectory, "pnpm-workspace.yaml"))) {
      return currentDirectory;
    }

    const packageJsonPath = resolve(currentDirectory, "package.json");
    if (await pathExists(packageJsonPath)) {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
      if (packageJson.workspaces) {
        return currentDirectory;
      }
    }

    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}

async function getMcpRootDirFromWorkspace(workspaceDir) {
  // Attempt to find node_modules/@cmdforge/mcp-tlx under the resolved workspace root.
  // If node_modules or the candidate path does not exist, log a warning and return null
  // — callers will treat this as a no-op install.
  const nodeModulesDir = resolve(workspaceDir, "node_modules");
  if (!(await pathExists(nodeModulesDir))) {
    console.warn(`[mcp-tlx] node_modules not found at workspace root: ${nodeModulesDir}. Skipping install.`);
    return null;
  }

  const candidate = resolve(nodeModulesDir, "@cmdforge", "mcp-tlx");
  if (!(await pathExists(candidate))) {
    console.warn(`[mcp-tlx] @cmdforge/mcp-tlx not found under node_modules at: ${candidate}. Skipping install.`);
    return null;
  }

  return candidate;
}

async function installFromPackageJson(workspaceDir) {
  const packageJsonPath = resolve(workspaceDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    throw new Error(`Could not find package.json at workspace root: ${packageJsonPath}`);
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const serverConfigs = validateStoredServerConfigs(packageJson["@cmdforge/mcp-tlx"]);
  const dependencyVersions = await readDependencyVersions();
  const factoryTemplate = await readFactoryTemplate();

  // Use node_modules/@cmdforge/mcp-tlx as the mcpRootDir when available. If it's not present,
  // warn and exit early — this package is intended to be installed as a devDependency so that
  // generated files live under the dependency's node_modules directory and are not checked
  // into version control.
  const mcpDepRoot = await getMcpRootDirFromWorkspace(workspaceDir);
  if (!mcpDepRoot) {
    // Nothing to do when the dependency directory isn't present.
    return 0;
  }

  // Use a dist-generated subdirectory inside the installed dependency to keep generated artifacts
  // separate from the package root.
  const mcpGenRoot = resolve(mcpDepRoot, "dist-generated");

  // Even if there are no server entries configured, continue: install should run on each
  // workspace install to ensure shared artifacts are up-to-date and to sync removals.
  if (Object.keys(serverConfigs).length === 0) {
    console.log('[mcp-tlx] No @cmdforge/mcp-tlx entries found in package.json — ensuring shared artifacts and syncing (no servers).');
  }

  await mkdir(mcpGenRoot, { recursive: true });
  await syncGeneratedServerDirectories(mcpGenRoot, serverConfigs);

  let installedCount = 0;
  for (const [serverName, transportConfig] of Object.entries(serverConfigs)) {
    await generateServerFromConfig({
      workspaceDir,
      serverName,
      transportConfig,
      force: true,
      persistPackageConfig: false,
      dependencyVersions,
      factoryTemplate,
      skipDependencyInstall: true,
      mcpRootDir: mcpGenRoot,
    });
    installedCount += 1;
  }

  await ensureSharedArtifacts({
    dependencyVersions,
    factoryTemplate,
    mcpRootDir: mcpGenRoot,
  });
  await installGeneratedDependencies(mcpGenRoot);
  await rewriteCallToolDocumentation(mcpGenRoot);

  return installedCount;
}

async function generateServerFromConfig({
  workspaceDir,
  serverName,
  transportConfig,
  force,
  persistPackageConfig,
  dependencyVersions,
  factoryTemplate,
  skipDependencyInstall = false,
  mcpRootDir: providedMcpRootDir,
}) {
  const safeServerName = makeSafeSegment(serverName, "server");
  // require an explicit mcpRootDir that points inside node_modules/@cmdforge/mcp-tlx
  const mcpRootDir = providedMcpRootDir ?? await getMcpRootDirFromWorkspace(workspaceDir);
  if (!mcpRootDir) {
    throw new Error("mcp root directory not available; aborting generation to avoid writing to workspace root");
  }

  const serverDir = resolve(mcpRootDir, safeServerName);
  const toolsDir = resolve(serverDir, "tools");
  const resolvedDependencyVersions = dependencyVersions ?? await readDependencyVersions();
  const resolvedFactoryTemplate = factoryTemplate ?? await readFactoryTemplate();
  const { client } = await createConnectedClient(transportConfig);

  try {
    const result = await client.listTools();
    const tools = Array.isArray(result.tools) ? result.tools : [];

    await prepareServerDirectory(serverDir, force);
    await mkdir(mcpRootDir, { recursive: true });
    await mkdir(toolsDir, { recursive: true });

    await generateArtifacts({
      dependencyVersions: resolvedDependencyVersions,
      factoryTemplate: resolvedFactoryTemplate,
      mcpRootDir,
      serverDir,
      serverName,
      safeServerName,
      toolList: tools,
      transportConfig,
    });

    if (persistPackageConfig) {
      await writeServerConfigToPackageJson(workspaceDir, serverName, transportConfig);
    }

    if (!skipDependencyInstall) {
      await installGeneratedDependencies(mcpRootDir);
    }

    await rewriteCallToolDocumentation(mcpRootDir);

    console.log(`Generated MCP metadata for ${serverName} in ${serverDir}`);
  } finally {
    await client.close().catch(() => {});
  }
}

async function ensureSharedArtifacts({
  dependencyVersions,
  factoryTemplate,
  mcpRootDir,
}) {
  await mkdir(mcpRootDir, { recursive: true });
  await writeFile(resolve(mcpRootDir, "factory.mjs"), factoryTemplate, "utf8");
  await writeFile(resolve(mcpRootDir, "call_tool.mjs"), renderCallToolModule(), "utf8");
  await chmod(resolve(mcpRootDir, "call_tool.mjs"), 0o755);
  await writeFile(resolve(mcpRootDir, "package.json"), renderRootPackageJson(dependencyVersions), "utf8");
}

async function writeServerConfigToPackageJson(workspaceDir, serverName, transportConfig) {
  const packageJsonPath = resolve(workspaceDir, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    throw new Error(`Could not find package.json at workspace root: ${packageJsonPath}`);
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const serverConfigs = validateStoredServerConfigs(packageJson["@cmdforge/mcp-tlx"]);
  serverConfigs[serverName] = transportConfig;
  packageJson["@cmdforge/mcp-tlx"] = sortObjectKeys(serverConfigs);
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

function validateStoredServerConfigs(value) {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('package.json field "@cmdforge/mcp-tlx" must be an object.');
  }

  const result = {};
  for (const [serverName, transportConfig] of Object.entries(value)) {
    validateServerName(serverName);
    result[serverName] = validateStoredTransportConfig(transportConfig, serverName);
  }

  assertUniqueSafeServerNames(result);

  return result;
}

function validateStoredTransportConfig(value, serverName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Stored transport config for ${serverName} must be an object.`);
  }

  const transport = String(value.type ?? "").toLowerCase();
  if (!transport) {
    throw new Error(`Stored transport config for ${serverName} is missing type.`);
  }

  if (transport === "stdio") {
    if (typeof value.command !== "string" || !value.command.trim()) {
      throw new Error(`Stored stdio transport for ${serverName} is missing command.`);
    }

    return {
      type: "stdio",
      command: value.command,
      args: Array.isArray(value.args) ? value.args.map((entry) => String(entry)) : [],
      cwd: value.cwd === undefined ? undefined : String(value.cwd),
      env: validateStoredStringMap(value.env, `${serverName} env`),
    };
  }

  if (transport === "http" || transport === "sse") {
    if (typeof value.url !== "string" || !value.url.trim()) {
      throw new Error(`Stored ${transport} transport for ${serverName} is missing url.`);
    }

    return {
      type: transport,
      url: value.url,
      headers: validateStoredStringMap(value.headers, `${serverName} headers`),
    };
  }

  if (transport === "ws") {
    if (typeof value.url !== "string" || !value.url.trim()) {
      throw new Error(`Stored ws transport for ${serverName} is missing url.`);
    }

    return {
      type: "ws",
      url: value.url,
    };
  }

  throw new Error(`Unsupported stored transport type for ${serverName}: ${transport}`);
}

function validateStoredStringMap(value, label) {
  if (value === undefined) {
    return {};
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object when provided.`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, String(entryValue)]),
  );
}

async function syncGeneratedServerDirectories(mcpRootDir, serverConfigs) {
  const desiredDirectories = new Set(
    Object.keys(serverConfigs).map((serverName) => makeSafeSegment(serverName, "server")),
  );

  const entries = await readdir(mcpRootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules") {
      continue;
    }

    const metadataPath = resolve(mcpRootDir, entry.name, "server.json");
    if (!(await pathExists(metadataPath))) {
      continue;
    }

    if (!desiredDirectories.has(entry.name)) {
      await rm(resolve(mcpRootDir, entry.name), { recursive: true, force: true });
    }
  }
}

function sortObjectKeys(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertUniqueSafeServerNames(serverConfigs) {
  const bySafeName = new Map();

  for (const serverName of Object.keys(serverConfigs)) {
    const safeServerName = makeSafeSegment(serverName, "server");
    const existingServerName = bySafeName.get(safeServerName);
    if (existingServerName && existingServerName !== serverName) {
      throw new Error(
        `Server names ${existingServerName} and ${serverName} both normalize to ${safeServerName}. Choose distinct names.`,
      );
    }

    bySafeName.set(safeServerName, serverName);
  }
}

async function prepareServerDirectory(serverDir, force) {
  const exists = await pathExists(serverDir);
  if (!exists) {
    return;
  }

  const entries = await readdir(serverDir);
  if (entries.length === 0) {
    return;
  }

  if (!force) {
    throw new Error(`Server directory already exists and is not empty: ${serverDir}. Re-run with --force to overwrite it.`);
  }

  await rm(serverDir, { recursive: true, force: true });
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDependencyVersions() {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

  return {
    mcpSdk: packageJson.dependencies?.["@modelcontextprotocol/sdk"] ?? "1.29.0",
  };
}

async function readFactoryTemplate() {
  const templateUrl = new URL("../templates/factory.shared.mjs", import.meta.url);
  return await readFile(templateUrl, "utf8");
}

async function generateArtifacts({
  dependencyVersions,
  factoryTemplate,
  mcpRootDir,
  serverDir,
  serverName,
  safeServerName,
  toolList,
  transportConfig,
}) {
  const toolsDir = resolve(serverDir, "tools");
  const seenSafeNames = new Map();
  const normalizedTools = [];

  for (const tool of toolList) {
    const safeToolName = makeSafeToolName(tool.name, seenSafeNames);
    const normalizedTool = {
      ...tool,
      name: safeToolName,
    };
    const toolPath = resolve(toolsDir, `${safeToolName}.md`);
    await writeFile(toolPath, renderToolMarkdown(safeToolName, normalizedTool), "utf8");
    normalizedTools.push({
      safeName: safeToolName,
      originalName: tool.name,
      tool: normalizedTool,
    });
  }

  await writeFile(resolve(serverDir, "client.mjs"), renderServerClientModule(transportConfig, safeServerName), "utf8");
  await writeFile(resolve(serverDir, "server.json"), `${JSON.stringify({
    name: serverName,
    safeName: safeServerName,
    transport: transportConfig,
    tools: normalizedTools,
  }, null, 2)}\n`, "utf8");
  await ensureSharedArtifacts({
    dependencyVersions,
    factoryTemplate,
    mcpRootDir,
  });
}

function renderToolMarkdown(safeToolName, tool) {
  return `# ${safeToolName}

\`\`\`json
${JSON.stringify(tool, null, 2)}
\`\`\`
`;
}

function renderServerClientModule(transportConfig, safeServerName) {
  return `import { createConfiguredClient } from "../factory.mjs";

const transportConfig = ${JSON.stringify(transportConfig, null, 2)};

export async function createClient() {
  return await createConfiguredClient(
    transportConfig,
    {
      name: "@cmdforge/mcp-tlx/${safeServerName}",
      version: "0.0.0",
    },
  );
}
`;
}

function renderCallToolModule() {
  return `#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { makeSafeName } from "./factory.mjs";

export async function callTool(input) {
  const serverName = validateServerName(input?.server);
  const toolCall = validateToolCall(input?.tool_call);
  const safeServerName = makeSafeName(serverName, "server");
  const moduleUrl = new URL(\`./\${safeServerName}/client.mjs\`, import.meta.url);
  const metadataUrl = new URL(\`./\${safeServerName}/server.json\`, import.meta.url);

  let createClient;
  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataUrl, "utf8"));
    ({ createClient } = await import(moduleUrl.href));
  } catch (error) {
    const availableServers = await listAvailableServerNames(new URL(".", import.meta.url));
    throw new Error(
      \`Unknown server: \${serverName}. Available safe server names: \${availableServers.join(", ")}\`,
      { cause: error },
    );
  }

  const mappedTool = findMappedTool(metadata, toolCall.name);
  if (!mappedTool) {
    const availableTools = (metadata.tools ?? []).map((tool) => tool.safeName).sort();
    throw new Error(
      \`Unknown tool \${toolCall.name} for server \${serverName}. Available tool names: \${availableTools.join(", ")}\`,
    );
  }

  const client = await createClient();

  try {
    let result;
    try {
      result = await Promise.race([
        client.callTool({
          ...toolCall,
          name: mappedTool.originalName,
        }),
        client.__mcpSkillServerEvent,
      ]);
    } catch (error) {
      if (client.__mcpSkillServerEventState?.triggered) {
        result = client.__mcpSkillServerEventState.payload;
      } else {
        throw error;
      }
    }

    return result;
  } finally {
    await client.close().catch(() => {});
  }
}

function findMappedTool(metadata, safeToolName) {
  const tools = Array.isArray(metadata?.tools) ? metadata.tools : [];
  return tools.find((tool) => tool.safeName === safeToolName);
}

async function listAvailableServerNames(baseUrl) {
  const baseDir = fileURLToPath(baseUrl);
  const entries = await readdir(baseDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
    .map((entry) => entry.name)
    .sort();
}

function validateServerName(value) {
  const serverName = String(value ?? "").trim();
  if (!serverName) {
    throw new Error("call_tool input.server must be a non-empty string.");
  }

  return serverName;
}

function validateToolCall(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("call_tool input.tool_call must be an object.");
  }

  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new Error("call_tool input.tool_call.name must be a non-empty string.");
  }

  if ("arguments" in value && (value.arguments === null || typeof value.arguments !== "object" || Array.isArray(value.arguments))) {
    throw new Error("call_tool input.tool_call.arguments must be an object when provided.");
  }

  return value;
}

async function readInvocation() {
  if (process.argv[2]) {
    return JSON.parse(process.argv[2]);
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(String(chunk));
  }

  const input = chunks.join("").trim();
  if (!input) {
    throw new Error("Provide call_tool input as a JSON argument or via stdin.");
  }

  return JSON.parse(input);
}

function fileURLToPath(url) {
  return new URL(url).protocol === "file:"
    ? decodeURIComponent(new URL(url).pathname)
    : pathToFileURL(url).href;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const invocation = await readInvocation();
    const result = await callTool(invocation);
    process.stdout.write(\`\${JSON.stringify(result, null, 2)}\\n\`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
`;
}

function renderRootPackageJson(dependencyVersions) {
  return `${JSON.stringify(
    {
      name: "cmdforge-mcp",
      private: true,
      type: "module",
      dependencies: {
        "@modelcontextprotocol/sdk": dependencyVersions.mcpSdk,
      },
    },
    null,
    2,
  )}\n`;
}

async function rewriteCallToolDocumentation(mcpRootDir) {
  const availableServers = await listAvailableServers(mcpRootDir);
  const lines = [
    "# call_tool",
    "",
    "Available servers:",
    "",
  ];

  if (availableServers.length === 0) {
    lines.push("- None");
  } else {
    for (const server of availableServers) {
      lines.push(`- \`${server.safeName}\``);
      for (const tool of server.tools) {
        lines.push(`  - [${tool.safeName}](${server.safeName}/tools/${tool.safeName}.md)`);
      }
    }
  }

  lines.push("");
  lines.push("Call one of the above tools by passing the safe server name as `server` and the safe tool name as `tool_call.name`.");
  lines.push("Use `tool_call.arguments` for the actual MCP tool arguments object.");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(createCallToolInputSchema(), null, 2));
  lines.push("```");
  lines.push("");

  await writeFile(resolve(mcpRootDir, "call_tool.md"), `${lines.join("\n")}\n`, "utf8");
}

async function listAvailableServers(mcpRootDir) {
  const entries = await readdir(mcpRootDir, { withFileTypes: true });
  const servers = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules") {
      continue;
    }

    const metadataPath = resolve(mcpRootDir, entry.name, "server.json");
    if (!(await pathExists(metadataPath))) {
      continue;
    }

    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    servers.push({
      name: metadata.name ?? entry.name,
      safeName: metadata.safeName ?? entry.name,
      tools: Array.isArray(metadata.tools)
        ? metadata.tools.map((tool) => ({
            safeName: tool.safeName,
          }))
        : [],
    });
  }

  return servers.sort((left, right) => left.safeName.localeCompare(right.safeName));
}

function createCallToolInputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      server: {
        type: "string",
        description: "Server name. It will be normalized to a safe server directory name before lookup.",
      },
      tool_call: {
        type: "object",
        additionalProperties: false,
        properties: {
          _meta: {
            type: "object",
            additionalProperties: true,
            properties: {
              progressToken: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                ],
              },
              "io.modelcontextprotocol/related-task": {
                type: "object",
                additionalProperties: false,
                properties: {
                  taskId: { type: "string" },
                },
                required: ["taskId"],
              },
            },
          },
          task: {
            type: "object",
            additionalProperties: false,
            properties: {
              ttl: { type: "number" },
            },
          },
          name: {
            type: "string",
          },
          arguments: {
            type: "object",
            additionalProperties: true,
          },
        },
        required: ["name"],
      },
    },
    required: ["server", "tool_call"],
  };
}

function makeSafeToolName(toolName, seenSafeNames) {
  const base = makeSafeSegment(toolName, "tool");
  const count = seenSafeNames.get(base) ?? 0;
  seenSafeNames.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function makeSafeSegment(value, fallback) {
  const safeValue = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeValue || fallback;
}

async function installGeneratedDependencies(mcpRootDir) {
  // Prefer pnpm (root binary) when available; fallback to npm.
  let cmd = "npm";
  let args = ["install"];

  try {
    const hasPnpm = await new Promise((resolveCheck) => {
      const probe = spawn("pnpm", ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
      probe.on("close", (code) => resolveCheck(code === 0));
      probe.on("error", () => resolveCheck(false));
    });

    if (hasPnpm) {
      cmd = "pnpm";
      args = ["install"];
    }
  } catch {
    // ignore probe failures and fall back to npm
  }

  const child = spawn(cmd, args, {
    cwd: mcpRootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const [exitCode] = await once(child, "close");
  if (exitCode !== 0) {
    throw new Error(`${cmd} install failed in ${mcpRootDir} with exit code ${exitCode}`);
  }
}

// Run install behavior on invocation (postinstall entrypoint)
(async () => {
  try {
    const workspaceDir = await resolveWorkspaceRoot(process.cwd());
    const installedCount = await installFromPackageJson(workspaceDir);
    console.log(`Synced ${installedCount} MCP server${installedCount === 1 ? "" : "s"} from ${resolve(workspaceDir, "package.json")}`);
  } catch (error) {
    console.error(formatCliError(error));
    process.exitCode = 1;
  }
})();
