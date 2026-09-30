import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { approvalToken, isValidKey, keyForEmail, readApprovalToken } from "../lib/keys.js";
import { isAuthorized } from "../lib/http.js";
import { createAppServer } from "../server.js";

const SECRET = "test-secret-0123456789abcdef";
const HOOK = "https://discord.com/api/webhooks/123/abcDEF_-token";
const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ["APP_PASSWORD", "REVOKED_KEYS", "BREVO_API_KEY", "RESEND_API_KEY", "MAIL_FROM", "DISCORD_WEBHOOK_URL"]) delete process.env[k];
  process.env.ACCESS_KEY_SECRET = SECRET;
});

test("keys: format, deterministic per email, signature checked", () => {
  const key = keyForEmail("Buyer@Example.com ");
  assert.match(key, /^S2S-[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  assert.equal(key, keyForEmail("buyer@example.com"));
  assert.notEqual(key, keyForEmail("other@example.com"));
  assert.ok(isValidKey(key));
  assert.ok(isValidKey(key.toLowerCase().replace(/-/g, " "))); // forgiving about typing
  const tampered = key.slice(0, -1) + (key.endsWith("A") ? "B" : "A");
  assert.ok(!isValidKey(tampered));
  assert.ok(!isValidKey(""));
  process.env.REVOKED_KEYS = `foo, ${key}`;
  assert.ok(!isValidKey(key));
  delete process.env.REVOKED_KEYS;
  process.env.ACCESS_KEY_SECRET = "different-secret-0123456789";
  assert.ok(!isValidKey(key)); // rotating the secret invalidates old keys
});

test("approval tokens: round trip, tamper-proof, expire", () => {
  const t = approvalToken({ email: "a@b.co", messageId: "42" });
  assert.deepEqual(readApprovalToken(t), { email: "a@b.co", messageId: "42" });
  const [p, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ e: "evil@b.co", m: "", x: Date.now() + 1e9 })).toString("base64url");
  assert.equal(readApprovalToken(`${forged}.${sig}`), null);
  assert.equal(readApprovalToken(`${p}.x${sig}`), null);
  assert.equal(readApprovalToken(approvalToken({ email: "a@b.co" }, -1)), null);
});

test("auth: open without secrets; key or master code once enabled", () => {
  const req = (code) => ({ headers: { "x-access-code": code } });
  delete process.env.ACCESS_KEY_SECRET;
  assert.ok(isAuthorized(req("")));
  process.env.ACCESS_KEY_SECRET = SECRET;
  assert.ok(!isAuthorized(req("")));
  assert.ok(isAuthorized(req(keyForEmail("x@y.com"))));
  process.env.APP_PASSWORD = "master";
  assert.ok(isAuthorized(req("master")));
  assert.ok(isAuthorized(req(keyForEmail("x@y.com"))));
  assert.ok(!isAuthorized(req("nope")));
});

test("request → Discord → approve → email, end to end over HTTP", async (t) => {
  process.env.DISCORD_WEBHOOK_URL = HOOK;
  process.env.BREVO_API_KEY = "brevo-key";
  process.env.MAIL_FROM = "Scan2Sell <owner@gmail.com>";
  const server = createAppServer().listen(0);
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith(base)) return realFetch(url, opts);
    calls.push({ url: u, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    if (u.startsWith(HOOK) && opts.method === "POST") return new Response(JSON.stringify({ id: "999" }), { status: 200 });
    if (u.startsWith(HOOK)) return new Response(JSON.stringify({ id: "999" }), { status: 200 });
    if (u.includes("api.brevo.com")) return new Response(JSON.stringify({ messageId: "m1" }), { status: 201 });
    return new Response("{}", { status: 404 });
  };
  const request = (body) => realFetch(`${base}/api/key-request`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify(body),
  });

  // health advertises the feature; nobody is authorized yet
  const health = await (await realFetch(`${base}/api/health`)).json();
  assert.deepEqual([health.authRequired, health.authorized, health.keyRequests, health.keyEmails], [true, false, true, true]);
  // protected endpoints now need a key
  assert.equal((await realFetch(`${base}/api/upc`, { method: "POST", body: "{}" })).status, 401);

  assert.equal((await request({ email: "not-an-email" })).status, 400);
  assert.equal((await request({ email: "bot@x.com", website: "spam" })).status, 200); // honeypot: silently dropped
  assert.equal(calls.length, 0);

  const ok = await request({ email: "Buyer@Example.com" });
  assert.equal(ok.status, 200);
  assert.equal((await request({ email: "buyer@example.com" })).status, 429); // duplicate within 10 min

  const [post, patch] = calls;
  assert.equal(post.url, `${HOOK}?wait=true`);
  assert.match(post.body.embeds[0].description, /buyer@example\.com/);
  assert.deepEqual(post.body.allowed_mentions, { parse: [] });
  assert.equal(patch.url, `${HOOK}/messages/999?with_components=true`);
  const button = patch.body.components[0].components[0];
  assert.equal(button.style, 5); // link button
  assert.ok(button.url.startsWith(`${base}/api/key-approve?t=`));

  // Opening the Discord link only shows a confirmation page
  const confirm = await realFetch(button.url);
  assert.match(await confirm.text(), /Approve access\?[\s\S]*buyer@example\.com/);
  assert.equal(calls.length, 2);

  // Approving emails the key and marks the Discord message approved
  const token = new URL(button.url).searchParams.get("t");
  const done = await realFetch(`${base}/api/key-approve`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ t: token }),
  });
  const html = await done.text();
  const key = keyForEmail("buyer@example.com");
  assert.match(html, /key emailed/);
  assert.ok(html.includes(key));
  const mail = calls.find((c) => c.url.includes("brevo"));
  assert.deepEqual(mail.body.to, [{ email: "buyer@example.com" }]);
  assert.deepEqual(mail.body.sender, { name: "Scan2Sell", email: "owner@gmail.com" });
  assert.ok(mail.body.textContent.includes(key));
  assert.ok(mail.body.htmlContent.includes(`/#/key/${key}`));
  const approved = calls.at(-1);
  assert.equal(approved.method, "PATCH");
  assert.match(approved.body.embeds[0].title, /approved/);
  assert.deepEqual(approved.body.components, []);

  // The emailed key unlocks the API
  const h2 = await (await realFetch(`${base}/api/health`, { headers: { "x-access-code": key } })).json();
  assert.equal(h2.authorized, true);

  // Bad or tampered links are rejected
  assert.equal((await realFetch(`${base}/api/key-approve?t=${token}x`)).status, 400);
});

test("approval without email set up shows the key to send manually", async (t) => {
  process.env.DISCORD_WEBHOOK_URL = HOOK;
  const server = createAppServer().listen(0);
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = async (url, opts) => (String(url).startsWith(base) ? realFetch(url, opts) : new Response("{}", { status: 200 }));
  const token = approvalToken({ email: "manual@example.com" });
  const html = await (await realFetch(`${base}/api/key-approve`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ t: token }),
  })).text();
  assert.match(html, /Send this key to <b>manual@example\.com<\/b>/);
  assert.ok(html.includes(keyForEmail("manual@example.com")));
});
