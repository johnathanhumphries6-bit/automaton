import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

type Row = Record<string, unknown>;

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c] as string);
}

function money(cents: unknown): string {
  const n = Number(cents);
  return Number.isFinite(n) ? "$" + (n / 100).toFixed(2) : "—";
}

function fmtDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function panel(title: string, inner: string): string {
  return '<section class="panel"><h2>' + esc(title) + '</h2>' + inner + '</section>';
}

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return '<p class="empty">No records yet.</p>';
  return '<div class="table-wrap"><table><thead><tr>' + headers.map((h) => '<th>' + esc(h) + '</th>').join("") + '</tr></thead><tbody>' +
    rows.map((row) => '<tr>' + row.map((cell) => '<td>' + esc(cell) + '</td>').join("") + '</tr>').join("") +
    '</tbody></table></div>';
}

function card(label: string, value: string, detail: string): string {
  return '<div class="metric"><div class="metric-label">' + esc(label) + '</div><div class="metric-value">' + esc(value) + '</div><div class="metric-detail">' + esc(detail) + '</div></div>';
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
  } catch {
    config = null;
  }

  let dbPath = defaultDbPath;
  if (typeof config?.dbPath === "string" && config.dbPath.length) {
    dbPath = config.dbPath.startsWith("~")
      ? path.join(home, config.dbPath.slice(1))
      : path.resolve(config.dbPath);
  }

  const configured = Boolean(config);
  const databasePresent = fs.existsSync(dbPath);
  const stateDir = path.dirname(configPath);
  const state = configured && databasePresent ? "State database found" : configured ? "Configured · database missing" : "Runtime not configured";
  const name = typeof config?.name === "string" ? config.name : "Atlas";
  const model = typeof config?.inferenceModel === "string" ? config.inferenceModel : "Not configured";
  const cards: string[] = [
    card("Runtime", configured && databasePresent ? "Connected" : "Not connected", state),
    card("Agent turns", "—", "No readable runtime database"),
    card("Recorded inference cost", "—", "Unavailable until runtime state is connected"),
    card("Verified revenue", "$0.00", "No verified sales ledger is connected"),
  ];

  if (!configured || !databasePresent) {
    const message = !configured
      ? "This dashboard is healthy, but the Atlas runtime has not been configured in this service. The agent is not running here. Configure the runtime and persist its .automaton state on a Railway volume before enabling autonomous work."
      : "Runtime configuration exists, but the SQLite state database was not found at the configured path. Mount the persistent runtime volume at the same path and redeploy. The dashboard will not invent activity, costs, products, or revenue.";
    return '<div class="overview-head"><div><p class="eyebrow">PRIVATE CONTROL PLANE</p><h1>' + esc(name) + '</h1><p class="subhead">Live operational overview · refresh this page for latest data</p></div><span class="pill warn">Runtime disconnected</span></div>' +
      '<div class="metrics">' + cards.join("") + '</div>' +
      panel("Action required", '<p>' + esc(message) + '</p><ul class="checklist"><li>Attach durable storage for the runtime state.</li><li>Provide runtime configuration and authorized inference credentials through Railway variables or mounted secrets; never put secrets in source code.</li><li>Keep spending and external actions disabled until their limits and approval gates are configured.</li><li>Run a private test, then verify real activity and cost records appear here.</li></ul>') +
      panel("Connection diagnostics", table(["Check", "Result"], [
        ["Runtime config", configured ? "Found" : "Not found at " + configPath],
        ["State database", databasePresent ? "Found" : "Not found at " + dbPath],
        ["State directory", fs.existsSync(stateDir) ? "Exists" : "Missing"],
        ["Agent process", "Not verified by the dashboard process"],
      ])) +
      '<p class="footnote">This panel reports only evidence available to this service. A successful dashboard health check does not mean the autonomous agent is running.</p>';
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 1500 });
    db.pragma("query_only = ON");
    const hasTable = (name: string) => Boolean(db!.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    const count = (name: string) => hasTable(name) ? Number((db!.prepare("SELECT COUNT(*) AS n FROM " + name).get() as Row).n || 0) : 0;
    const latestTurn = hasTable("turns") ? db.prepare("SELECT timestamp,state,cost_cents FROM turns ORDER BY timestamp DESC LIMIT 1").get() as Row | undefined : undefined;
    const turnCount = count("turns");
    const cost = hasTable("turns") ? Number((db.prepare("SELECT COALESCE(SUM(cost_cents),0) AS n FROM turns").get() as Row).n || 0) : 0;
    const lastState = latestTurn?.state ? String(latestTurn.state) : "No turns yet";
    const lastActivity = latestTurn?.timestamp ? fmtDate(latestTurn.timestamp) : "No activity recorded";
    cards[0] = card("Runtime", "Connected", "Read-only SQLite connection");
    cards[1] = card("Agent turns", String(turnCount), "Latest state: " + lastState);
    cards[2] = card("Recorded inference cost", money(cost), "Recorded in turns table; not necessarily all operating costs");
    cards[3] = card("Verified revenue", "$0.00", "No verified sales ledger is connected");

    const identityRows: string[][] = [
      ["Agent name", name],
      ["Configured model", model],
      ["Last recorded turn", lastActivity],
      ["Latest recorded state", lastState],
      ["Runtime state DB", dbPath],
    ];

    const turnRows = hasTable("turns")
      ? (db.prepare("SELECT timestamp,state,input_source,cost_cents FROM turns ORDER BY timestamp DESC LIMIT 10").all() as Row[]).map((r) => [fmtDate(r.timestamp), String(r.state || "—"), String(r.input_source || "—"), money(r.cost_cents)])
      : [];
    const hbRows = hasTable("heartbeat_schedule")
      ? (db.prepare("SELECT task_name,enabled,last_result,last_run_at,next_run_at,fail_count FROM heartbeat_schedule ORDER BY task_name LIMIT 20").all() as Row[]).map((r) => [String(r.task_name), Number(r.enabled) ? "Enabled" : "Disabled", String(r.last_result || "Not run"), fmtDate(r.last_run_at), String(r.fail_count || 0)])
      : hasTable("heartbeat_entries")
        ? (db.prepare("SELECT name,enabled,last_run,next_run FROM heartbeat_entries ORDER BY name LIMIT 20").all() as Row[]).map((r) => [String(r.name), Number(r.enabled) ? "Enabled" : "Disabled", "Legacy schedule", fmtDate(r.last_run), "—"])
        : [];
    const txnRows = hasTable("transactions")
      ? (db.prepare("SELECT created_at,type,amount_cents,description FROM transactions ORDER BY created_at DESC LIMIT 10").all() as Row[]).map((r) => [fmtDate(r.created_at), String(r.type), money(r.amount_cents), String(r.description || "").slice(0, 180)])
      : [];
    const taskTables = ["goals", "tasks", "experiments", "products"].filter(hasTable);
    const taskSummary = taskTables.length
      ? '<p>Available work-tracking tables: ' + taskTables.map(esc).join(", ") + '.</p>'
      : '<p class="empty">No goals, task, experiment, or product tables were found in the connected database. These records are not currently available to this dashboard.</p>';
    const toolRows = hasTable("tool_calls")
      ? (db.prepare("SELECT created_at,name,duration_ms,error FROM tool_calls ORDER BY created_at DESC LIMIT 10").all() as Row[]).map((r) => [fmtDate(r.created_at), String(r.name), String(r.duration_ms || 0) + " ms", r.error ? String(r.error).slice(0, 120) : "OK"])
      : [];

    return '<div class="overview-head"><div><p class="eyebrow">PRIVATE CONTROL PLANE</p><h1>' + esc(name) + '</h1><p class="subhead">Live operational overview · refresh this page for latest data</p></div><span class="pill good">State connected</span></div>' +
      '<div class="metrics">' + cards.join("") + '</div>' +
      panel("Runtime identity", table(["Field", "Value"], identityRows)) +
      panel("Recent agent turns", table(["Timestamp", "State", "Source", "Recorded cost"], turnRows)) +
      panel("Heartbeat schedule", table(["Task", "Status", "Last result", "Last run", "Failures"], hbRows)) +
      panel("Recent tool activity", table(["Timestamp", "Tool", "Duration", "Result"], toolRows)) +
      panel("Financial records", '<p class="notice">The runtime schema records compute and transaction activity, but no dedicated verified customer-sales ledger was found. Revenue remains $0.00 here until actual sales receipts are integrated.</p>' + table(["Timestamp", "Type", "Amount", "Description"], txnRows)) +
      panel("Goals, tasks, products & experiments", taskSummary) +
      '<p class="footnote">Read-only view. No secrets, wallet keys, raw prompts, or private reasoning are displayed. Recorded inference cost is not a complete accounting of hosting or external spend.</p>';
  } catch {
    return '<div class="overview-head"><div><p class="eyebrow">PRIVATE CONTROL PLANE</p><h1>' + esc(name) + '</h1><p class="subhead">Operational overview</p></div><span class="pill warn">Database error</span></div>' +
      panel("Runtime state unavailable", '<p>The state database exists but could not be opened safely in read-only mode. No metrics are fabricated. Verify database permissions, mount path, and schema version.</p>') +
      panel("Connection diagnostics", table(["Check", "Result"], [["Runtime config", "Found"], ["State database", dbPath], ["Configured model", model]]));
  } finally {
    try { db?.close(); } catch {}
  }
}
