// בדיקות לשכבת הנתונים: הקוד האמיתי של Code.gs מול גיליון מדומה.
// הרצה:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./fake-sheets');

const guest = (over) => Object.assign({
  name: 'דנה לוי', phone: '0501234567', attending: 'yes',
  adults: 2, kids: 1, food: '', note: '', lang: 'he'
}, over);

test('הרשמה ראשונה יוצרת גיליון, כותרות, שורה וגיליון סיכום', () => {
  const env = createEnv();
  const res = env.post(guest());
  assert.deepEqual(res, { ok: true, action: 'created' });

  const sheet = env.sheets.RSVP;
  assert.equal(sheet.data[0][1], 'שם');
  assert.equal(sheet.data[0].length, 10);
  assert.equal(sheet.frozen, 1);
  assert.equal(sheet.rtl, true);
  assert.equal(sheet.data.length, 2);

  const row = env.rows()[0];
  assert.equal(row.name, 'דנה לוי');
  assert.equal(row.phone, '050-1234567');
  assert.equal(row.attending, 'כן');
  assert.equal(row.adults, 2);
  assert.equal(row.kids, 1);
  assert.equal(row.lang, 'he');
  assert.ok(row.updated instanceof Date || typeof row.updated.getTime === 'function');

  const sum = env.sheets['סיכום'];
  assert.ok(sum, 'גיליון הסיכום נוצר');
  assert.equal(sum.data[0][1], `=SUMIF('RSVP'!D:D,"כן",'RSVP'!E:E)`);
  assert.equal(sum.data[1][1], `=SUMIF('RSVP'!D:D,"כן",'RSVP'!F:F)`);
  assert.equal(sum.data[3][1], `=COUNTIF('RSVP'!D:D,"כן")`);
  assert.equal(sum.data[4][1], `=COUNTIF('RSVP'!D:D,"לא")`);
});

test('אורחים שונים נשמרים בשורות נפרדות, והכותרת לא משתכפלת', () => {
  const env = createEnv();
  env.post(guest());
  env.post(guest({ name: 'יוסי כהן', phone: '0527654321', adults: 1, kids: 0 }));
  env.post(guest({ name: 'Sarah Green', phone: '+1 (555) 123-4567', adults: 2, kids: 2, lang: 'en' }));
  assert.equal(env.sheets.RSVP.data.length, 4);
  assert.deepEqual(env.rows().map((r) => r.name), ['דנה לוי', 'יוסי כהן', 'Sarah Green']);
  assert.deepEqual(env.summary(), { adults: 5, kids: 3, total: 8, familiesYes: 3, familiesNo: 0 });
});

test('אותו טלפון בפורמט אחר מעדכן את אותה שורה ולא יוצר כפילות', () => {
  const env = createEnv();
  env.post(guest({ phone: '050-123-4567' }));
  const firstCreated = env.rows()[0].created;

  for (const phone of ['0501234567', '+972501234567', '972-50-1234567', '050 1234567']) {
    const res = env.post(guest({ phone, adults: 4, kids: 3 }));
    assert.deepEqual(res, { ok: true, action: 'updated' }, phone);
  }
  const rows = env.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adults, 4);
  assert.equal(rows[0].kids, 3);
  assert.equal(rows[0].created, firstCreated, '"נרשם לראשונה" נשמר בעדכון');
});

test('עדכון נוגע רק בשורה של אותו אורח', () => {
  const env = createEnv();
  env.post(guest({ name: 'א', phone: '0500000001', name: 'אורח אחד' }));
  env.post(guest({ name: 'אורח שתיים', phone: '0500000002', adults: 3 }));
  env.post(guest({ name: 'אורח שלוש', phone: '0500000003' }));
  env.post(guest({ name: 'אורח שתיים מעודכן', phone: '0500000002', adults: 1, kids: 0 }));
  const rows = env.rows();
  assert.deepEqual(rows.map((r) => r.name), ['אורח אחד', 'אורח שתיים מעודכן', 'אורח שלוש']);
  assert.deepEqual(rows.map((r) => r.adults), [2, 1, 2]);
});

test('מעבר מ"מגיעים" ל"לא מגיעים" מאפס כמויות ומעדכן את הסיכום, וגם חזרה', () => {
  const env = createEnv();
  env.post(guest({ adults: 2, kids: 2, food: 'צמחוני' }));
  env.post(guest({ name: 'יוסי כהן', phone: '0527654321', adults: 2, kids: 0 }));
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
  env.post(guest({ name: 'אורח אחד', phone: '0500000001', adults: 2, kids: 0 }));
  env.post(guest({ name: 'אורח שתיים', phone: '0500000002', adults: 3, kids: 1 }));
  env.post(guest({ name: 'אורח שלוש', phone: '0500000003', adults: 1, kids: 2 }));

  env.sheets.RSVP.deleteRow(3); // מוחקים את "אורח שתיים" (שורה 1 היא הכותרת)
  assert.deepEqual(env.rows().map((r) => r.name), ['אורח אחד', 'אורח שלוש']);
  assert.deepEqual(env.summary(), { adults: 3, kids: 2, total: 5, familiesYes: 2, familiesNo: 0 });

  // עדכון של אורח שנמצא אחרי השורה שנמחקה עדיין פוגע בשורה הנכונה
  assert.equal(env.post(guest({ name: 'אורח שלוש', phone: '0500000003', adults: 2, kids: 2 })).action, 'updated');
  assert.equal(env.rows()[1].adults, 2);

  // האורח שנמחק נרשם מחדש – נוצרת שורה חדשה
  assert.equal(env.post(guest({ name: 'אורח שתיים', phone: '0500000002', adults: 3, kids: 1 })).action, 'created');
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
  assert.deepEqual(env.post(guest({ name: 'א' })), { ok: false, error: 'name' });
  assert.deepEqual(env.post(guest({ phone: '12345' })), { ok: false, error: 'phone' });
  assert.deepEqual(env.post(guest({ phone: '' })), { ok: false, error: 'phone' });
  assert.deepEqual(env.post(guest({ phone: '1'.repeat(30) })), { ok: false, error: 'phone' });
  assert.deepEqual(env.post(guest({ attending: 'maybe' })), { ok: false, error: 'attending' });
  assert.deepEqual(env.post(null), { ok: false, error: 'invalid' });
  assert.equal(env.postRaw('not json').ok, false);
  assert.equal(env.postRaw('').ok, false);
  assert.equal(env.rows().length, 0);
});

test('כמויות מוגבלות לטווח סביר ונשמרות כמספרים', () => {
  const env = createEnv();
  env.post(guest({ adults: 999, kids: -5 }));
  env.post(guest({ phone: '0500000002', adults: '3', kids: '2' }));
  env.post(guest({ phone: '0500000003', adults: 'abc', kids: null }));
  env.post(guest({ phone: '0500000004', adults: 0, kids: 2.6 }));
  const rows = env.rows();
  assert.deepEqual(rows.map((r) => [r.adults, r.kids]), [[20, 0], [3, 2], [1, 0], [1, 3]]);
  rows.forEach((r) => { assert.equal(typeof r.adults, 'number'); assert.equal(typeof r.kids, 'number'); });
});

test('טקסט שנראה כמו נוסחה מנוטרל, וטקסט ארוך נחתך', () => {
  const env = createEnv();
  env.post(guest({ name: '=HYPERLINK("http://x","y")', food: '+SUM(A1)', note: '@cmd' }));
  env.post(guest({ phone: '0500000002', name: '-2+3', note: 'x'.repeat(5000) }));
  const [a, b] = env.rows();
  assert.equal(a.name, `'=HYPERLINK("http://x","y")`);
  assert.equal(a.food, `'+SUM(A1)`);
  assert.equal(a.note, `'@cmd`);
  assert.equal(b.name, `'-2+3`);
  assert.equal(b.note.length, 600);
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

test('מספר מחו״ל נשמר עם קידומת ומזוהה בעדכון חוזר', () => {
  const env = createEnv();
  env.post(guest({ name: 'Sarah Green', phone: '+1 (555) 123-4567' }));
  assert.equal(env.rows()[0].phone, `'+15551234567`);
  assert.equal(env.post(guest({ name: 'Sarah Green', phone: '15551234567', adults: 1 })).action, 'updated');
  assert.equal(env.rows().length, 1);
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
    const g = guest({ name: `משפחה ${i}`, phone: `05${String(10000000 + i)}`, adults: 1 + (i % 3), kids: i % 4 });
    env.post(g);
    expected.set(g.phone, g);
  }
  for (let i = 0; i < 40; i += 5) { // כל משפחה חמישית מבטלת
    const g = expected.get(`05${String(10000000 + i)}`);
    g.attending = 'no';
    env.post(g);
  }
  for (let i = 1; i < 40; i += 7) { // חלק מעדכנים כמויות
    const g = expected.get(`05${String(10000000 + i)}`);
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
