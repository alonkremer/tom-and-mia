// גיליון Google מדומה בזיכרון: מריץ את apps-script/Code.gs האמיתי בלי גוגל.
// משמש גם את בדיקות היחידה וגם את שרת הפיתוח (tools/dev-server.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const src = this.sheet.data[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(src[this.col - 1 + c] === undefined ? '' : src[this.col - 1 + c]);
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.numRows || values.some((v) => v.length !== this.numCols)) {
      throw new Error('setValues: dimensions do not match the range');
    }
    values.forEach((line, r) => {
      const target = this.sheet.data[this.row - 1 + r] || (this.sheet.data[this.row - 1 + r] = []);
      line.forEach((v, c) => { target[this.col - 1 + c] = v; });
    });
    return this;
  }
  setFontWeight() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; this.rtl = false; this.frozen = 0; }
  getLastRow() { return this.data.length; }
  getDataRange() {
    const cols = Math.max(1, ...this.data.map((r) => r.length));
    return new FakeRange(this, 1, 1, Math.max(1, this.data.length), cols);
  }
  getRange(row, col, numRows = 1, numCols = 1) { return new FakeRange(this, row, col, numRows, numCols); }
  appendRow(row) { this.data.push(row.slice()); return this; }
  deleteRow(n) { this.data.splice(n - 1, 1); return this; }
  setRightToLeft(v) { this.rtl = v; return this; }
  setFrozenRows(n) { this.frozen = n; return this; }
}

function createEnv() {
  const sheets = {};
  const lockLog = [];
  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets[n] || null,
        insertSheet: (n) => (sheets[n] = new FakeSheet(n))
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => lockLog.push('lock'),
        releaseLock: () => lockLog.push('release')
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, mime: null, setMimeType(m) { this.mime = m; return this; } })
    }
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  vm.runInContext(code, sandbox, { filename: 'Code.gs' });

  return {
    sheets,
    lockLog,
    /** שולח גוף בקשה כמו שהאתר שולח, ומחזיר את ה-JSON שהסקריפט עונה. */
    postRaw(body) {
      const out = sandbox.doPost({ postData: { contents: body } });
      return JSON.parse(out.text);
    },
    post(data) { return this.postRaw(JSON.stringify(data)); },
    /** שורות הנתונים (בלי הכותרת) כאובייקטים. */
    rows() {
      const sheet = sheets.RSVP;
      if (!sheet) return [];
      return sheet.data.slice(1).map((r) => ({
        updated: r[0], name: r[1], phone: r[2], attending: r[3], adults: r[4],
        kids: r[5], food: r[6], note: r[7], lang: r[8], created: r[9]
      }));
    },
    /** מה שנוסחאות גיליון "סיכום" מחשבות (SUMIF / COUNTIF), על הנתונים הנוכחיים. */
    summary() {
      const rows = this.rows();
      const yes = rows.filter((r) => r.attending === 'כן');
      const adults = yes.reduce((s, r) => s + r.adults, 0);
      const kids = yes.reduce((s, r) => s + r.kids, 0);
      return {
        adults, kids, total: adults + kids,
        familiesYes: yes.length,
        familiesNo: rows.filter((r) => r.attending === 'לא').length
      };
    }
  };
}

module.exports = { createEnv };
