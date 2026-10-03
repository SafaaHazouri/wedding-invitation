function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "الوقت",
      "الاسم",
      "الحضور",
      "المرافقون",
      "نوع الدعوة",
      "الأمنية",
    ]);
  }

  const data = JSON.parse(e.postData.contents);
  const status = data.status === "attending" ? "سيحضر" : "اعتذر";
  const guestType = data.guestType === "women" ? "سيدات" : "رجال";

  sheet.appendRow([
    new Date(),
    data.name || "",
    status,
    Number(data.guests || 0),
    guestType,
    data.wish || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}