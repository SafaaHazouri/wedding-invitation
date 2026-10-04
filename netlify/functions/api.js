const { getStore, connectLambda } = require("@netlify/blobs");

const ADMIN_KEY = "ms2026";
const TICKET_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  };
}

function makeTicketId() {
  let id = "MS";
  for (let i = 0; i < 6; i += 1) {
    id += TICKET_CHARS[Math.floor(Math.random() * TICKET_CHARS.length)];
  }
  return id;
}

function store() {
  return getStore("wedding-rsvps");
}

async function loadItems() {
  const raw = await store().get("items");
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch (error) {
    return [];
  }
}

async function saveItems(items) {
  await store().set("items", JSON.stringify(items));
}

function ensureTickets(items) {
  return items.map((item) => ({
    ...item,
    ticketId: item.ticketId || makeTicketId(),
    checkedIn: Boolean(item.checkedIn),
  }));
}

function adminKey(event) {
  return event.headers["x-admin-key"] || event.headers["X-Admin-Key"] || "";
}

function isAdmin(event) {
  return adminKey(event) === ADMIN_KEY;
}

function routePath(event) {
  const candidates = [event.path, event.rawUrl];
  for (const raw of candidates) {
    if (!raw) continue;
    const api = String(raw).match(/\/api\/([^/?#]+)/);
    if (api) return `/${api[1]}`;
    const fn = String(raw).match(/\/\.netlify\/functions\/api\/([^/?#]+)/);
    if (fn) return `/${fn[1]}`;
  }
  return "/";
}

function readBody(event) {
  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(text);
}

function findTicket(items, ticketId) {
  const id = String(ticketId || "").trim().toUpperCase();
  return items.find((item) => String(item.ticketId || "").toUpperCase() === id);
}

exports.handler = async (event) => {
  try {
    connectLambda(event);
  } catch (error) {
    // Already connected, or running outside Lambda.
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: jsonHeaders, body: "" };
  }

  const path = routePath(event);

  try {
    if (event.httpMethod === "POST" && path === "/rsvp") {
      const entry = readBody(event);
      const name = String(entry.name || "").trim();
      const invitedBy = String(entry.invitedBy || "").trim();
      if (!name || !invitedBy) {
        return json(400, { ok: false, message: "الاسم واسم الداعي مطلوبان" });
      }
      const saved = {
        name,
        invitedBy,
        wish: String(entry.wish || "").trim(),
        createdAt: entry.createdAt || new Date().toISOString(),
        ticketId: String(entry.ticketId || makeTicketId()),
        status: "pending",
        checkedIn: false,
      };
      const items = await loadItems();
      items.unshift(saved);
      await saveItems(items);
      return json(200, { ok: true, ticketId: saved.ticketId, entry: saved });
    }

    if (event.httpMethod === "POST" && path === "/decide") {
      if (!isAdmin(event)) return json(403, { ok: false });
      const payload = readBody(event);
      const status = String(payload.status || "").trim();
      if (!["attending", "declined"].includes(status)) {
        return json(400, { ok: false, message: "حالة غير صالحة" });
      }
      const items = ensureTickets(await loadItems());
      const match = findTicket(items, payload.ticketId);
      if (!match) return json(404, { ok: false, message: "هذا الطلب غير موجود" });
      match.status = status;
      if (status !== "attending") match.checkedIn = false;
      await saveItems(items);
      return json(200, { ok: true, entry: match });
    }

    if (event.httpMethod === "POST" && path === "/checkin") {
      if (!isAdmin(event)) return json(403, { ok: false });
      const payload = readBody(event);
      const items = ensureTickets(await loadItems());
      const match = findTicket(items, payload.ticketId);
      if (!match) return json(404, { ok: false, message: "هذه التذكرة غير موجودة" });
      if (match.status !== "attending") {
        const message = match.status === "pending" ? "بانتظار الموافقة" : "رفض الدعوة، لا يُسمح بالدخول";
        return json(409, { ok: false, message: `${match.name}: ${message}` });
      }
      if (match.checkedIn) {
        return json(409, { ok: false, message: `${match.name}: دخل الصالة مسبقاً` });
      }
      match.checkedIn = true;
      await saveItems(items);
      return json(200, { ok: true, entry: match });
    }

    if (event.httpMethod === "GET" && path === "/rsvps") {
      if (!isAdmin(event)) return json(403, { ok: false });
      return json(200, ensureTickets(await loadItems()));
    }

    if (event.httpMethod === "GET" && path === "/ticket") {
      const ticketId = String(event.queryStringParameters?.id || "").trim();
      if (!ticketId) return json(400, { ok: false });
      const match = findTicket(ensureTickets(await loadItems()), ticketId);
      if (!match) return json(404, { ok: false });
      return json(200, match);
    }

    return json(404, { ok: false });
  } catch (error) {
    return json(500, { ok: false, message: "تعذر حفظ الطلب", error: String(error.message || error) });
  }
};
