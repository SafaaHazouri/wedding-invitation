const ADMIN_KEY_STORAGE = "mohammed-safaa-admin";
const API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? "https://wedding-invitationmm.netlify.app"
  : "";

const lockCard = document.getElementById("lockCard");
const scanCard = document.getElementById("scanCard");
const lockForm = document.getElementById("lockForm");
const lockNote = document.getElementById("lockNote");
const scanForm = document.getElementById("scanForm");
const scanInput = document.getElementById("scanInput");
const scanResult = document.getElementById("scanResult");
const camera = document.getElementById("camera");
const startCameraBtn = document.getElementById("startCameraBtn");
const cameraHint = document.getElementById("cameraHint");

let busy = false;
let html5Scanner = null;

function showScan(message, ok) {
  scanResult.hidden = false;
  scanResult.className = `scan-result ${ok ? "is-ok" : "is-no"}`;
  scanResult.textContent = message;
}

function setCameraHint(text) {
  if (cameraHint) cameraHint.textContent = text;
}

function doorKey() {
  return localStorage.getItem(ADMIN_KEY_STORAGE) || sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

function scannedCodeFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("t") || params.get("id") || params.get("ticket") || "";
}

function clearScanQuery() {
  if (location.search) {
    history.replaceState({}, "", location.pathname);
  }
}

async function checkIn(code) {
  if (busy) return;
  const key = doorKey();
  const parsed = parseTicketPayload(code);
  const ticketId = (parsed?.ticketId || String(code || "").trim()).toUpperCase();
  if (!ticketId) {
    showScan("لم يُقرأ باركود صالح", false);
    return;
  }

  busy = true;
  try {
    const response = await fetch(`${API_BASE}/api/checkin`, {
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
  } finally {
    window.setTimeout(() => {
      busy = false;
    }, 1800);
  }
}

async function startHtml5Camera() {
  if (typeof Html5Qrcode !== "function") return false;
  const reader = document.getElementById("reader");
  if (!reader) return false;

  if (html5Scanner) {
    try {
      await html5Scanner.stop();
    } catch (error) {
      // Already stopped.
    }
  }

  html5Scanner = new Html5Qrcode("reader");
  const formats = typeof Html5QrcodeSupportedFormats === "object"
    ? [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128]
    : undefined;

  await html5Scanner.start(
    { facingMode: "environment" },
    {
      fps: 8,
      qrbox: { width: 240, height: 240 },
      aspectRatio: 1,
      formatsToSupport: formats,
    },
    (text) => {
      const parsed = parseTicketPayload(text);
      const value = parsed?.ticketId || text;
      scanInput.value = value;
      checkIn(value);
    },
  );
  camera.hidden = true;
  setCameraHint("الكاميرا تعمل. قرّبوا الباركود داخل الإطار.");
  return true;
}

async function startNativeCamera() {
  if (!navigator.mediaDevices?.getUserMedia || typeof BarcodeDetector !== "function") {
    return false;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
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
        }
      } catch (error) {
        // Keep scanning.
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setCameraHint("الكاميرا تعمل. وجّهوها إلى باركود الدعوة.");
  return true;
}

async function startCamera() {
  startCameraBtn.disabled = true;
  setCameraHint("جاري تشغيل الكاميرا...");
  try {
    if (await startHtml5Camera()) return;
    if (await startNativeCamera()) return;
    setCameraHint("تعذر تشغيل الكاميرا. اكتبوا رمز التذكرة يدوياً.");
  } catch (error) {
    setCameraHint("اسمحوا باستخدام الكاميرا من إعدادات المتصفح، ثم اضغطوا تشغيل الكاميرا.");
  } finally {
    startCameraBtn.disabled = false;
  }
}

function unlock(key) {
  localStorage.setItem(ADMIN_KEY_STORAGE, key);
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
  lockCard.hidden = true;
  scanCard.hidden = false;

  const fromPhoneScanner = scannedCodeFromUrl();
  if (fromPhoneScanner) {
    clearScanQuery();
    checkIn(fromPhoneScanner);
  } else {
    startCamera();
  }
  scanInput?.focus();
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

startCameraBtn?.addEventListener("click", startCamera);

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = scanInput.value.trim();
  if (!code) return;
  await checkIn(code);
  scanInput.value = "";
  scanInput.focus();
});

scanInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    scanForm.requestSubmit();
  }
});

const saved = doorKey();
if (saved) unlock(saved);
