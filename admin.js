const ADMIN_KEY_STORAGE = "mohammed-safaa-admin";
const API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? "https://wedding-invitationmm.netlify.app"
  : "";

const lockCard = document.getElementById("lockCard");
const listCard = document.getElementById("listCard");
const lockForm = document.getElementById("lockForm");
const lockNote = document.getElementById("lockNote");
const rows = document.getElementById("rows");
const stats = document.getElementById("stats");
const refreshBtn = document.getElementById("refreshBtn");
const scanForm = document.getElementById("scanForm");
const scanInput = document.getElementById("scanInput");
const scanResult = document.getElementById("scanResult");

let latestItems = [];

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusClass(status) {
  if (status === "attending") return "is-yes";
  if (status === "pending") return "is-wait";
  return "is-no";
}

function actionButtons(item) {
  if (item.status === "pending") {
    return `<div class="admin-actions">
      <button type="button" class="ok-btn" data-act="attending" data-ticket="${escapeHtml(item.ticketId)}">موافقة</button>
      <button type="button" class="no-btn" data-act="declined" data-ticket="${escapeHtml(item.ticketId)}">رفض</button>
    </div>`;
  }
  if (item.status === "attending" && !item.checkedIn) {
    return `<div class="admin-actions">
      <button type="button" class="in-btn" data-act="checkin" data-ticket="${escapeHtml(item.ticketId)}">تأكيد الدخول</button>
    </div>`;
  }
  return "—";
}

function render(items) {
  latestItems = items;
  const attending = items.filter((item) => item.status === "attending");
  const declined = items.filter((item) => item.status === "declined");
  const pending = items.filter((item) => item.status === "pending" || !item.status);
  const entered = items.filter((item) => item.checkedIn).length;

  stats.innerHTML = `
    <article><strong>${items.length}</strong><span>طلبات</span></article>
    <article><strong>${pending.length}</strong><span>بانتظار الموافقة</span></article>
    <article><strong>${attending.length}</strong><span>موافقة</span></article>
    <article><strong>${declined.length}</strong><span>رفض</span></article>
    <article><strong>${entered}</strong><span>دخلوا الصالة</span></article>
  `;

  if (!items.length) {
    rows.innerHTML = '<tr><td colspan="7">لا توجد طلبات بعد</td></tr>';
    return;
  }

  rows.innerHTML = items.map((item) => {
    const accepted = item.status === "attending";
    const barcode = accepted && item.ticketId
      ? `${code128Svg(item.ticketId)}<span class="admin-code">${escapeHtml(item.ticketId)}</span>`
      : "—";
    return `
    <tr>
      <td>${escapeHtml(item.name || "")}</td>
      <td>${escapeHtml(item.invitedBy || "—")}</td>
      <td><span class="status-badge ${statusClass(item.status)}">${statusLabel(item.status || "pending")}</span></td>
      <td>${barcode}</td>
      <td>${item.checkedIn ? "دخل" : accepted ? "لم يدخل" : "—"}</td>
      <td>${escapeHtml(item.wish || "—")}</td>
      <td>${actionButtons(item)}</td>
    </tr>`;
  }).join("");
}

function showScan(message, ok) {
  scanResult.hidden = false;
  scanResult.className = `scan-result ${ok ? "is-ok" : "is-no"}`;
  scanResult.textContent = message;
}

function adminHeaders(key) {
  return {
    "Content-Type": "application/json",
    "X-Admin-Key": key,
  };
}

async function loadList(key) {
  const response = await fetch(`${API_BASE}/api/rsvps`, {
    headers: { "X-Admin-Key": key },
  });
  if (response.status === 404) {
    throw new Error("hosted");
  }
  if (!response.ok) throw new Error("unauthorized");
  render(await response.json());
}

async function decide(ticketId, status) {
  const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  const response = await fetch(`${API_BASE}/api/decide`, {
    method: "POST",
    headers: adminHeaders(key),
    body: JSON.stringify({ ticketId, status }),
  });
  const payload = await response.json();
  if (!response.ok) {
    showScan(payload.message || "تعذر تحديث الحالة", false);
    return;
  }
  showScan(`${payload.entry.name}: ${statusLabel(status)}`, status === "attending");
  await loadList(key);
}

async function checkIn(code) {
  const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  const parsed = parseTicketPayload(code);
  const ticketId = parsed?.ticketId || String(code || "").trim().toUpperCase();
  if (!ticketId) {
    showScan("لم يُقرأ باركود صالح", false);
    return;
  }

  const response = await fetch(`${API_BASE}/api/checkin`, {
    method: "POST",
    headers: adminHeaders(key),
    body: JSON.stringify({ ticketId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showScan(payload.message || "تعذر تسجيل الدخول", false);
    return;
  }

  showScan(`${payload.entry.name}: تم تأكيد الدخول`, true);
  await loadList(key);
}

async function unlock(key) {
  await loadList(key);
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
  lockCard.hidden = true;
  listCard.hidden = false;
  scanInput?.focus();
}

lockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = document.getElementById("adminKey").value.trim();
  lockNote.hidden = false;
  lockNote.classList.add("show");
  try {
    await unlock(key);
  } catch (error) {
    lockNote.textContent = error.message === "hosted"
      ? "على الاستضافة شاهدوا الحضور من لوحة Netlify: Forms"
      : "كلمة المرور غير صحيحة";
  }
});

refreshBtn.addEventListener("click", async () => {
  const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  if (!key) return;
  await loadList(key);
});

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = scanInput.value.trim();
  if (!code) return;
  await checkIn(code);
  scanInput.value = "";
  scanInput.focus();
});

rows.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const { act, ticket } = button.dataset;
  if (act === "checkin") {
    await checkIn(ticket);
    return;
  }
  await decide(ticket, act);
});

const saved = sessionStorage.getItem(ADMIN_KEY_STORAGE);
if (saved) {
  unlock(saved).catch(() => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  });
}
