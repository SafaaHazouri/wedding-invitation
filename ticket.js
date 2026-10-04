const TICKET_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateTicketId() {
  let id = "MS";
  for (let i = 0; i < 6; i += 1) {
    id += TICKET_CHARS[Math.floor(Math.random() * TICKET_CHARS.length)];
  }
  return id;
}

function ticketPayload(entry) {
  return [
    entry.ticketId || "",
    entry.name || "",
    entry.status || "",
    entry.guestType || "",
  ].join("|");
}

function ticketCheckinUrl(ticketId) {
  return `https://wedding-invitationmm.netlify.app/enter?t=${encodeURIComponent(ticketId)}`;
}

function parseTicketPayload(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fromQuery = raw.match(/[?&](?:t|id|ticket)=([^&\s#]+)/i);
  if (fromQuery) {
    return { ticketId: decodeURIComponent(fromQuery[1]).trim().toUpperCase() };
  }

  try {
    const url = new URL(raw);
    const id = url.searchParams.get("t") || url.searchParams.get("id") || url.searchParams.get("ticket");
    if (id) return { ticketId: id.trim().toUpperCase() };
  } catch (error) {
    // Not a URL.
  }

  if (raw.includes("|")) {
    const [ticketId, name, status, guestType, guests] = raw.split("|");
    if (!ticketId) return null;
    return {
      ticketId: ticketId.trim(),
      name: (name || "").trim(),
      status: status || "",
      guestType: guestType || "",
      guests: guests || "0",
    };
  }
  if (/^MS[A-Z0-9]{6}$/i.test(raw)) {
    return { ticketId: raw.toUpperCase() };
  }
  return null;
}

function qrImageUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(data)}`;
}

const CODE128_PATTERNS = [
  "11011001100","11001101100","11001100110","10010011000","10010001100",
  "10001001100","10011001000","10011000100","10001100100","11001001000",
  "11001000100","11000100100","10110011100","10011011100","10011001110",
  "10111001100","10011101100","10011100110","11001110010","11001011100",
  "11001001110","11011100100","11001110100","11101101110","11101001100",
  "11100101100","11100100110","11101100100","11100110100","11100110010",
  "11011011000","11011000110","11000110110","10100011000","10001011000",
  "10001000110","10110001000","10001101000","10001100010","11010001000",
  "11000101000","11000100010","10110111000","10110001110","10001101110",
  "10111011000","10111000110","10001110110","11101110110","11010001110",
  "11000101110","11011101000","11011100010","11011101110","11101011000",
  "11101000110","11100010110","11101101000","11101100010","11100011010",
  "11101111010","11001000010","11110001010","10100110000","10100001100",
  "10010110000","10010000110","10000101100","10000100110","10110010000",
  "10110000100","10011010000","10011000010","10000110100","10000110010",
  "11000010010","11001010000","11110111010","11000010100","10001111010",
  "10100111100","10010111100","10010011110","10111100100","10011110100",
  "10011110010","11110100100","11110010100","11110010010","11011011110",
  "11011110110","11110110110","10101111000","10100011110","10001011110",
  "10111101000","10111100010","11110101000","11110100010","10111011110",
  "10111101110","11101011110","11110101110","11010000100","11010010000",
  "11010011100","11000111010",
];

function code128Value(char) {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) return code - 32;
  return null;
}

function code128Svg(text) {
  const value = String(text || "").toUpperCase();
  const codes = [104];
  for (const char of value) {
    const index = code128Value(char);
    if (index === null) continue;
    codes.push(index);
  }
  if (codes.length === 1) return "";

  let checksum = codes[0];
  codes.slice(1).forEach((code, index) => {
    checksum += code * (index + 1);
  });
  codes.push(checksum % 103, 106);

  const modules = `000${codes.map((code) => CODE128_PATTERNS[code]).join("")}11`;
  const barWidth = 2;
  const height = 56;
  const width = modules.length * barWidth;
  let x = 0;
  let bars = "";
  for (const bit of modules) {
    if (bit === "1") {
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="#5c4d3d"/>`;
    }
    x += barWidth;
  }
  return `<svg class="barcode-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${value}">${bars}</svg>`;
}

function statusLabel(status) {
  if (status === "attending") return "موافقة";
  if (status === "pending") return "بانتظار الموافقة";
  return "رفض الدعوة";
}

function guestLabel(type) {
  if (type === "women") return "سيدات";
  if (type === "men") return "رجال";
  return "—";
}
