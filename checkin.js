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
const photoScan = document.getElementById("photoScan");

let busy = false;
let html5Scanner = null;
let cameraRunning = false;

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
    history.replaceState({}, "", `${location.pathname}`);
  }
}

function handleDecodedText(text) {
  const parsed = parseTicketPayload(text);
  const value = parsed?.ticketId || String(text || "").trim();
  if (!value) return;
  scanInput.value = value;
  checkIn(value);
}

async function checkIn(code) {
  if (busy) return;
  const key = doorKey();
  if (!key) {
    showScan("سجّلوا الدخول بكلمة مرور الباب أولاً", false);
    return;
  }

  const parsed = parseTicketPayload(code);
  const ticketId = (parsed?.ticketId || String(code || "").trim()).toUpperCase();
  if (!ticketId || ticketId.length < 4) {
    showScan("لم يُقرأ باركود صالح", false);
    return;
  }

  busy = true;
  showScan("جاري التحقق من التذكرة...", true);
  try {
    const response = await fetch(`${API_BASE}/api/checkin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": key,
      },
      body: JSON.stringify({ ticketId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showScan(payload.message || "تعذر تسجيل الدخول", false);
      return;
    }
    showScan(`${payload.entry.name}: تم تسجيل الدخول`, true);
  } catch (error) {
    showScan("تعذر الاتصال بقائمة الحضور. تأكدوا من الإنترنت.", false);
  } finally {
    window.setTimeout(() => {
      busy = false;
    }, 1500);
  }
}

async function pickCameraId() {
  const cameras = await Html5Qrcode.getCameras();
  if (!cameras?.length) throw new Error("no-camera");
  const back = cameras.find((cam) => /back|rear|environment|خلف/i.test(cam.label || ""));
  return (back || cameras[cameras.length - 1]).id;
}

async function startHtml5Camera() {
  if (typeof Html5Qrcode !== "function") return false;
  const reader = document.getElementById("reader");
  if (!reader) return false;

  if (html5Scanner && cameraRunning) {
    setCameraHint("الكاميرا تعمل. قرّبوا QR الدعوة من الإطار.");
    return true;
  }

  if (html5Scanner) {
    try {
      await html5Scanner.stop();
    } catch (error) {
      // Already stopped.
    }
  }

  const cameraId = await pickCameraId();
  html5Scanner = new Html5Qrcode("reader", { verbose: false });
  await html5Scanner.start(
    cameraId,
    {
      fps: 12,
      qrbox(viewfinderWidth, viewfinderHeight) {
        const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
        return { width: Math.max(180, size), height: Math.max(180, size) };
      },
    },
    handleDecodedText,
  );
  cameraRunning = true;
  camera.hidden = true;
  setCameraHint("الكاميرا تعمل. قرّبوا رمز QR حتى يُقرأ.");
  return true;
}

async function scanPhoto(file) {
  if (!file) return;
  setCameraHint("جاري قراءة الصورة...");
  try {
    if (typeof Html5Qrcode === "function") {
      const temp = new Html5Qrcode("reader", { verbose: false });
      const text = await temp.scanFile(file, true);
      await temp.clear();
      handleDecodedText(text);
      setCameraHint("تمت قراءة الصورة.");
      return;
    }
    if (typeof BarcodeDetector === "function") {
      const detector = new BarcodeDetector({ formats: ["qr_code", "code_128"] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      if (codes[0]?.rawValue) {
        handleDecodedText(codes[0].rawValue);
        setCameraHint("تمت قراءة الصورة.");
        return;
      }
    }
    setCameraHint("لم يُقرأ باركود من الصورة. أعيدوا التصوير أقرب وأوضح.");
  } catch (error) {
    setCameraHint("لم يُقرأ الباركود من الصورة. صوّروه أقرب وبضوء أوضح.");
  }
}

async function startCamera() {
  startCameraBtn.disabled = true;
  setCameraHint("جاري تشغيل الكاميرا...");
  try {
    if (await startHtml5Camera()) return;
    setCameraHint("تعذر تشغيل الكاميرا. استخدموا زر تصوير الباركود.");
  } catch (error) {
    cameraRunning = false;
    setCameraHint("اسمحوا باستخدام الكاميرا، أو اضغطوا تصوير الباركود.");
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
  }
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

photoScan?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  scanPhoto(file);
  event.target.value = "";
});

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = scanInput.value.trim();
  if (!code) return;
  await checkIn(code);
  scanInput.value = "";
  scanInput.focus();
});

const saved = doorKey();
if (saved) unlock(saved);
