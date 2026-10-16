import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

type Row = Record<string, unknown>;
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
function money(cents: unknown): string {
  const n = Number(cents);
  return Number.isFinite(n) ? "$" + (n / 100).toFixed(2) : "—";
}
function fmtDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}
function panel(title: string, inner: string, id = ""): string {
  return '<section class="pixel-panel"' + (id ? ' id="' + esc(id) + '"' : "") + '><h2><span class="panel-mark">▸</span> ' + esc(title) + '</h2>' + inner + '</section>';
}
function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return '<p class="empty">Nothing logged yet. When the runtime is connected, real activity will appear here.</p>';
  return '<div class="table-wrap"><table><thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join("") + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + esc(cell) + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>';
}
function card(label: string, value: string, detail: string, icon: string): string {
  return '<div class="stat-card"><div class="stat-top"><span>' + esc(label) + '</span><span class="stat-icon">' + esc(icon) + '</span></div><div class="stat-value">' + esc(value) + '</div><div class="stat-detail">' + esc(detail) + '</div></div>';
}
function workerRoom(status: string, caption: string): string {
  return '<div class="worker-room"><div class="room-top"><span>ATLAS OFFICE / CAM 01</span><span class="cam-dot">● LIVE VIEW</span></div>' +
    '<svg class="office-scene" viewBox="0 0 520 270" role="img" aria-label="Pixel-art Atlas worker sitting at a desk in a small retro office">' +
    '<defs><pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#73917a" stroke-opacity=".14" stroke-width="1"/></pattern></defs>' +
    '<rect width="520" height="270" fill="#d9e8b1"/><rect width="520" height="208" fill="url(#grid)"/><rect x="26" y="28" width="104" height="72" fill="#31594b"/><rect x="34" y="36" width="88" height="56" fill="#a6c982"/><path d="M78 36V92M34 64H122" stroke="#31594b" stroke-width="4"/>' +
    '<rect x="370" y="32" width="112" height="92" fill="#a6c982"/><rect x="382" y="44" width="88" height="68" fill="#31594b"/><path d="M394 98L414 72L431 87L451 59L464 74" fill="none" stroke="#e8efbd" stroke-width="4"/>' +
    '<rect x="42" y="150" width="436" height="14" fill="#31594b"/><rect x="54" y="164" width="16" height="76" fill="#31594b"/><rect x="450" y="164" width="16" height="76" fill="#31594b"/>' +
    '<rect x="196" y="98" width="128" height="70" fill="#263e36"/><rect x="206" y="108" width="108" height="48" fill="#31594b"/><rect x="214" y="116" width="8" height="8" fill="#d9e8b1"/><rect x="230" y="116" width="8" height="8" fill="#d9e8b1"/><rect x="246" y="116" width="8" height="8" fill="#d9e8b1"/><rect x="214" y="132" width="68" height="5" fill="#a6c982"/><rect x="214" y="142" width="44" height="4" fill="#a6c982"/><rect x="250" y="168" width="20" height="10" fill="#263e36"/>' +
    '<rect x="226" y="64" width="64" height="32" fill="#e5b66c"/><rect x="218" y="72" width="80" height="30" fill="#e5b66c"/><rect x="226" y="54" width="64" height="20" fill="#31594b"/><rect x="218" y="62" width="16" height="16" fill="#31594b"/><rect x="282" y="62" width="16" height="16" fill="#31594b"/><rect x="234" y="78" width="8" height="8" fill="#263e36"/><rect x="274" y="78" width="8" height="8" fill="#263e36"/><rect x="246" y="88" width="24" height="5" fill="#b66e4c"/>' +
    '<rect x="202" y="100" width="32" height="36" fill="#477d69"/><rect x="282" y="100" width="32" height="36" fill="#477d69"/><rect x="224" y="102" width="64" height="34" fill="#477d69"/><rect x="230" y="134" width="18" height="16" fill="#e5b66c"/><rect x="264" y="134" width="18" height="16" fill="#e5b66c"/>' +
    '<rect x="116" y="124" width="26" height="26" fill="#31594b"/><rect x="106" y="138" width="46" height="12" fill="#477d69"/><rect x="124" y="110" width="10" height="14" fill="#a6c982"/><rect x="124" y="100" width="10" height="10" fill="#31594b"/>' +
    '<rect x="348" y="130" width="20" height="20" fill="#e5b66c"/><rect x="342" y="120" width="32" height="10" fill="#e5b66c"/><rect x="348" y="108" width="20" height="14" fill="#31594b"/>' +
    '<rect x="0" y="240" width="520" height="30" fill="#31594b"/><rect x="18" y="248" width="8" height="8" fill="#a6c982"/><rect x="34" y="248" width="8" height="8" fill="#a6c982"/><rect x="50" y="248" width="8" height="8" fill="#a6c982"/><text x="260" y="259" text-anchor="middle" font-size="10" font-family="monospace" fill="#d9e8b1">ATLAS // WORKER ZONE</text></svg>' +
    '<div class="room-status"><span class="status-square"></span><strong>' + esc(status) + '</strong><span>' + esc(caption) + '</span></div></div>';
}

export function renderDashboardOverview(): string {
  const home = process.env.HOME || "/root";
  const configPath = path.join(home, ".automaton", "automaton.json");
  const defaultDbPath = path.join(home, ".automaton", "state.db");
  let config: Record<string, unknown> | null = null;
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed;
    }
  } catch { config = null; }
  let dbPath = defaultDbPath;
  if (typeof config?.dbPath === "string" && config.dbPath.length) {
    dbPath = config.dbPath.startsWith("~") ? path.join(home, config.dbPath.slice(1)) : path.resolve(config.dbPath);
  }
  const configured = Boolean(config);
  const databasePresent = fs.existsSync(dbPath);
  const name = typeof config?.name === "string" ? config.name : "Atlas";
  const model = typeof config?.inferenceModel === "string" ? config.inferenceModel : "Not configured";
  let turnCount = "—", cost = "—", turnRows: string[][] = [], hbRows: string[][] = [], txnRows: string[][] = [], toolRows: string[][] = [];
  let latestState = "Waiting for runtime", latestActivity = "No runtime feed connected";
  let taskSummary = '<p class="empty">Connect the runtime database to populate real tasks, experiments, products, and tool activity.</p>';
  let extraPanels = "";
  let db: Database.Database | null = null;
  let dbError = "";
  if (configured && databasePresent) {
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 1500 });
      db.pragma("query_only = ON");
      const hasTable = (t: string) => Boolean(db!.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t));
      const count = (t: string) => hasTable(t) ? Number((db!.prepare("SELECT COUNT(*) AS n FROM " + t).get() as Row).n || 0) : 0;
      const latestTurn = hasTable("turns") ? db.prepare("SELECT timestamp,state,cost_cents FROM turns ORDER BY timestamp DESC LIMIT 1").get() as Row | undefined : undefined;
      turnCount = String(count("turns"));
      cost = money(hasTable("turns") ? (db.prepare("SELECT COALESCE(SUM(cost_cents),0) AS n FROM turns").get() as Row).n : 0);
      latestState = latestTurn?.state ? String(latestTurn.state) : "No turns yet";
      latestActivity = latestTurn?.timestamp ? fmtDate(latestTurn.timestamp) : "No activity recorded";
      turnRows = hasTable("turns") ? (db.prepare("SELECT timestamp,state,input_source,cost_cents FROM turns ORDER BY timestamp DESC LIMIT 10").all() as Row[]).map(r => [fmtDate(r.timestamp), String(r.state || "—"), String(r.input_source || "—"), money(r.cost_cents)]) : [];
      hbRows = hasTable("heartbeat_schedule") ? (db.prepare("SELECT task_name,enabled,last_result,last_run_at,next_run_at,fail_count FROM heartbeat_schedule ORDER BY task_name LIMIT 20").all() as Row[]).map(r => [String(r.task_name), Number(r.enabled) ? "Enabled" : "Disabled", String(r.last_result || "Not run"), fmtDate(r.last_run_at), String(r.fail_count || 0)]) :
        hasTable("heartbeat_entries") ? (db.prepare("SELECT name,enabled,last_run,next_run FROM heartbeat_entries ORDER BY name LIMIT 20").all() as Row[]).map(r => [String(r.name), Number(r.enabled) ? "Enabled" : "Disabled", "Legacy schedule", fmtDate(r.last_run), "—"]) : [];
      txnRows = hasTable("transactions") ? (db.prepare("SELECT created_at,type,amount_cents,description FROM transactions ORDER BY created_at DESC LIMIT 10").all() as Row[]).map(r => [fmtDate(r.created_at), String(r.type), money(r.amount_cents), String(r.description || "").slice(0, 180)]) : [];
      toolRows = hasTable("tool_calls") ? (db.prepare("SELECT created_at,name,duration_ms,error FROM tool_calls ORDER BY created_at DESC LIMIT 12").all() as Row[]).map(r => [fmtDate(r.created_at), String(r.name), String(r.duration_ms || 0) + " ms", r.error ? String(r.error).slice(0, 120) : "OK"]) : [];
      const taskTables = ["goals", "tasks", "experiments", "products"].filter(hasTable);
      taskSummary = taskTables.length ? '<p>Found runtime work tables: ' + taskTables.map(esc).join(", ") + '.</p>' : '<p class="empty">No task/product tables found in the connected database.</p>';
      extraPanels = panel("Worker schedule", table(["Job", "State", "Last result", "Last run", "Failures"], hbRows)) +
        panel("Recent tool activity", '<p class="panel-note">This is the real recorded tool feed, not a simulated screen capture.</p>' + table(["Time", "Tool", "Duration", "Result"], toolRows), "vision-feed") +
        panel("Financial ledger", '<p class="panel-note">Recorded transactions are shown below. Verified sales stay at $0.00 until a sales receipt source is connected.</p>' + table(["Time", "Type", "Amount", "Description"], txnRows));
    } catch { dbError = "The state database exists but could not be opened. Check the mount path, permissions, and schema."; }
    finally { try { db?.close(); } catch {} }
  }
  const connected = configured && databasePresent && !dbError;
  const stateLabel = connected ? "RUNTIME CONNECTED" : "RUNTIME OFFLINE";
  const stateCaption = connected ? "Database reachable · process health not yet verified" : "Dashboard online · worker runtime not connected";
  const statCards = [
    card("Worker turns", turnCount, connected ? "Recorded runtime turns" : "Waiting for runtime connection", "↻"),
    card("Inference spend", cost, connected ? "Recorded model costs only" : "No cost feed connected", "¤"),
    card("Verified revenue", "$0.00", "No verified sales ledger connected", "$"),
    card("Task queue", "—", "No live queue connected yet", "▤")
  ].join("");
  const screenContent = connected
    ? '<div class="terminal-line"><span class="term-prompt">&gt;</span> runtime.db opened read-only</div><div class="terminal-line"><span class="term-prompt">&gt;</span> last turn: ' + esc(latestState) + '</div><div class="terminal-line"><span class="term-prompt">&gt;</span> last activity: ' + esc(latestActivity) + '</div><div class="terminal-line term-dim">&gt; use the tool feed below to inspect recorded actions</div>'
    : '<div class="terminal-line"><span class="term-prompt">&gt;</span> atlas --connect-runtime</div><div class="terminal-line">waiting for worker process...</div><div class="terminal-line">state: <span class="term-warn">NOT CONNECTED</span></div><div class="terminal-line term-dim">This panel will show real runtime events when storage is attached.</div>';
  const screenPanel = '<section class="pixel-panel screen-panel"><h2><span class="panel-mark">▸</span> WHAT ATLAS SEES <span class="tiny-badge">RUNTIME FEED</span></h2><div class="terminal-screen" aria-live="polite">' + screenContent + '</div><div class="screen-footer"><span>MODE: READ-ONLY</span><span>LAST EVENT: ' + esc(latestActivity) + '</span></div></section>';
  const connectionNote = dbError ? dbError : !configured ? "The dashboard is deployed, but the autonomous runtime is not configured inside this service. The worker scene is a visual representation; it does not mean an agent is currently running." : !databasePresent ? "Runtime configuration was found, but its state database is missing. Attach the persistent runtime volume at the configured path to show actual observations and actions." : "The database is connected. The dashboard still does not claim the agent process is alive unless a runtime heartbeat can verify it.";
  return '<div class="game-ui">' +
    '<header class="game-header"><div class="brand-block"><div class="brand-icon">A<span>+</span></div><div><p class="eyebrow">AUTONOMOUS BUSINESS SIMULATOR</p><h1>' + esc(name) + '<span class="version-tag">v0.1</span></h1><p class="header-sub">Your tiny worker. Your big plans.</p></div></div><div class="header-status"><span class="status-light"></span><div><strong>' + stateLabel + '</strong><small>' + esc(stateCaption) + '</small></div></div></header>' +
    '<div class="game-layout"><div class="left-column">' +
    workerRoom(stateLabel, connected ? "Reading recorded state · not a live desktop capture" : "Idle animation concept · waiting for real worker connection") +
    '<div class="stat-grid">' + statCards + '</div>' +
    screenPanel +
    panel("Mission board", '<div class="mission-row"><span class="mission-check">□</span><div><strong>Find a zero-cost opportunity</strong><small>Research · validate with evidence · no spending</small></div><span class="mission-state">PLANNED</span></div><div class="mission-row"><span class="mission-check">□</span><div><strong>Build a tiny prototype</strong><small>Private tests only · no customer data</small></div><span class="mission-state">PLANNED</span></div><div class="mission-row"><span class="mission-check">□</span><div><strong>Connect real worker telemetry</strong><small>Required for live screen and task controls</small></div><span class="mission-state active">NEXT UP</span></div>') +
    '</div><aside class="right-column">' +
    panel("Worker console", '<div class="console-row"><span>Agent</span><strong>' + esc(name) + '</strong></div><div class="console-row"><span>Model</span><strong>' + esc(model) + '</strong></div><div class="console-row"><span>Runtime DB</span><strong class="' + (connected ? 'good-text' : 'warn-text') + '">' + (connected ? 'CONNECTED' : 'MISSING') + '</strong></div><div class="console-row"><span>Latest state</span><strong>' + esc(latestState) + '</strong></div><div class="console-row"><span>Last event</span><strong>' + esc(latestActivity) + '</strong></div><button class="pixel-button" type="button" disabled title="Pause becomes available after the worker control API is connected">Ⅱ PAUSE WORKER <small>NOT CONNECTED</small></button><button class="pixel-button secondary" type="button" disabled title="A live desktop capture is not connected">▣ OPEN LIVE SCREEN <small>NOT CONNECTED</small></button><p class="panel-note">Controls are disabled until they can safely control a real worker. No pretend buttons.</p>') +
    panel("Activity log", table(["Time", "State", "Source", "Cost"], turnRows.slice(0, 6))) +
    panel("Connection check", '<p class="connection-note">' + esc(connectionNote) + '</p><div class="check-row"><span>Dashboard</span><b class="good-text">ONLINE</b></div><div class="check-row"><span>Runtime config</span><b class="' + (configured ? 'good-text' : 'warn-text') + '">' + (configured ? 'FOUND' : 'MISSING') + '</b></div><div class="check-row"><span>State database</span><b class="' + (databasePresent && !dbError ? 'good-text' : 'warn-text') + '">' + (databasePresent && !dbError ? 'FOUND' : 'MISSING') + '</b></div><div class="check-row"><span>Agent process</span><b class="warn-text">UNVERIFIED</b></div>') +
    '</aside></div>' + extraPanels +
    '<footer class="game-footer"><span>ATLAS WORKSTATION // BUILD SMALL, LEARN FAST</span><span>NO SPENDING · NO OUTREACH WITHOUT APPROVAL</span><a href="/logout">SIGN OUT ↗</a></footer></div>';
}
