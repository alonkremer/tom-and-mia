// בדיקות לשכבת הנתונים: הקוד האמיתי של Code.gs מול גיליון מדומה.
// הרצה:  node --test "tests/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./fake-sheets');

const guest = (over) => Object.assign({
  name: 'דנה לוי', attending: 'yes', adults: 2, kids: 1, food: '', note: '', lang: 'he'
}, over);

test('הקובץ Code.gs נקי מתווי בקרה (בטוח להדבקה בעורך של גוגל)', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  const bad = [...code].filter((ch) => ch.charCodeAt(0) < 32 && !'\n\r\t'.includes(ch));
  assert.equal(bad.length, 0);
});

test('הרשמה ראשונה יוצרת גיליון, כותרות, שורה וגיליון סיכום', () => {
  const env = createEnv();
  assert.deepEqual(env.post(guest()), { ok: true, action: 'created' });

  const sheet = env.sheets.RSVP;
  // המערך נוצר בתוך ה-vm, לכן מעתיקים אותו לפני ההשוואה
  assert.deepEqual([...sheet.data[0]], ['עודכן לאחרונה', 'שם', 'מגיעים', 'בוגרים', 'ילדים', 'אלרגיות / העדפות', 'ברכה', 'שפה', 'נרשם לראשונה']);
  assert.equal(sheet.frozen, 1);
  assert.equal(sheet.rtl, true);
  assert.equal(sheet.data.length, 2);
  assert.equal(sheet.data[1].length, 9, 'אין עמודת טלפון');

  const row = env.rows()[0];
  assert.equal(row.name, 'דנה לוי');
  assert.equal(row.attending, 'כן');
  assert.equal(row.adults, 2);
  assert.equal(row.kids, 1);
  assert.equal(row.lang, 'he');
  assert.equal(typeof row.updated.getTime, 'function');

  const sum = env.sheets['סיכום'];
  assert.ok(sum, 'גיליון הסיכום נוצר');
  assert.equal(sum.data[0][1], `=SUMIF('RSVP'!C:C,"כן",'RSVP'!D:D)`);
  assert.equal(sum.data[1][1], `=SUMIF('RSVP'!C:C,"כן",'RSVP'!E:E)`);
  assert.equal(sum.data[2][1], '=B1+B2');
  assert.equal(sum.data[3][1], `=COUNTIF('RSVP'!C:C,"כן")`);
  assert.equal(sum.data[4][1], `=COUNTIF('RSVP'!C:C,"לא")`);
});

test('עמודות הנוסחאות בסיכום מצביעות על העמודות הנכונות בגיליון', () => {
  const env = createEnv();
  env.post(guest());
  const headers = env.sheets.RSVP.data[0];
  const col = (letter) => headers[letter.charCodeAt(0) - 65];
  assert.equal(col('C'), 'מגיעים');
  assert.equal(col('D'), 'בוגרים');
  assert.equal(col('E'), 'ילדים');
});

test('אורחים שונים נשמרים בשורות נפרדות, והכותרת לא משתכפלת', () => {
  const env = createEnv();
  env.post(guest());
  env.post(guest({ name: 'יוסי כהן', adults: 1, kids: 0 }));
  env.post(guest({ name: 'Sarah Green', adults: 2, kids: 2, lang: 'en' }));
  assert.equal(env.sheets.RSVP.data.length, 4);
  assert.deepEqual(env.rows().map((r) => r.name), ['דנה לוי', 'יוסי כהן', 'Sarah Green']);
  assert.deepEqual(env.summary(), { adults: 5, kids: 3, total: 8, familiesYes: 3, familiesNo: 0 });
});

test('אותו שם (גם עם רווחים מיותרים / אותיות גדולות) מעדכן את אותה שורה ולא יוצר כפילות', () => {
  const env = createEnv();
  env.post(guest({ name: 'Sarah Green' }));
  const firstCreated = env.rows()[0].created;

  for (const name of ['Sarah Green', '  sarah   green ', 'SARAH GREEN', 'Sarah\tGreen']) {
    assert.deepEqual(env.post(guest({ name, adults: 4, kids: 3 })), { ok: true, action: 'updated' }, JSON.stringify(name));
  }
  env.post(guest({ name: 'דנה לוי' }));
  assert.equal(env.post(guest({ name: ' דנה  לוי ', adults: 1, kids: 0 })).action, 'updated');

  const rows = env.rows();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].adults, 4);
  assert.equal(rows[0].kids, 3);
  assert.equal(rows[0].created, firstCreated, '"נרשם לראשונה" נשמר בעדכון');
  assert.equal(rows[1].adults, 1);
});

test('שמות דומים אבל שונים הם משפחות נפרדות', () => {
  const env = createEnv();
  for (const name of ['דנה לוי', 'דנה לוין', 'דן לוי', 'דנה לוי כהן']) {
    assert.equal(env.post(guest({ name })).action, 'created', name);
  }
  assert.equal(env.rows().length, 4);
});

test('עדכון נוגע רק בשורה של אותו אורח', () => {
  const env = createEnv();
  env.post(guest({ name: 'אורח אחד' }));
  env.post(guest({ name: 'אורח שתיים', adults: 3 }));
  env.post(guest({ name: 'אורח שלוש' }));
  env.post(guest({ name: 'אורח שתיים', adults: 1, kids: 0, note: 'עודכן' }));
  const rows = env.rows();
  assert.deepEqual(rows.map((r) => r.name), ['אורח אחד', 'אורח שתיים', 'אורח שלוש']);
  assert.deepEqual(rows.map((r) => r.adults), [2, 1, 2]);
  assert.deepEqual(rows.map((r) => r.note), ['', 'עודכן', '']);
});

test('מעבר מ"מגיעים" ל"לא מגיעים" מאפס כמויות ומעדכן את הסיכום, וגם חזרה', () => {
  const env = createEnv();
  env.post(guest({ adults: 2, kids: 2, food: 'צמחוני' }));
  env.post(guest({ name: 'יוסי כהן', adults: 2, kids: 0 }));
  assert.deepEqual(env.summary(), { adults: 4, kids: 2, total: 6, familiesYes: 2, familiesNo: 0 });

  env.post(guest({ attending: 'no', adults: 2, kids: 2, food: 'צמחוני', note: 'מצטערים!' }));
  let row = env.rows()[0];
  assert.equal(row.attending, 'לא');
  assert.equal(row.adults, 0);
  assert.equal(row.kids, 0);
  assert.equal(row.food, '');
  assert.equal(row.note, 'מצטערים!');
  assert.deepEqual(env.summary(), { adults: 2, kids: 0, total: 2, familiesYes: 1, familiesNo: 1 });

  env.post(guest({ attending: 'yes', adults: 1, kids: 1 }));
  row = env.rows()[0];
  assert.equal(row.attending, 'כן');
  assert.deepEqual(env.summary(), { adults: 3, kids: 1, total: 4, familiesYes: 2, familiesNo: 0 });
});

test('מחיקת שורה ידנית בגיליון: השאר נשארים, הסיכום מתעדכן, ואפשר להירשם מחדש', () => {
  const env = createEnv();
  env.post(guest({ name: 'אורח אחד', adults: 2, kids: 0 }));
  env.post(guest({ name: 'אורח שתיים', adults: 3, kids: 1 }));
  env.post(guest({ name: 'אורח שלוש', adults: 1, kids: 2 }));

  env.sheets.RSVP.deleteRow(3); // מוחקים את "אורח שתיים" (שורה 1 היא הכותרת)
  assert.deepEqual(env.rows().map((r) => r.name), ['אורח אחד', 'אורח שלוש']);
  assert.deepEqual(env.summary(), { adults: 3, kids: 2, total: 5, familiesYes: 2, familiesNo: 0 });

  // עדכון של אורח שנמצא אחרי השורה שנמחקה עדיין פוגע בשורה הנכונה
  assert.equal(env.post(guest({ name: 'אורח שלוש', adults: 2, kids: 2 })).action, 'updated');
  assert.equal(env.rows()[1].adults, 2);

  // האורח שנמחק נרשם מחדש – נוצרת שורה חדשה
  assert.equal(env.post(guest({ name: 'אורח שתיים', adults: 3, kids: 1 })).action, 'created');
  assert.equal(env.rows().length, 3);
  assert.deepEqual(env.summary(), { adults: 7, kids: 3, total: 10, familiesYes: 3, familiesNo: 0 });
});

test('מחיקת כל השורות (כולל הכותרת) – ההרשמה הבאה בונה את הגיליון מחדש', () => {
  const env = createEnv();
  env.post(guest());
  env.sheets.RSVP.data.length = 0;
  assert.equal(env.post(guest()).action, 'created');
  assert.equal(env.sheets.RSVP.data[0][1], 'שם');
  assert.equal(env.rows().length, 1);
});

test('קלט לא תקין נדחה ולא נשמר', () => {
  const env = createEnv();
  assert.deepEqual(env.post(guest({ name: '' })), { ok: false, error: 'name' });
  assert.deepEqual(env.post(guest({ name: 'דנה' })), { ok: false, error: 'name' }, 'חסר שם משפחה');
  assert.deepEqual(env.post(guest({ name: 'א ב' })), { ok: false, error: 'name' });
  assert.deepEqual(env.post(guest({ name: '     ' })), { ok: false, error: 'name' });
  assert.deepEqual(env.post(guest({ name: null })), { ok: false, error: 'name' });
  assert.deepEqual(env.post(guest({ attending: 'maybe' })), { ok: false, error: 'attending' });
  assert.deepEqual(env.post(null), { ok: false, error: 'invalid' });
  assert.equal(env.postRaw('not json').ok, false);
  assert.equal(env.postRaw('').ok, false);
  assert.equal(env.rows().length, 0);
});

test('בקשה ישנה שעדיין שולחת טלפון – השדה פשוט מתעלמים ממנו', () => {
  const env = createEnv();
  assert.equal(env.post(guest({ phone: '0501234567' })).ok, true);
  assert.equal(env.sheets.RSVP.data[1].length, 9);
  assert.ok(!env.sheets.RSVP.data[1].includes('0501234567'));
});

test('כמויות מוגבלות לטווח סביר ונשמרות כמספרים', () => {
  const env = createEnv();
  env.post(guest({ name: 'משפחה אחת', adults: 999, kids: -5 }));
  env.post(guest({ name: 'משפחה שתיים', adults: '3', kids: '2' }));
  env.post(guest({ name: 'משפחה שלוש', adults: 'abc', kids: null }));
  env.post(guest({ name: 'משפחה ארבע', adults: 0, kids: 2.6 }));
  const rows = env.rows();
  assert.deepEqual(rows.map((r) => [r.adults, r.kids]), [[20, 0], [3, 2], [1, 0], [1, 3]]);
  rows.forEach((r) => { assert.equal(typeof r.adults, 'number'); assert.equal(typeof r.kids, 'number'); });
});

test('טקסט שנראה כמו נוסחה מנוטרל, טקסט ארוך נחתך, והזיהוי לפי שם עדיין עובד', () => {
  const env = createEnv();
  env.post(guest({ name: '=HYPERLINK("http://x","y") z', food: '+SUM(A1)', note: '@cmd' }));
  env.post(guest({ name: '-2+3 cmd', note: 'x'.repeat(5000) }));
  const [a, b] = env.rows();
  assert.equal(a.name, `'=HYPERLINK("http://x","y") z`);
  assert.equal(a.food, `'+SUM(A1)`);
  assert.equal(a.note, `'@cmd`);
  assert.equal(b.name, `'-2+3 cmd`);
  assert.equal(b.note.length, 600);
  assert.equal(env.post(guest({ name: '-2+3 cmd', adults: 5 })).action, 'updated', 'הגרש המגן לא שובר את הזיהוי');
  assert.equal(env.rows().length, 2);
});

test('עברית, אנגלית, אימוג׳י ושורות חדשות נשמרים כמו שהם', () => {
  const env = createEnv();
  const note = 'מזל טוב!! 🎈💙\nCongrats to Tom & Mia';
  env.post(guest({ name: '  רות   בן-דוד  ', note, food: 'ללא גלוטן', lang: 'en' }));
  const row = env.rows()[0];
  assert.equal(row.name, 'רות   בן-דוד');
  assert.equal(row.note, note);
  assert.equal(row.food, 'ללא גלוטן');
  assert.equal(row.lang, 'en');
});

test('כל בקשה נועלת ומשחררת (גם כשהיא נכשלת) – אין דריסה בין שתי שליחות במקביל', () => {
  const env = createEnv();
  env.post(guest());
  env.postRaw('not json');
  assert.deepEqual(env.lockLog, ['lock', 'release', 'lock', 'release']);
});

test('תרחיש מלא: 40 משפחות, עדכונים וביטולים – הסיכום תואם חישוב ידני', () => {
  const env = createEnv();
  const expected = new Map();
  for (let i = 0; i < 40; i++) {
    const g = guest({ name: `משפחה מספר${i}`, adults: 1 + (i % 3), kids: i % 4 });
    env.post(g);
    expected.set(g.name, g);
  }
  for (let i = 0; i < 40; i += 5) { // כל משפחה חמישית מבטלת
    const g = expected.get(`משפחה מספר${i}`);
    g.attending = 'no';
    env.post(g);
  }
  for (let i = 1; i < 40; i += 7) { // חלק מעדכנים כמויות
    const g = expected.get(`משפחה מספר${i}`);
    if (g.attending === 'no') continue;
    g.adults = 2; g.kids = 5;
    env.post(g);
  }
  const yes = [...expected.values()].filter((g) => g.attending === 'yes');
  const adults = yes.reduce((s, g) => s + g.adults, 0);
  const kids = yes.reduce((s, g) => s + g.kids, 0);
  assert.equal(env.rows().length, 40);
  assert.deepEqual(env.summary(), { adults, kids, total: adults + kids, familiesYes: yes.length, familiesNo: 40 - yes.length });
});
