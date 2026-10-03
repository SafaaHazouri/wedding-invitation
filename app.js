const TIMEZONE_OFFSET = 3;

function weddingAt(hour, minute = 0) {
  return new Date(Date.UTC(2026, 9, 16, hour - TIMEZONE_OFFSET, minute, 0));
}

const EVENT_TIME = weddingAt(15, 0);
const TICKET_KEY = "mohammed-safaa-ticket";
const VENUE_QUERY = "صالة الذهبية حلب";
const RSVP_ENDPOINT = "/api/rsvp";
const VENUE_MAPS_URL = "https://maps.app.goo.gl/QSQ3E658sgn9WNhe9?g_st=awb";

const cover = document.getElementById("cover");
const envelope = document.getElementById("envelope");
const openBtn = document.getElementById("openInvitation");
const menuBtn = document.getElementById("menuBtn");
const mainNav = document.getElementById("mainNav");
const form = document.getElementById("rsvpForm");
const formNote = document.getElementById("formNote");
const ticketOverlay = document.getElementById("ticketOverlay");
const ticketCard = document.getElementById("ticketCard");
const myTicket = document.getElementById("myTicket");
const mapLink = document.getElementById("mapLink");
const mapFrame = document.getElementById("mapFrame");

if (mapLink) mapLink.href = VENUE_MAPS_URL;
if (mapFrame) {
  mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(VENUE_QUERY)}&hl=ar&z=15&output=embed`;
}

function createPetals() {
  const layer = document.querySelector(".petal-layer");
  for (let i = 0; i < 22; i += 1) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.right = `${Math.random() * 100}%`;
    petal.style.animationDuration = `${8 + Math.random() * 11}s`;
    petal.style.animationDelay = `${Math.random() * 8}s`;
    petal.style.transform = `scale(${0.55 + Math.random() * 0.9})`;
    layer.appendChild(petal);
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function updateCountdown() {
  const target = EVENT_TIME;
  const diff = Math.max(0, target.getTime() - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  document.getElementById("days").textContent = pad(days);
  document.getElementById("hours").textContent = pad(hours);
  document.getElementById("minutes").textContent = pad(minutes);
  document.getElementById("seconds").textContent = pad(seconds);

  const caption = document.getElementById("countdownCaption");
  if (caption) {
    caption.textContent = "العدّ إلى الحفل • الجمعة 16 أكتوبر 2026 • الرجال 3:00 • النساء من 7:00";
  }
}

function getSavedTicket() {
  try {
    return JSON.parse(localStorage.getItem(TICKET_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function statusClass(status) {
  if (status === "attending") return "is-yes";
  if (status === "pending") return "is-wait";
  return "is-no";
}

function renderMyTicket(entry = getSavedTicket()) {
  if (!myTicket || !entry) {
    if (myTicket) myTicket.hidden = true;
    return;
  }

  myTicket.hidden = false;
  if (entry.status === "attending") {
    myTicket.innerHTML = `<p class="ticket-kicker">تمت الموافقة على دعوتكم</p>
       <p>احفظوا هذا الباركود واعرضوه عند باب الصالة</p>
       <button type="button" class="ticket-link" id="showMyTicket">عرض الباركود</button>`;
    document.getElementById("showMyTicket")?.addEventListener("click", () => showTicket(entry));
    return;
  }

  if (entry.status === "declined") {
    myTicket.innerHTML = `<p class="ticket-kicker">تم تسجيل الرد</p>
       <p>نأسف لتعذر حضوركم معنا في هذه المناسبة.</p>`;
    return;
  }

  myTicket.innerHTML = `<p class="ticket-kicker">بانتظار موافقة أصحاب الدعوة</p>
     <p>وصل طلبكم. سيظهر الباركود هنا بعد الموافقة.</p>`;
}

function ticketHtml(entry) {
  const accepted = entry.status === "attending";
  const payload = ticketPayload(entry);
  const barcode = accepted ? `
    <img class="ticket-qr" src="${qrImageUrl(payload)}" alt="باركود الدعوة" />
    ${code128Svg(entry.ticketId)}
    <strong class="ticket-code">${escapeHtml(entry.ticketId)}</strong>
    <p class="ticket-scan-hint">اعرضوا هذا الباركود عند باب الصالة ليتم مسحه</p>
  ` : `<p class="ticket-scan-hint">${entry.status === "pending"
    ? "طلبكم قيد المراجعة. الباركود يظهر بعد موافقة أصحاب الدعوة."
    : "لم تتم الموافقة على الدعوة، ولا يوجد باركود للدخول."}</p>`;

  return `
    <button type="button" class="ticket-close" id="ticketClose" aria-label="إغلاق">×</button>
    <p class="ticket-kicker">دعوة محمد وأميرته</p>
    <h3>${escapeHtml(entry.name)}</h3>
    <span class="status-badge ${statusClass(entry.status)}">${statusLabel(entry.status)}</span>
    <p>${accepted ? "الجمعة 16 أكتوبر 2026 • 3:00" : "الموافقة وتأكيد الدخول من أصحاب الدعوة فقط"}</p>
    ${barcode}
  `;
}

async function refreshSavedTicket() {
  const saved = getSavedTicket();
  if (!saved?.ticketId) {
    renderMyTicket(saved);
    return saved;
  }
  try {
    const response = await fetch(`/api/ticket?id=${encodeURIComponent(saved.ticketId)}`);
    if (response.ok) {
      const entry = await response.json();
      localStorage.setItem(TICKET_KEY, JSON.stringify(entry));
      renderMyTicket(entry);
      return entry;
    }
  } catch (error) {
    // Keep the locally saved request.
  }
  renderMyTicket(saved);
  return saved;
}

function showTicket(entry) {
  if (!ticketOverlay || !ticketCard) return;
  ticketCard.innerHTML = ticketHtml(entry);
  ticketOverlay.hidden = false;
  ticketCard.querySelector("#ticketClose")?.addEventListener("click", hideTicket);
}

function hideTicket() {
  if (ticketOverlay) ticketOverlay.hidden = true;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function prepareSectionMotion() {
  document.querySelectorAll(".hero.reveal, .section.reveal").forEach((section) => {
    const items = [];
    [...section.children].forEach((child) => {
      if (child.matches(".story-grid, .detail-grid, .times-grid, .rsvp-grid, .countdown")) {
        items.push(...child.children);
      } else {
        items.push(child);
      }
    });
    items.forEach((el, index) => {
      el.classList.add("reveal-item");
      el.style.setProperty("--d", `${index * 0.1}s`);
    });
  });
}

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("is-in");
  });
}, { threshold: 0.16, rootMargin: "0px 0px -10% 0px" });

function playSection(section) {
  if (!section) return;
  section.classList.remove("is-in");
  void section.offsetWidth;
  section.classList.add("is-in");
}

function goToSection(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => playSection(target), 180);
}

function startSectionMotion() {
  document.querySelectorAll(".reveal").forEach((section) => sectionObserver.observe(section));
  playSection(document.getElementById("home"));
}

function setActiveLink() {
  const sections = ["home", "story", "details", "rsvp"];
  const fromTop = window.scrollY + 90;
  let current = "home";

  sections.forEach((id) => {
    const section = document.getElementById(id);
    if (section && section.offsetTop <= fromTop) current = id;
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
}

openBtn.addEventListener("click", () => {
  cover.classList.add("hide");
  startSectionMotion();
  goToSection("home");
});

menuBtn.addEventListener("click", () => {
  mainNav.classList.toggle("open");
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href").slice(1);
    if (!document.getElementById(id)) return;
    event.preventDefault();
    mainNav.classList.remove("open");
    goToSection(id);
  });
});

async function sendRsvp(entry) {
  try {
    const api = await fetch(RSVP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (api.ok) return true;
  } catch (error) {
    // On static hosting the local API is unavailable.
  }

  const body = new URLSearchParams({
    "form-name": "rsvp",
    name: entry.name,
    status: "pending",
    invitedBy: entry.invitedBy,
    wish: entry.wish,
    createdAt: entry.createdAt,
    ticketId: entry.ticketId || "",
  });
  const response = await fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("rsvp-failed");
  return true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const entry = {
    name: String(data.get("name") || "").trim(),
    status: "pending",
    invitedBy: String(data.get("invitedBy") || "").trim(),
    wish: String(data.get("wish") || "").trim(),
    createdAt: new Date().toISOString(),
    ticketId: generateTicketId(),
    checkedIn: false,
  };

  if (!entry.name || !entry.invitedBy) return;

  const submitBtn = form.querySelector(".submit-btn");
  submitBtn.disabled = true;
  formNote.hidden = false;
  formNote.classList.add("show");
  formNote.textContent = "جاري إرسال الطلب...";

  try {
    await sendRsvp(entry);
    localStorage.setItem(TICKET_KEY, JSON.stringify(entry));
    renderMyTicket(entry);
    form.reset();
    formNote.textContent = "وصل طلبكم. ستظهر الموافقة والباركود بعد اعتماد أصحاب الدعوة.";
  } catch (error) {
    formNote.textContent = "تعذر إرسال الطلب الآن، حاولوا مرة أخرى.";
  } finally {
    submitBtn.disabled = false;
  }
});

ticketOverlay?.addEventListener("click", (event) => {
  if (event.target === ticketOverlay) hideTicket();
});

function createSparkles() {
  const layer = document.getElementById("sparkles");
  if (!layer) return;
  for (let i = 0; i < 28; i += 1) {
    const dot = document.createElement("span");
    dot.style.right = `${Math.random() * 100}%`;
    dot.style.bottom = `-${Math.random() * 20}%`;
    dot.style.animationDuration = `${7 + Math.random() * 10}s`;
    dot.style.animationDelay = `${Math.random() * 6}s`;
    layer.appendChild(dot);
  }
}

prepareSectionMotion();
createPetals();
createSparkles();
updateCountdown();
setInterval(updateCountdown, 1000);
refreshSavedTicket();
setInterval(refreshSavedTicket, 8000);
window.scrollTo(0, 0);
window.addEventListener("scroll", setActiveLink);
setActiveLink();
