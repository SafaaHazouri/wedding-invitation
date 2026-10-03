const ADMIN_KEY_STORAGE = "mohammed-safaa-admin";

const lockCard = document.getElementById("lockCard");
const scanCard = document.getElementById("scanCard");
const lockForm = document.getElementById("lockForm");
const lockNote = document.getElementById("lockNote");
const scanForm = document.getElementById("scanForm");
const scanInput = document.getElementById("scanInput");
const scanResult = document.getElementById("scanResult");
const camera = document.getElementById("camera");

function showScan(message, ok) {
  scanResult.hidden = false;
  scanResult.className = `scan-result ${ok ? "is-ok" : "is-no"}`;
  scanResult.textContent = message;
}

async function checkIn(code) {
  const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
  const parsed = parseTicketPayload(code);
  const ticketId = (parsed?.ticketId || String(code || "").trim()).toUpperCase();
  if (!ticketId) {
    showScan("لم يُقرأ باركود صالح", false);
    return;
  }

  try {
    const response = await fetch("/api/checkin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": key,
      },
      body: JSON.stringify({ ticketId }),
    });
    const payload = await response.json();
    if (!response.ok) {
      showScan(payload.message || "تعذر تسجيل الدخول", false);
      return;
    }
    showScan(`${payload.entry.name}: تم تسجيل الدخول`, true);
  } catch (error) {
    if (parsed?.name) {
      if (parsed.status && parsed.status !== "attending") {
        const reason = parsed.status === "pending" ? "بانتظار الموافقة" : "رفض الدعوة، لا يُسمح بالدخول";
        showScan(`${parsed.name}: ${reason}`, false);
        return;
      }
      showScan(`${parsed.name}: تذكرة صالحة. سجّلوا الدخول يدوياً إن لزم.`, true);
      return;
    }
    showScan("تعذر الاتصال بقائمة الحضور", false);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia || typeof BarcodeDetector !== "function") return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    camera.srcObject = stream;
    camera.hidden = false;
    await camera.play();
    const detector = new BarcodeDetector({ formats: ["qr_code", "code_128"] });
    const tick = async () => {
      if (camera.readyState >= 2) {
        try {
          const codes = await detector.detect(camera);
          if (codes[0]?.rawValue) {
            scanInput.value = codes[0].rawValue;
            await checkIn(codes[0].rawValue);
            await new Promise((resolve) => setTimeout(resolve, 1600));
          }
        } catch (error) {
          // Keep scanning.
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (error) {
    camera.hidden = true;
  }
}

function unlock(key) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
  lockCard.hidden = true;
  scanCard.hidden = false;
  scanInput.focus();
  startCamera();
}

lockForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const key = document.getElementById("adminKey").value.trim();
  lockNote.hidden = false;
  lockNote.classList.add("show");
  if (key !== "ms2026") {
    lockNote.textContent = "كلمة المرور غير صحيحة";
    return;
  }
  unlock(key);
});

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = scanInput.value.trim();
  if (!code) return;
  await checkIn(code);
  scanInput.value = "";
  scanInput.focus();
});

const saved = sessionStorage.getItem(ADMIN_KEY_STORAGE);
if (saved) unlock(saved);
