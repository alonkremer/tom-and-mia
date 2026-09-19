/**
 * אישורי הגעה – הברית של תום ויום ההולדת של מיה
 * הסקריפט מקבל את הטופס מהאתר ושומר כל משפחה בשורה אחת בגיליון "RSVP".
 * מי שממלא שוב עם אותו שם (בלי הבדל של רווחים / אותיות גדולות) – השורה שלו מתעדכנת ולא נוצרת כפילות.
 * אם נראה שאותם אנשים נספרו בשתי שורות (בני זוג שמילאו כל אחד בנפרד) – העמודה "לבדיקה" מסמנת את זה.
 * הוראות התקנה: SETUP.md
 */

var SHEET_NAME = 'RSVP';
var SUMMARY_NAME = 'סיכום';
var HEADERS = ['עודכן לאחרונה', 'שם', 'מגיעים', 'בוגרים', 'ילדים', 'בוגרים נוספים (שמות)', 'ילדים (שמות)', 'אלרגיות / העדפות', 'ברכה', 'שפה', 'נרשם לראשונה', 'לבדיקה'];
var COL = { updated: 0, name: 1, attending: 2, adults: 3, kids: 4, adultNames: 5, kidNames: 6, food: 7, note: 8, lang: 9, created: 10, check: 11 };
var YES = 'כן';
var NO = 'לא';

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(20000);
    locked = true;
    var data = JSON.parse(e && e.postData && e.postData.contents || '');
    return json_(saveRsvp_(data));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, service: 'rsvp' });
}

/** מריצים פעם אחת ידנית כדי ליצור את הגיליונות (גם doPost יוצר אותם אם חסרים). */
function setup() {
  getSheet_();
}

function saveRsvp_(data) {
  var clean = validate_(data);
  if (clean.error) return { ok: false, error: clean.error };

  var sheet = getSheet_();
  var rows = sheet.getDataRange().getValues();
  var now = new Date();
  var found = -1;
  for (var i = 1; i < rows.length; i++) {
    if (nameKey_(rows[i][COL.name]) === clean.nameKey) { found = i; break; }
  }

  var row = [now, clean.name, clean.attending, clean.adults, clean.kids, clean.adultNames.join(', '), clean.kidNames.join(', '),
    clean.food, clean.note, clean.lang, now, overlapNote_(clean, rows, found)];
  if (found === -1) {
    sheet.appendRow(row);
    return { ok: true, action: 'created' };
  }
  row[COL.created] = rows[found][COL.created] || now;
  sheet.getRange(found + 1, 1, 1, HEADERS.length).setValues([row]);
  return { ok: true, action: 'updated' };
}

function validate_(data) {
  if (!data || typeof data !== 'object') return { error: 'invalid' };
  var name = text_(data.name, 80);
  var nameKey = nameKey_(name);
  if (nameKey.length < 4 || nameKey.indexOf(' ') === -1) return { error: 'name' };
  if (data.attending !== 'yes' && data.attending !== 'no') return { error: 'attending' };
  var coming = data.attending === 'yes';
  return {
    name: name,
    nameKey: nameKey,
    attending: coming ? YES : NO,
    adults: coming ? count_(data.adults, 1, 20) : 0,
    kids: coming ? count_(data.kids, 0, 20) : 0,
    adultNames: coming ? names_(data.adultNames, count_(data.adults, 1, 20) - 1) : [],
    kidNames: coming ? names_(data.kidNames, count_(data.kids, 0, 20)) : [],
    food: coming ? text_(data.food, 200) : '',
    note: text_(data.note, 600),
    lang: data.lang === 'en' ? 'en' : 'he'
  };
}

/** המפתח שלפיו מזהים משפחה: השם, בלי הבדלי רווחים, אותיות גדולות או גרש מוביל. */
function nameKey_(value) {
  return String(value == null ? '' : value).replace(/^'/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** רשימת שמות נקייה: בלי ריקים, בלי פסיקים (הם המפריד בתא), ולא יותר מהכמות שהוצהרה. */
function names_(list, max) {
  if (!Array.isArray(list)) return [];
  var out = [];
  for (var i = 0; i < list.length && out.length < max; i++) {
    var n = text_(String(list[i] == null ? '' : list[i]).replace(/,/g, ' '), 40);
    if (n.replace(/^'/, '')) out.push(n);
  }
  return out;
}

function firstWord_(value) { return nameKey_(value).split(' ')[0] || ''; }
function lastWord_(value) { var p = nameKey_(value).split(' '); return p[p.length - 1] || ''; }
function firstWords_(cell) {
  return String(cell == null ? '' : cell).split(',').map(firstWord_).filter(function (w) { return w; });
}

/**
 * חשד לספירה כפולה: שתי שורות "מגיעים" עם אותו שם משפחה, כשהשם הפרטי של אחד הממלאים
 * מופיע ברשימת המצטרפים של השני. מחזיר טקסט לעמודת "לבדיקה" (או ריק).
 */
function overlapNote_(clean, rows, selfIndex) {
  if (clean.attending !== YES) return '';
  var mine = clean.adultNames.concat(clean.kidNames).map(firstWord_);
  var hits = [];
  for (var i = 1; i < rows.length; i++) {
    if (i === selfIndex || rows[i][COL.attending] !== YES) continue;
    var other = rows[i][COL.name];
    if (lastWord_(other) !== lastWord_(clean.name)) continue;
    var theirs = firstWords_(rows[i][COL.adultNames]).concat(firstWords_(rows[i][COL.kidNames]));
    if (theirs.indexOf(firstWord_(clean.name)) !== -1 || mine.indexOf(firstWord_(other)) !== -1) {
      hits.push(String(other).replace(/^'/, ''));
    }
  }
  return hits.length ? 'ייתכן שנספרו פעמיים – לבדוק מול: ' + hits.join(', ') : '';
}

function count_(value, min, max) {
  var n = Math.round(Number(value));
  if (isNaN(n)) n = min;
  return Math.min(max, Math.max(min, n));
}

/** חיתוך לאורך סביר + נטרול טקסט שמתחיל כמו נוסחה (=, +, -, @). */
function text_(value, maxLen) {
  var s = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.setRightToLeft(true);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  if (!ss.getSheetByName(SUMMARY_NAME)) {
    var sum = ss.insertSheet(SUMMARY_NAME);
    sum.setRightToLeft(true);
    sum.getRange(1, 1, 5, 2).setValues(summaryCells_());
    sum.getRange(1, 1, 5, 1).setFontWeight('bold');
  }
  return sheet;
}

/** הסיכום בנוי מנוסחאות, כך שהוא נשאר נכון גם אם מוחקים או מתקנים שורות ידנית. */
function summaryCells_() {
  var s = "'" + SHEET_NAME + "'!";
  return [
    ['סה״כ בוגרים', '=SUMIF(' + s + 'C:C,"' + YES + '",' + s + 'D:D)'],
    ['סה״כ ילדים', '=SUMIF(' + s + 'C:C,"' + YES + '",' + s + 'E:E)'],
    ['סה״כ מגיעים', '=B1+B2'],
    ['משפחות שמגיעות', '=COUNTIF(' + s + 'C:C,"' + YES + '")'],
    ['משפחות שלא מגיעות', '=COUNTIF(' + s + 'C:C,"' + NO + '")']
  ];
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
