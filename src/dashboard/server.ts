import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { renderDashboardOverview } from "./overview.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const sessions = new Map<string, number>();
const failures = new Map<string, { count: number; resetAt: number }>();

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function send(res: ServerResponse, status: number, body: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...extra,
  });
  res.end(body);
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head>${title === "Private dashboard" ? '<meta http-equiv="refresh" content="30">' : ""}<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)} · Atlas</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#edf0f7;font:16px system-ui,-apple-system,sans-serif;padding:24px}
  main{width:min(100%,440px);padding:32px;border:1px solid #2a3040;border-radius:18px;background:#121722;box-shadow:0 24px 80px #0005}main:has(.overview-head){width:min(100%,1400px);align-self:start;margin:24px auto}h1{margin:0 0 8px;font-size:28px}p{color:#aeb8ca;line-height:1.55}.muted{font-size:13px;color:#8792a8}label{display:block;margin:22px 0 8px}input{width:100%;padding:13px 14px;border-radius:10px;border:1px solid #394256;background:#0b0d12;color:#fff;font:inherit}button,.button{display:inline-block;width:100%;margin-top:16px;padding:13px;border:0;border-radius:10px;background:#dce6ff;color:#111827;font-weight:700;font:inherit;text-align:center;cursor:pointer;text-decoration:none} .notice{padding:12px;border-radius:10px;background:#202b40;color:#dce6ff}.overview-head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:24px}.overview-head h1{font-size:32px}.eyebrow{font-size:11px;letter-spacing:.16em;color:#91a7d9;font-weight:700;margin:0 0 8px}.subhead{margin:0}.pill{display:inline-block;white-space:nowrap;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700}.pill.good{background:#173b2e;color:#9ce6c0}.pill.warn{background:#4a321b;color:#ffd19a}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}.metric,.panel{border:1px solid #2a3040;border-radius:14px;background:#121722;padding:18px;min-width:0}.metric-label{font-size:12px;color:#aeb8ca}.metric-value{font-size:24px;font-weight:750;margin:8px 0;overflow-wrap:anywhere}.metric-detail,.footnote,.empty{font-size:12px;color:#8792a8;line-height:1.5}.panel{margin:16px 0}.panel h2{font-size:17px;margin:0 0 14px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px;border-bottom:1px solid #252c3b;vertical-align:top}th{color:#aeb8ca;font-weight:600}td{overflow-wrap:anywhere}.checklist{padding-left:20px;color:#c7d0e1;line-height:1.8}.footnote{margin-top:24px}@media(max-width:760px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.overview-head{align-items:flex-start;flex-direction:column}main{padding:20px}}@media(max-width:420px){.metrics{grid-template-columns:1fr}.metric-value{font-size:22px}}
  </style></head><body><main>${body}</main></body></html>`;
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

function sign(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

function cookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || "";
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

function isAuthenticated(req: IncomingMessage, secret: string): boolean {
  const value = cookies(req).atlas_session;
  if (!value) return false;
  const split = value.lastIndexOf(".");
  if (split < 1) return false;
  const token = value.slice(0, split);
  const supplied = Buffer.from(value.slice(split + 1));
  const expected = Buffer.from(sign(token, secret));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

async function readBody(req: IncomingMessage, limit = 4096): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (body.length > limit) throw new Error("Request body too large");
  }
  return body;
}

function clientKey(req: IncomingMessage): string {
  // Do not trust X-Forwarded-For unless the deployment explicitly configures a trusted proxy.
  return req.socket.remoteAddress || "unknown";
}

export function startDashboardServer(): void {
  const password = process.env.ATLAS_DASHBOARD_PASSWORD;
  if (!password || password.length < 20) {
    throw new Error("Set ATLAS_DASHBOARD_PASSWORD to a unique password of at least 20 characters before starting the dashboard.");
  }
  const sessionSecret = process.env.ATLAS_DASHBOARD_SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("Set ATLAS_DASHBOARD_SESSION_SECRET to a random secret of at least 32 characters before starting the dashboard.");
  }

  const port = Number(process.env.PORT || process.env.ATLAS_DASHBOARD_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Dashboard port must be a valid TCP port.");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;
      const secure = cookieSecure();
      const cookieFlags = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? "; Secure" : ""}`;
      const clearCookie = `atlas_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;

      if (req.method === "GET" && path === "/healthz") {
        send(res, 200, "ok", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }

      if (req.method === "GET" && path === "/logout") {
        const value = cookies(req).atlas_session;
        if (value) sessions.delete(value.slice(0, value.lastIndexOf(".")));
        res.writeHead(303, { Location: "/login", "Set-Cookie": clearCookie, "Cache-Control": "no-store" });
        res.end();
        return;
      }

      if (req.method === "GET" && path === "/login") {
        if (isAuthenticated(req, sessionSecret)) {
          res.writeHead(303, { Location: "/" }); res.end(); return;
        }
        send(res, 200, page("Owner login", `<h1>Atlas</h1><p>Private owner access</p>${url.searchParams.has("error") ? '<p class="notice" role="alert">Login failed. Check your password or wait before trying again.</p>' : ""}<form method="post" action="/login"><label for="password">Owner password</label><input id="password" name="password" type="password" autocomplete="current-password" required minlength="20" autofocus><button type="submit">Sign in</button></form><p class="muted">There is no public registration. Only the configured owner password can sign in.</p>`));
        return;
      }

      if (req.method === "POST" && path === "/login") {
        const origin = req.headers.origin;
        const referer = req.headers.referer;
        const host = req.headers.host;
        let requestHost = "";
        try {
          if (origin && origin !== "null") requestHost = new URL(origin).host;
          else if (referer) requestHost = new URL(referer).host;
        } catch {
          requestHost = "";
        }
        if (!requestHost || !host || requestHost.toLowerCase() !== host.toLowerCase()) {
          send(res, 403, page("Forbidden", "<h1>Request blocked</h1><p>Refresh the login page and try again.</p>"));
          return;
        }
        const key = clientKey(req);
        const now = Date.now();
        let rate = failures.get(key);
        if (!rate || rate.resetAt <= now) rate = { count: 0, resetAt: now + RATE_WINDOW_MS };
        if (rate.count >= MAX_FAILURES) {
          failures.set(key, rate);
          send(res, 429, page("Try later", "<h1>Please wait</h1><p>Too many login attempts. Try again in 15 minutes.</p>"), { "Retry-After": String(Math.ceil((rate.resetAt - now) / 1000)) });
          return;
        }
        const form = new URLSearchParams(await readBody(req));
        const suppliedPassword = form.get("password") || "";
        // Compare fixed-length digests so the comparison itself does not reveal password length.
        const expectedDigest = createHash("sha256").update(password).digest();
        const suppliedDigest = createHash("sha256").update(suppliedPassword).digest();
        const valid = timingSafeEqual(expectedDigest, suppliedDigest) && suppliedPassword.length === password.length;
        if (!valid) {
          rate.count += 1;
          failures.set(key, rate);
          send(res, 303, "", { Location: "/login?error=1", "Cache-Control": "no-store" });
          return;
        }
        failures.delete(key);
        const token = randomBytes(32).toString("base64url");
        sessions.set(token, now + SESSION_TTL_MS);
        res.writeHead(303, { Location: "/", "Set-Cookie": `atlas_session=${token}.${sign(token, sessionSecret)}; ${cookieFlags}`, "Cache-Control": "no-store" });
        res.end();
        return;
      }

      if (req.method === "GET" && path === "/" && isAuthenticated(req, sessionSecret)) {
        send(res, 200, page("Private dashboard", renderDashboardOverview()));
        return;
      }

      if (req.method === "GET" && path === "/") {
        res.writeHead(303, { Location: "/login", "Cache-Control": "no-store" }); res.end(); return;
      }

      send(res, 404, page("Not found", '<h1>Not found</h1><p>The requested page does not exist.</p>'));
    } catch {
      send(res, 400, page("Bad request", "<h1>Request could not be processed</h1><p>Please return to the login page and try again.</p>"));
    }
  });

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [token, expiry] of sessions) if (expiry <= now) sessions.delete(token);
    for (const [key, value] of failures) if (value.resetAt <= now) failures.delete(key);
  }, 60_000);
  sweep.unref();
  server.on("close", () => clearInterval(sweep));
  server.listen(port, "0.0.0.0", () => {
    console.log(`Atlas private dashboard listening on port ${port}`);
  });
}
