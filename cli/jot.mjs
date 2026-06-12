#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TOJ_VERSION = "0.1.2-skale";
const UPDATE_REPO = "devskale/toj";
const UPDATE_BRANCH = "skalify";
const UPDATE_CHECK_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

const configDir = path.join(os.homedir(), ".config", "jot");
const configPath = path.join(configDir, "settings.json");
const updateCheckPath = path.join(configDir, "update-check.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return { instances: [] };
  }
}

function saveConfig(config) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function getInstance(name) {
  const config = loadConfig();
  const instance = config.instances.find((i) => i.name === name);
  if (!instance) {
    console.error(`Unknown instance: ${name}`);
    console.error(`Run: toj register <name> <baseUrl> <token>`);
    process.exit(1);
  }
  return instance;
}

function getLocalCommit() {
  try {
    const gitHead = path.join(new URL(import.meta.url).pathname, "..", "..", ".git", "HEAD");
    if (!fs.existsSync(gitHead)) return null;
    const head = fs.readFileSync(gitHead, "utf8").trim();
    if (head.startsWith("ref:")) {
      const refPath = path.join(new URL(import.meta.url).pathname, "..", "..", ".git", head.split(" ")[1]);
      if (fs.existsSync(refPath)) return fs.readFileSync(refPath, "utf8").trim();
    }
    return head;
  } catch { return null; }
}

function loadUpdateCheck() {
  try {
    return JSON.parse(fs.readFileSync(updateCheckPath, "utf8"));
  } catch { return {}; }
}

function saveUpdateCheck(data) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(updateCheckPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

async function checkForUpdate(force = false) {
  const check = loadUpdateCheck();
  const now = Date.now();

  if (!force && check.lastCheck && (now - check.lastCheck) < UPDATE_CHECK_INTERVAL) {
    // Cached result still valid
    if (check.updateAvailable) {
      console.log(`📦 Update available! Run: toj --update`);
    }
    return check;
  }

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${UPDATE_REPO}/commits/${UPDATE_BRANCH}`,
      { headers: { "User-Agent": "toj-selfupdate" }, signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return check;
    const data = await resp.json();
    const remoteCommit = data.sha?.slice(0, 7);
    const localCommit = getLocalCommit()?.slice(0, 7);

    const result = {
      lastCheck: now,
      remoteCommit,
      localCommit,
      updateAvailable: remoteCommit && localCommit && remoteCommit !== localCommit,
    };

    saveUpdateCheck(result);

    if (result.updateAvailable) {
      console.log(`📦 Update available! (${localCommit} → ${remoteCommit}) Run: toj --update`);
    }
    return result;
  } catch {
    // Network error, skip silently
    return check;
  }
}

async function request(instance, method, endpoint, body) {
  const url = `${instance.baseUrl.replace(/\/$/, "")}${endpoint}`;
  const options = {
    method,
    headers: {},
  };

  if (instance.token) {
    options.headers.Authorization = `Bearer ${instance.token}`;
  }

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { payload = {}; }
    console.error(`Error ${response.status}: ${payload.error || payload.errors?.join(", ") || "Request failed"}`);
    if (response.status === 0 || response.status >= 500) {
      console.error(`Hint: Is the server running at ${instance.baseUrl}?`);
      console.error(`Hint: Self-signed cert? Try --insecure flag.`);
    }
    process.exit(1);
  }

  return await response.json();
}

function isShareInstance(instance) {
  return Boolean(instance.shareId && !instance.token);
}

const rawArgs = process.argv.slice(2);

function hasInsecureFlag() {
  return rawArgs.includes("--insecure");
}

// Apply --insecure globally so all fetch() calls bypass self-signed certs
if (hasInsecureFlag()) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// Strip global flags from args before parsing commands
const args = rawArgs.filter((a) => a !== "--insecure");
const command = args[0];

if (!command) {
  printUsage();
  process.exit(0);
}

if (command === "--version" || command === "version") {
  const localCommit = getLocalCommit()?.slice(0, 7);
  const check = loadUpdateCheck();
  const remoteInfo = check.remoteCommit ? ` (latest: ${check.remoteCommit})` : "";
  console.log(`toj v${TOJ_VERSION}${localCommit ? ` (${localCommit})` : ""}${remoteInfo}`);
  process.exit(0);
}

if (command === "serve") {
  const portArg = args.find((a) => a.startsWith("--port="));
  const dataArg = args.find((a) => a.startsWith("--data="));
  const cliDir = path.dirname(new URL(import.meta.url).pathname);
  const serverPath = path.join(cliDir, "..", "dist", "server.js");
  if (!fs.existsSync(serverPath)) {
    console.error(`Server not found at ${serverPath}. Run 'npm run build' first.`);
    process.exit(1);
  }
  const serverArgs = [serverPath];
  if (portArg) serverArgs.push(portArg);
  if (dataArg) serverArgs.push(dataArg);
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, serverArgs, { stdio: "inherit" });
  } catch (e) {
    process.exit(e.status || 1);
  }
  process.exit(0);
}

if (command === "--update" || command === "update") {
  const { execSync } = await import("node:child_process");
  console.log(`Checking for updates...`);
  const result = await checkForUpdate(true);
  if (!result.updateAvailable) {
    console.log(`✓ You are on the latest version (${TOJ_VERSION}, ${result.localCommit || "local"}).`);
    process.exit(0);
  }
  console.log(`Updating ${result.localCommit} → ${result.remoteCommit}...`);
  try {
    const npmRoot = execSync(`npm root -g`, { encoding: "utf8" }).trim();
    const npmBin = path.join(path.dirname(npmRoot), "bin");
    const tojModulePath = path.join(npmRoot, "toj");
    const tojBinPath = path.join(npmBin, "toj");
    console.log(`  npm root: ${npmRoot}`);
    console.log(`  npm bin:  ${npmBin}`);

    // Step 1: Clean up any broken leftover symlinks from a previous failed install
    // (Known npm bug: `npm install -g git+https://...` leaves broken symlinks on macOS)
    console.log(`  [1/5] Cleaning up stale state...`);
    let cleanedSymlink = false;
    try {
      const stat = fs.lstatSync(tojModulePath);
      if (stat.isSymbolicLink()) {
        try { fs.statSync(tojModulePath); } catch {
          console.log(`  🧹 Removing broken symlink: ${tojModulePath}`);
          fs.unlinkSync(tojModulePath);
          cleanedSymlink = true;
        }
      }
    } catch { /* doesn't exist, fine */ }
    try {
      const binStat = fs.lstatSync(tojBinPath);
      if (binStat.isSymbolicLink()) {
        try { fs.statSync(tojBinPath); } catch {
          console.log(`  🧹 Removing broken bin symlink: ${tojBinPath}`);
          fs.unlinkSync(tojBinPath);
          cleanedSymlink = true;
        }
      }
    } catch { /* doesn't exist, fine */ }
    if (!cleanedSymlink) console.log(`  ✓ No stale symlinks found.`);

    // Step 2: Uninstall any existing install (best-effort)
    console.log(`  [2/5] Uninstalling previous version...`);
    try { execSync(`npm uninstall -g toj`, { stdio: "pipe" }); console.log(`  ✓ Uninstalled.`); } catch { console.log(`  ✓ Nothing to uninstall.`); }

    // Step 3: Clone to temp dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "toj-update-"));
    console.log(`  [3/5] Cloning ${UPDATE_REPO}#${UPDATE_BRANCH} → ${tmpDir}`);
    execSync(`git clone --depth 1 -b ${UPDATE_BRANCH} https://github.com/${UPDATE_REPO}.git ${tmpDir}`, { stdio: "inherit" });

    // Step 4: Pack into tarball and install from that (avoids npm symlink bugs on macOS)
    console.log(`  [4/5] Packing tarball...`);
    execSync(`npm pack --ignore-scripts`, { cwd: tmpDir, stdio: "pipe" });
    const tgz = fs.readdirSync(tmpDir).find(f => f.endsWith(".tgz"));
    if (!tgz) throw new Error("npm pack produced no tarball");
    const tgzPath = path.join(tmpDir, tgz);
    console.log(`  [5/5] Installing ${tgz}...`);
    execSync(`npm install -g "${tgzPath}"`, { stdio: "inherit" });

    // Cleanup temp dir (safe — tarball was copied by npm, not symlinked)
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    // Verify install
    try {
      const installed = execSync(`toj --version`, { encoding: "utf8" }).trim();
      console.log(`  ✓ Verified: ${installed}`);
    } catch {
      console.log(`  ⚠ Could not verify install (toj --version failed)`);
    }

    console.log(`✓ Updated to ${result.remoteCommit}.`);
  } catch (e) {
    console.error("✗ Update failed:", e.message);
    process.exit(1);
  }
  process.exit(0);
}

if (command === "--selfcheck" || command === "selfcheck") {
  const result = await checkForUpdate(true);
  console.log(`toj v${TOJ_VERSION}`);
  console.log(`  commit:  ${result.localCommit || "unknown"}`);
  console.log(`  remote:  ${result.remoteCommit || "unknown"}`);
  console.log(`  checked: ${result.lastCheck ? new Date(result.lastCheck).toISOString() : "never"}`);
  console.log(`  status:  ${result.updateAvailable ? "update available" : "up to date"}`);
  process.exit(0);
}

if (command === "register") {
  const [, name, urlOrBase, token] = args;
  if (!name || !urlOrBase) {
    console.error("Usage: toj register <name> <baseUrl> <token>");
    console.error("       toj register <name> <shareUrl>");
    process.exit(1);
  }

  const config = loadConfig();

  // Warn if overwriting existing instance with same name
  const existing = config.instances.find((i) => i.name === name);
  if (existing) {
    console.log(`⚠ Instance "${name}" already exists: ${existing.baseUrl}`);
    console.log(`  Updating to: ${urlOrBase}`);
  }

  // Check for duplicate baseUrl under different name
  const duplicate = config.instances.find((i) => i.name !== name && i.baseUrl === urlOrBase.replace(/\/$/, ""));
  if (duplicate) {
    console.log(`⚠ Warning: Same URL already registered as "${duplicate.name}"`);
  }

  config.instances = config.instances.filter((i) => i.name !== name);

  const shareMatch = urlOrBase.match(/^(https?:\/\/.+)\/s\/([a-z0-9]+)$/i);
  if (shareMatch) {
    config.instances.push({ name, baseUrl: shareMatch[1], shareId: shareMatch[2] });
    saveConfig(config);
    console.log(`Registered shared instance "${name}" at ${shareMatch[1]}`);
  } else {
    if (!token) {
      console.error("Usage: toj register <name> <baseUrl> <token>");
      process.exit(1);
    }

    // Validate URL is reachable
    const baseUrl = urlOrBase.replace(/\/$/, "");
    try {
      const checkUrl = `${baseUrl}/api/notes`;
      const checkResp = await fetch(checkUrl, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (checkResp.ok) {
        console.log(`✓ Server reachable, API key valid`);
      } else if (checkResp.status === 401 || checkResp.status === 403) {
        console.error(`✗ Server reachable but API key rejected (${checkResp.status})`);
        console.error(`  URL: ${checkUrl}`);
        process.exit(1);
      } else {
        // Could be HTML page (wrong path) or other error
        const contentType = checkResp.headers.get("content-type") || "";
        if (contentType.includes("text/html") && !baseUrl.includes("/jot")) {
          console.error(`✗ Got HTML instead of JSON. Is the baseUrl missing the path prefix?`);
          console.error(`  Try: jot register ${name} ${baseUrl}/jot <token>`);
          process.exit(1);
        }
        // Server might just not support HEAD on that endpoint, continue
        console.log(`⚠ Server responded with ${checkResp.status} — registering anyway`);
      }
    } catch (err) {
      const msg = err.cause?.code || err.message || String(err);
      console.error(`✗ Cannot reach ${baseUrl}: ${msg}`);
      if (msg.includes("certificate") || msg.includes("CERT") || msg.includes("UNABLE_TO_VERIFY")) {
        console.error(`  Self-signed cert? Retry with --insecure:`);
        console.error(`  toj --insecure register ${name} ${urlOrBase} <token>`);
      }
      process.exit(1);
    }

    config.instances.push({ name, baseUrl: urlOrBase, token });
    saveConfig(config);
    console.log(`Registered instance "${name}" at ${urlOrBase}`);
  }
  process.exit(0);
}

if (command === "unregister") {
  const name = args[1];
  if (!name) {
    console.error("Usage: toj unregister <name>");
    process.exit(1);
  }

  const config = loadConfig();
  const before = config.instances.length;
  config.instances = config.instances.filter((i) => i.name !== name);
  if (config.instances.length === before) {
    console.error(`Instance "${name}" not found.`);
    process.exit(1);
  }

  saveConfig(config);
  console.log(`Unregistered instance "${name}".`);
  process.exit(0);
}

if (command === "instances") {
  const config = loadConfig();
  if (config.instances.length === 0) {
    console.log("No registered instances.");
  } else {
    for (const instance of config.instances) {
      console.log(`${instance.name}  ${instance.baseUrl}`);
    }
  }
  process.exit(0);
}

const instanceName = command;
const subCommand = args[1];

if (!subCommand) {
  console.error(`Usage: toj <instance> <command> [args...]`);
  console.error(`Commands: list, search, read, create, edit, delete, update`);
  process.exit(1);
}

const instance = getInstance(instanceName);

if (isShareInstance(instance)) {
  const sid = instance.shareId;
  const plainArgs = args.filter((a) => !a.startsWith("--"));
  const nameArg = args.find((a) => a.startsWith("--name="));
  const agentName = nameArg ? nameArg.split("=").slice(1).join("=") : "Agent";

  switch (subCommand) {
    case "read": {
      const payload = await request(instance, "GET", `/api/share/${sid}/note`);
      const note = payload.note;
      console.log(`# ${note.title}`);
      console.log(`# id: ${note.id}`);
      console.log(`# updated: ${note.updatedAt}`);
      console.log(`# access: ${note.shareAccess}`);
      console.log();
      console.log(note.markdown);

      if (payload.threads && payload.threads.length > 0) {
        console.log();
        console.log("--- Comments ---");
        for (const thread of payload.threads) {
          const anchor = thread.anchor?.quote ? `"${thread.anchor.quote.slice(0, 60)}"` : "(no anchor)";
          console.log();
          console.log(`Thread ${thread.id} on ${anchor}${thread.resolved ? " [resolved]" : ""}`);
          for (const msg of thread.messages) {
            console.log(`  [${msg.id}] ${msg.authorName} (${msg.updatedAt}): ${msg.body}`);
          }
        }
      }
      break;
    }

    case "edit": {
      const editsJson = plainArgs[2];
      if (!editsJson) {
        console.error("Usage: toj <instance> edit '<json edits>'");
        process.exit(1);
      }
      let edits;
      try { edits = JSON.parse(editsJson); } catch { console.error("Invalid JSON."); process.exit(1); }
      const payload = await request(instance, "POST", `/api/share/${sid}/edit`, { edits });
      console.log(`Saved at ${payload.savedAt}`);
      break;
    }

    case "comment": {
      const quote = plainArgs[2];
      const body = plainArgs.slice(3).join(" ");
      if (!quote || !body) {
        console.error('Usage: toj <instance> comment <quote> <body>');
        process.exit(1);
      }
      const payload = await request(instance, "POST", `/api/share/${sid}/threads`, { anchor: { quote, prefix: "", suffix: "", start: 0, end: 0 }, body, name: agentName });
      console.log("Comment added");
      break;
    }

    case "reply": {
      const threadId = plainArgs[2];
      const messageId = plainArgs[3];
      const body = plainArgs.slice(4).join(" ");
      if (!threadId || !messageId || !body) {
        console.error("Usage: toj <instance> reply <threadId> <messageId> <body>");
        process.exit(1);
      }
      await request(instance, "POST", `/api/share/${sid}/threads/${threadId}/replies`, { body, name: agentName, parentMessageId: messageId });
      console.log("Reply added");
      break;
    }

    default:
      console.error(`Unknown command for shared instance: ${subCommand}`);
      console.error("Available: read, edit, comment, reply");
      process.exit(1);
  }
} else {

switch (subCommand) {
  case "list": {
    const payload = await request(instance, "GET", "/api/notes");
    for (const note of payload.notes) {
      console.log(`${note.id}\t${note.title}\t${note.updatedAt}`);
    }
    break;
  }

  case "search": {
    const query = args.slice(2).join(" ");
    if (!query) {
      console.error("Usage: toj <instance> search <query>");
      process.exit(1);
    }
    const payload = await request(instance, "GET", `/api/notes?q=${encodeURIComponent(query)}`);
    for (const note of payload.notes) {
      console.log(`${note.id}\t${note.title}\t${note.updatedAt}`);
    }
    break;
  }

  case "read": {
    const noteId = args[2];
    if (!noteId) {
      console.error("Usage: toj <instance> read <id> [--offset=N] [--limit=M]");
      process.exit(1);
    }

    const offsetArg = args.find((a) => a.startsWith("--offset="));
    const limitArg = args.find((a) => a.startsWith("--limit="));
    const offset = offsetArg ? offsetArg.split("=")[1] : null;
    const limit = limitArg ? limitArg.split("=")[1] : null;

    let endpoint = `/api/notes/${noteId}`;
    const params = [];
    if (offset) params.push(`offset=${offset}`);
    if (limit) params.push(`limit=${limit}`);
    if (params.length) endpoint += `?${params.join("&")}`;

    const payload = await request(instance, "GET", endpoint);
    const note = payload.note;

    if (note.content !== undefined) {
      console.log(`# ${note.title}`);
      console.log(`# id: ${note.id}`);
      console.log(`# lines: ${note.offset}-${note.offset + note.limit - 1} of ${note.totalLines}${note.remaining > 0 ? ` (${note.remaining} more)` : ""}`);
      console.log();
      console.log(note.content);
    } else {
      console.log(`# ${note.title}`);
      console.log(`# id: ${note.id}`);
      console.log(`# updated: ${note.updatedAt}`);
      console.log(`# share: ${note.shareUrl}`);
      console.log();
      console.log(note.markdown);

      if (payload.threads && payload.threads.length > 0) {
        console.log();
        console.log("--- Comments ---");
        for (const thread of payload.threads) {
          const anchor = thread.anchor?.quote ? `"${thread.anchor.quote.slice(0, 60)}"` : "(no anchor)";
          console.log();
          console.log(`Thread ${thread.id} on ${anchor}${thread.resolved ? " [resolved]" : ""}`);
          for (const msg of thread.messages) {
            console.log(`  [${msg.id}] ${msg.authorName} (${msg.updatedAt}): ${msg.body}`);
          }
        }
      }
    }
    break;
  }

  case "create": {
    const title = args.slice(2).join(" ") || "untitled";
    const payload = await request(instance, "POST", "/api/notes");
    if (title !== "untitled") {
      await request(instance, "PUT", `/api/notes/${payload.note.id}`, { title, markdown: "" });
    }
    console.log(`${payload.note.id}\t${title}`);
    break;
  }

  case "comment": {
    const noteId = args[2];
    const quote = args[3];
    const body = args.slice(4).join(" ");
    if (!noteId || !quote || !body) {
      console.error("Usage: toj <instance> comment <id> <quote> <body>");
      console.error('Example: toj myserver comment abc123 "some text" "my comment"');
      process.exit(1);
    }
    const payload = await request(instance, "POST", `/api/notes/${noteId}/threads`, { quote, body });
    console.log(`Comment added (thread ${payload.thread.id})`);
    break;
  }

  case "reply": {
    const noteId = args[2];
    const threadId = args[3];
    const messageId = args[4];
    const body = args.slice(5).join(" ");
    if (!noteId || !threadId || !messageId || !body) {
      console.error("Usage: toj <instance> reply <noteId> <threadId> <messageId> <body>");
      process.exit(1);
    }
    await request(instance, "POST", `/api/notes/${noteId}/threads/${threadId}/replies`, { body, parentMessageId: messageId });
    console.log("Reply added");
    break;
  }

  case "resolve": {
    const noteId = args[2];
    const threadId = args[3];
    if (!noteId || !threadId) {
      console.error("Usage: toj <instance> resolve <noteId> <threadId>");
      process.exit(1);
    }
    await request(instance, "PATCH", `/api/notes/${noteId}/threads/${threadId}`, { resolved: true });
    console.log("Thread resolved");
    break;
  }

  case "reopen": {
    const noteId = args[2];
    const threadId = args[3];
    if (!noteId || !threadId) {
      console.error("Usage: toj <instance> reopen <noteId> <threadId>");
      process.exit(1);
    }
    await request(instance, "PATCH", `/api/notes/${noteId}/threads/${threadId}`, { resolved: false });
    console.log("Thread reopened");
    break;
  }

  case "delete-thread": {
    const noteId = args[2];
    const threadId = args[3];
    if (!noteId || !threadId) {
      console.error("Usage: toj <instance> delete-thread <noteId> <threadId>");
      process.exit(1);
    }
    await request(instance, "DELETE", `/api/notes/${noteId}/threads/${threadId}`);
    console.log("Thread deleted");
    break;
  }

  case "edit-comment": {
    const noteId = args[2];
    const messageId = args[3];
    const body = args.slice(4).join(" ");
    if (!noteId || !messageId || !body) {
      console.error("Usage: toj <instance> edit-comment <noteId> <messageId> <body>");
      process.exit(1);
    }
    await request(instance, "PATCH", `/api/notes/${noteId}/messages/${messageId}`, { body });
    console.log("Comment edited");
    break;
  }

  case "delete-comment": {
    const noteId = args[2];
    const messageId = args[3];
    if (!noteId || !messageId) {
      console.error("Usage: toj <instance> delete-comment <noteId> <messageId>");
      process.exit(1);
    }
    await request(instance, "DELETE", `/api/notes/${noteId}/messages/${messageId}`);
    console.log("Comment deleted");
    break;
  }

  case "edit": {
    const noteId = args[2];
    const editsJson = args[3];
    if (!noteId || !editsJson) {
      console.error("Usage: toj <instance> edit <id> '<json edits>'");
      console.error('Example: toj myserver edit abc123 \'[{"oldText":"hello","newText":"world"}]\'');
      process.exit(1);
    }

    let edits;
    try {
      edits = JSON.parse(editsJson);
    } catch {
      console.error("Invalid JSON for edits.");
      process.exit(1);
    }

    const payload = await request(instance, "POST", `/api/notes/${noteId}/edit`, { edits });
    console.log(`Saved at ${payload.savedAt}`);
    break;
  }

  case "share": {
    const noteId = args[2];
    const access = args[3];
    if (!noteId) {
      console.error("Usage: toj <instance> share <id> [none|view|comment|edit]");
      process.exit(1);
    }
    if (!access) {
      const payload = await request(instance, "GET", `/api/notes/${noteId}`);
      const note = payload.note;
      console.log(`${note.id}\t${note.shareAccess}\t${note.shareUrl}`);
      break;
    }
    if (!["none", "view", "comment", "edit"].includes(access)) {
      console.error("Access must be one of: none, view, comment, edit");
      process.exit(1);
    }
    const sharePayload = await request(instance, "PUT", `/api/notes/${noteId}`, { shareAccess: access });
    const readPayload = await request(instance, "GET", `/api/notes/${noteId}`);
    console.log(`${noteId}\t${readPayload.note.shareAccess}\t${readPayload.note.shareUrl}`);
    break;
  }

  case "update": {
    const noteId = args[2];
    const field = args[3];
    const value = args.slice(4).join(" ");
    if (!noteId || !field || !value) {
      console.error("Usage: toj <instance> update <id> title <value>");
      console.error("       toj <instance> update <id> markdown <value>");
      process.exit(1);
    }

    const body = {};
    if (field === "title") {
      body.title = value;
      body.markdown = undefined;
      const current = await request(instance, "GET", `/api/notes/${noteId}`);
      body.markdown = current.note.markdown;
    } else if (field === "markdown") {
      body.markdown = value;
      const current = await request(instance, "GET", `/api/notes/${noteId}`);
      body.title = current.note.title;
    } else {
      console.error(`Unknown field: ${field}. Use 'title' or 'markdown'.`);
      process.exit(1);
    }

    const payload = await request(instance, "PUT", `/api/notes/${noteId}`, body);
    console.log(`Saved at ${payload.savedAt}`);
    break;
  }

  case "delete": {
    const noteId = args[2];
    if (!noteId) {
      console.error("Usage: toj <instance> delete <id>");
      process.exit(1);
    }
    await request(instance, "DELETE", `/api/notes/${noteId}`);
    console.log(`Deleted ${noteId}`);
    break;
  }

  default:
    console.error(`Unknown command: ${subCommand}`);
    printUsage();
    process.exit(1);
}

} // end owner mode

function printUsage() {
  console.log(`Usage: toj <command> [args...] [--insecure]

Global flags:
  --insecure          Skip TLS certificate verification (self-signed certs)

Server:
  toj serve [--port=N] [--data=path]      Run the toj server

Update:
  toj --update                            Update toj to latest from GitHub
  toj --selfcheck                         Show version and update status
  toj --version                           Show current version

Instance management:
  toj register <name> <baseUrl> <token>   Register with API key (owner)
  toj register <name> <shareUrl>          Register with share link
  toj unregister <name>                   Remove a registered instance
  toj instances                           List registered instances

Owner commands:
  toj <instance> list                     List all notes
  toj <instance> search <query>           Search notes
  toj <instance> read <id>                Read a note with comments
  toj <instance> create [title]           Create a new note
  toj <instance> share <id> [access]      Get/set share access (none|view|comment|edit)
  toj <instance> comment <id> <quote> <b> Comment on quoted text
  toj <instance> reply <id> <tid> <mid> b  Reply to a specific message
  toj <instance> resolve <id> <tid>        Resolve a thread
  toj <instance> reopen <id> <tid>         Reopen a thread
  toj <instance> edit-comment <id> <mid> b Edit a comment
  toj <instance> delete-comment <id> <mid> Delete a comment
  toj <instance> delete-thread <id> <tid>  Delete a thread
  toj <instance> edit <id> '<edits>'       Apply edits (JSON array of {oldText, newText})
  toj <instance> update <id> title <val>   Update note title
  toj <instance> update <id> markdown <v>  Replace full markdown
  toj <instance> delete <id>               Delete a note

Shared note commands:
  toj <instance> read                     Read the shared note
  toj <instance> edit '<edits>'           Edit (if edit access)
  toj <instance> comment <quote> <body>   Comment on text
  toj <instance> reply <tid> <mid> <body> Reply to a specific message
  Use --name="Name" to set display name for comments`);
}
