import { env } from "./http.js";

// Posts key requests to a Discord channel webhook (DISCORD_WEBHOOK_URL).
// Plain webhooks can't receive button clicks, so "Approve" is a link button
// that opens the signed approval page on this site.

export const discordConfigured = () =>
  /^https:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(env("DISCORD_WEBHOOK_URL"));

const ORANGE = 0xff6a00;
const GREEN = 0x2ea043;

async function webhook(path, method, body) {
  const res = await fetch(`${env("DISCORD_WEBHOOK_URL")}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Discord webhook: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}

const requestEmbed = (email) => ({
  title: "Scan2Sell access key request",
  description: `**${email}** is asking for an access key.`,
  color: ORANGE,
  timestamp: new Date().toISOString(),
});

/**
 * Posts the request with an Approve link button. Returns the Discord message id
 * (used to mark it approved later), or "" if Discord didn't return one.
 * `approveURL(messageId)` builds the approval link.
 */
export async function postKeyRequest(email, approveURL) {
  // 1. Post, get the message id back.
  const message = await webhook("?wait=true", "POST", {
    username: "Scan2Sell",
    allowed_mentions: { parse: [] },
    embeds: [{ ...requestEmbed(email), footer: { text: "Preparing approval link…" } }],
  });
  const id = message?.id ?? "";
  const url = approveURL(id);

  // 2. Add the button (link buttons on channel webhooks need with_components=true).
  const withButton = {
    embeds: [{ ...requestEmbed(email), footer: { text: "Approving emails them their key" } }],
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Approve & email key", url }] }],
  };
  try {
    if (!id) throw new Error("no message id");
    await webhook(`/messages/${id}?with_components=true`, "PATCH", withButton);
  } catch {
    // Fallback: the link as text, in case components aren't allowed.
    const fallback = { embeds: [{ ...requestEmbed(email), fields: [{ name: "Approve", value: `[Approve & email key](${url})` }] }] };
    if (id) await webhook(`/messages/${id}`, "PATCH", fallback);
    else await webhook("", "POST", { username: "Scan2Sell", allowed_mentions: { parse: [] }, ...fallback });
  }
  return id;
}

/** Turns the request message green and removes the button. Best effort. */
export async function markApproved(messageId, email, emailed) {
  if (!messageId) return;
  try {
    await webhook(`/messages/${messageId}?with_components=true`, "PATCH", {
      embeds: [{
        ...requestEmbed(email),
        color: GREEN,
        title: "✅ Scan2Sell access key approved",
        footer: { text: emailed ? "Key emailed" : "Approved. Key shown on the approval page (email not set up)" },
      }],
      components: [],
    });
  } catch { /* the approval itself already succeeded */ }
}
