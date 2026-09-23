// בדיקת קצה-לקצה מקיפה מול האתר החי, בכרום אמיתי עם הדמיית מכשירים.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'https://alonkremer.github.io/tom-and-mia/';
const ORIGIN = new URL(BASE).origin;
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (group, name, ok, detail) => {
  results.push({ group, name, ok: !!ok, detail: detail === undefined ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail)) });
  if (!ok) console.log('  FAIL:', group, '|', name, '|', detail === undefined ? '' : JSON.stringify(detail));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEB = /[\u0590-\u05FF]/;

const DEVICES = {
  'phone-375': { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'phone-320': { width: 320, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'phone-414': { width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'tablet-768': { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'desktop-1366': { width: 1366, height: 800, deviceScaleFactor: 1 },
  'desktop-1920': { width: 1920, height: 1080, deviceScaleFactor: 1 }
};

// מצב נקודת הקצה של הגיליון: ok / fail / abort = מדומה (לא נוגע בגיליון), real = אמיתי
let endpointMode = 'ok';
let posted = [];

async function newPage(browser, device, lang) {
  const page = await browser.newPage();
  await page.setViewport(DEVICES[device]);
  if (DEVICES[device].isMobile) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  }
  page.problems = { console: [], pageerror: [], failed: [] };
  page.on('console', (m) => { if (m.type() === 'error') page.problems.console.push(m.text()); });
  page.on('pageerror', (e) => page.problems.pageerror.push(String(e)));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !/google\.com\/maps|gstatic|googleapis\.com\/maps/.test(u)) page.problems.failed.push(r.status() + ' ' + u);
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if ((u.includes('script.google.com/macros') || u.endsWith('/mock-rsvp')) && req.method() === 'POST') {
      posted.push(JSON.parse(req.postData() || '{}'));
      const n = posted.length;
      if (endpointMode === 'real') return req.continue();
      if (endpointMode === 'abort') return req.abort('failed');
      if (endpointMode === 'hang') return; // אף פעם לא עונה
      const respond = (status, body) => req.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      if (endpointMode === 'fail') return respond(500, { ok: false });
      if (endpointMode === 'flaky' && n === 1) return respond(500, { ok: false });            // נכשל פעם אחת ואז מצליח
      if (endpointMode === 'noaction' && n === 1) return respond(200, { ok: true, service: 'rsvp' }); // "הצלחה" מזויפת של גוגל
      if (endpointMode === 'slow') return setTimeout(() => respond(200, { ok: true, action: 'updated' }), 7500);
      return respond(200, { ok: true, action: 'created' });
    }
    req.continue();
  });
  await page.goto(BASE + '?lang=' + lang + '&t=' + Date.now(), { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(600);
  return page;
}

async function revealAll(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewport().height;
  for (let y = 0; y < h; y += Math.round(vh * 0.7)) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(180); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
}

const shot = (page, name, fullPage = true) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage });
const hash = (page) => page.evaluate(() => location.hash);
const waitHash = async (page, h, ms = 30000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await hash(page) === h) return true; await sleep(150); }
  return false;
};
const setField = (page, sel, value) => page.evaluate((s, v) => {
  const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
}, sel, value);
const clickN = async (page, sel, n = 1) => { for (let i = 0; i < n; i++) await page.click(sel); };
const isHidden = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !e || e.hidden || getComputedStyle(e).display === 'none'; }, sel);

/* ================================================================== */
async function layoutAndVisual(browser) {
  for (const device of Object.keys(DEVICES)) {
    for (const lang of ['he', 'en']) {
      const G = `layout ${device} ${lang}`;
      const page = await newPage(browser, device, lang);
      await revealAll(page);

      const info = await page.evaluate(() => {
        const vis = (e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
        const de = document.documentElement;
        const over = [...document.querySelectorAll('#view-main *')].filter((e) => {
          if (e.closest('.cloud, .sparkle') || !(e instanceof HTMLElement) || !vis(e)) return false; // עננים חורגים מהמסך בכוונה
          const r = e.getBoundingClientRect();
          const p = document.querySelector('.page').getBoundingClientRect();
          return r.width > 0 && (r.left < p.left - 1 || r.right > p.right + 1);
        }).map((e) => e.tagName + '.' + String(e.className)).slice(0, 5);
        // טקסט שנחתך / גולש מהאלמנט שלו
        const clipped = [...document.querySelectorAll('#view-main .btn, #view-main h1, #view-main h2, #view-main .date-pill, #view-main .tile, #view-main .time')]
          .filter((e) => vis(e) && (e.scrollWidth > e.clientWidth + 2)).map((e) => e.className + ':' + e.textContent.trim().slice(0, 25));
        return {
          lang: de.lang, dir: de.dir, title: document.title,
          overflowX: de.scrollWidth > innerWidth, sw: de.scrollWidth, iw: innerWidth,
          outside: over, clipped,
          fonts: [document.fonts.check('600 20px Fredoka'), document.fonts.check('16px Assistant')],
          photos: [...document.querySelectorAll('.photo')].map((f) => ({ empty: f.classList.contains('empty'), w: f.querySelector('img').naturalWidth })),
          photoOrder: [...document.querySelectorAll('.photo')].map((f) => { const r = f.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }),
          unrevealed: document.querySelectorAll('.reveal:not(.in)').length,
          mapSrc: document.querySelector('#map').src
        };
      });
      check(G, 'שפה וכיוון נכונים', info.lang === lang && info.dir === (lang === 'he' ? 'rtl' : 'ltr'), info);
      check(G, 'אין גלילה אופקית', !info.overflowX, { sw: info.sw, iw: info.iw });
      check(G, 'אין אלמנטים שחורגים מרוחב העמוד', info.outside.length === 0, info.outside);
      check(G, 'אין טקסט חתוך בכפתורים/כותרות', info.clipped.length === 0, info.clipped);
      check(G, 'הגופנים נטענו', info.fonts.every(Boolean), info.fonts);
      check(G, '4 התמונות נטענו', info.photos.every((p) => !p.empty && p.w > 0), info.photos);
      const [p1, p2, p3, p4] = info.photoOrder;
      check(G, 'סדר התמונות: 1 למעלה מימין, 2 למעלה משמאל, 3 למטה מימין, 4 למטה משמאל',
        p1[0] > p2[0] && p3[0] > p4[0] && p1[1] < p3[1] && p2[1] < p4[1] && Math.abs(p1[1] - p2[1]) < 30, info.photoOrder);
      check(G, 'כל המקטעים נחשפו בגלילה', info.unrevealed === 0, info.unrevealed);
      check(G, 'אין שגיאות קונסול / JS / קבצים חסרים', page.problems.console.length + page.problems.pageerror.length + page.problems.failed.length === 0, page.problems);

      if (lang === 'en') {
        const heb = await page.evaluate((src) => {
          const re = new RegExp(src);
          return [...document.querySelectorAll('#view-main *')].filter((e) => e.children.length === 0 && e.offsetParent && re.test(e.textContent) && e.id !== 'lang-toggle')
            .map((e) => e.textContent.trim().slice(0, 30));
        }, HEB.source);
        check(G, 'אין עברית שנשארה בגרסה האנגלית', heb.length === 0, heb);
      }
      await shot(page, `main-${device}-${lang}`);
      await page.close();
    }
  }
}

/* ================================================================== */
async function functional(browser) {
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(ORIGIN, ['clipboard-read', 'clipboard-write']);
  let G = 'functional main';
  let page = await newPage(browser, 'phone-375', 'he');
  await page.evaluate(() => localStorage.clear());

  // ספירה לאחור
  const cd = await page.evaluate(() => {
    const mins = Math.floor((new Date(window.EVENT_CONFIG.startUtc) - Date.now()) / 60000);
    return { days: [document.querySelector('#cd-days').textContent, String(Math.floor(mins / 1440))], hours: [document.querySelector('#cd-hours').textContent, String(Math.floor((mins % 1440) / 60))] };
  });
  check(G, 'ספירה לאחור מחשבת נכון', cd.days[0] === cd.days[1] && cd.hours[0] === cd.hours[1], cd);

  // תאריכים
  const dates = await page.evaluate(() => ({ pill: document.querySelector('.date-pill').textContent, deadline: document.querySelector('.hero-deadline').textContent }));
  const venue = await page.evaluate(() => ({ hero: document.querySelector('.hero-where').textContent, card: document.querySelector('[data-i18n="dir.venue"]').textContent, park: document.querySelector('[data-i18n="park.2"]').textContent, all: document.body.textContent }));
  check(G, 'שם המקום: ""בית 770"", החניה: "בניין הלבנים האדומות – "בית 770"", ואין "בית חב״ד" באתר',
    venue.hero === '"בית 770" · ראשון לציון' && venue.card === '"בית 770"' && venue.park.includes('בניין הלבנים האדומות – "בית 770"') && !/חב״ד|Chabad/.test(venue.all), [venue.hero, venue.card]);
  check(G, 'תאריך האירוע והדדליין מוצגים נכון', dates.pill === 'יום שלישי · 27.10.2026 · 10:30' && dates.deadline.includes('יום שלישי, 20.10'), dates);

  check(G, 'לו"ז: 10:30 הגעה והתכנסות', (await page.$eval('.schedule li', (li) => li.textContent)).includes('הגעה והתכנסות'));

  // קישורים
  const links = await page.evaluate(() => ({
    waze: decodeURIComponent(document.querySelector('#waze-link').href), gmaps: decodeURIComponent(document.querySelector('#gmaps-link').href),
    wa: document.querySelector('#wa-link').href, gcal: decodeURIComponent(document.querySelector('#cal-google').href),
    ics: document.querySelector('#cal-menu a[href$="event.ics"]').href, map: decodeURIComponent(document.querySelector('#map').src),
    blank: [...document.querySelectorAll('a[target=_blank]')].every((a) => a.rel.includes('noopener'))
  }));
  check(G, 'קישור Waze עם הכתובת וניווט', links.waze.includes('מרדכי יואל סגל 3, ראשון לציון') && links.waze.includes('navigate=yes'), links.waze);
  check(G, 'קישור Google Maps עם הכתובת', links.gmaps.includes('destination=מרדכי יואל סגל 3, ראשון לציון'), links.gmaps);
  check(G, 'מפה מוטמעת עם הכתובת', links.map.includes('מרדכי יואל סגל 3') && links.map.includes('output=embed'), links.map);
  check(G, 'קישור וואטסאפ למספר הנכון', links.wa.startsWith('https://wa.me/972549488882?text='), links.wa.slice(0, 60));
  check(G, 'יומן Google: תאריך ושעה נכונים (UTC)', links.gcal.includes('dates=20261027T083000Z/20261027T110000Z') && links.gcal.includes('"בית 770"'), links.gcal.slice(0, 200));
  check(G, 'קישורים חיצוניים עם rel=noopener', links.blank);
  const ics = await page.evaluate(async (u) => (await fetch(u)).text(), links.ics);
  check(G, 'קובץ היומן (ICS) תקין', /BEGIN:VEVENT/.test(ics) && ics.includes('DTSTART:20261027T083000Z') && ics.includes('DTEND:20261027T110000Z') && ics.includes('\r\n') && /END:VCALENDAR\s*$/.test(ics));

  // תפריט יומן
  await page.click('#cal-toggle');
  check(G, 'תפריט "הוספה ליומן" נפתח', !(await isHidden(page, '#cal-menu')) && await page.$eval('#cal-toggle', (b) => b.getAttribute('aria-expanded')) === 'true');
  await page.click('#cal-toggle');
  check(G, 'תפריט "הוספה ליומן" נסגר', await isHidden(page, '#cal-menu'));

  // כפתור צף
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await sleep(500);
  check(G, 'כפתור צף מוסתר בראש העמוד', await isHidden(page, '#sticky-cta'));
  await page.evaluate(() => document.querySelector('#directions').scrollIntoView({ behavior: 'instant' })); await sleep(500);
  check(G, 'כפתור צף מופיע באמצע העמוד', !(await isHidden(page, '#sticky-cta')));
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await sleep(600);
  check(G, 'כפתור צף נעלם כשכפתור התחתית על המסך', await isHidden(page, '#sticky-cta'));

  // העתקת מספר
  await page.evaluate(() => document.querySelector('#copy-phone').scrollIntoView({ behavior: 'instant', block: 'center' })); await sleep(300);
  await page.click('#copy-phone'); await sleep(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const toast = await page.evaluate(() => ({ text: document.querySelector('#toast').textContent, shown: document.querySelector('#toast').classList.contains('show') }));
  check(G, 'העתקת מספר: הלוח מכיל 0549488882', clip === '0549488882', clip);
  check(G, 'העתקת מספר: הודעה קופצת', toast.shown && toast.text === 'המספר הועתק', toast);

  // חלון מתנה
  G = 'functional gift';
  await page.bringToFront(); await page.evaluate(() => navigator.clipboard.writeText('x').catch(() => {}));
  await page.click('[data-gift="bit"]'); await sleep(500);
  let gd = await page.evaluate(() => ({ open: document.querySelector('#gift-dialog').open, title: document.querySelector('#gift-dialog-title').textContent, step1: document.querySelector('#gd-step1').textContent,
    copied: getComputedStyle(document.querySelector('.dialog-copied')).visibility, num: document.querySelector('#gift-dialog .phone-num').textContent, openBtnHidden: document.querySelector('#gd-open').hidden }));
  check(G, 'bit: החלון נפתח עם הכותרת והמספר', gd.open && gd.title.includes('bit') && gd.step1.includes('bit') && gd.num === '054-948-8882', gd);
  const openBtn = await page.evaluate(() => ({ hidden: document.querySelector('#gd-open').hidden, href: document.querySelector('#gd-open').getAttribute('href'), text: document.querySelector('#gd-open').textContent, note: !document.querySelector('#gd-open-note').hidden }));
  check(G, 'bit באייפון: כפתור "פתיחת bit" עם קישור התשלום האישי (מה-QR)', !openBtn.hidden && openBtn.href === 'https://www.bitpay.co.il/app/me/F64A64DB-6EB8-23B6-97AC-CD5F9A7EABCF8EA3' && openBtn.text === 'פתיחת bit' && openBtn.note && gd.step1.includes('פתיחת bit'), openBtn);
  check(G, 'bit: המספר הועתק אוטומטית', gd.copied === 'visible' && await page.evaluate(() => navigator.clipboard.readText()) === '0549488882', gd.copied);
  const steps = await page.$$eval('#gift-dialog .dialog-steps li', (l) => l.map((e) => e.textContent));
  check(G, 'bit: שני צעדים בלבד, בלי הדבקת מספר (הקישור האישי פותח ישר תשלום לאלון קרמר)', steps.length === 2 && !steps.join(' ').includes('חזרו') && steps[1].includes('אלון קרמר') && !steps[1].includes('הדביקו'), steps);
  await shot(page, 'gift-dialog-phone-he', false);

  // חזרה מהאפליקציה: מהר מדי → נשארים בחלון; אחרי זמן סביר → מסך תודה אוטומטי
  const comeBack = (afterMs) => page.evaluate(async (ms) => {
    window.EVENT_CONFIG.giftReturnMs = 600;
    const open = document.querySelector('#gd-open');
    open.addEventListener('click', (e) => e.preventDefault(), { once: true }); // בבדיקה לא באמת יוצאים לאפליקציה
    open.click();
    await new Promise((res) => setTimeout(res, ms));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((res) => setTimeout(res, 200));
    return { hash: location.hash, open: document.querySelector('#gift-dialog').open };
  }, afterMs);
  const quick = await comeBack(100);
  check(G, 'חזרה מיידית מהאפליקציה: נשארים בחלון המתנה', quick.open && quick.hash !== '#thanks-gift', quick);
  const later = await comeBack(800);
  check(G, 'חזרה אחרי זמן העברה: מסך "תודה על המתנה" מופיע לבד', !later.open && later.hash === '#thanks-gift', later);
  await page.evaluate(() => { location.hash = ''; }); await sleep(400);
  await page.evaluate(() => document.querySelector('[data-gift="bit"]').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('[data-gift="bit"]'); await sleep(400);
  await page.click('#gd-cancel'); await sleep(200);
  check(G, '"סגירה" סוגרת בלי לעבור מסך', !(await page.$eval('#gift-dialog', (d) => d.open)) && (await hash(page)) === '');
  await page.click('[data-gift="paybox"]'); await sleep(400);
  check(G, 'PayBox באייפון: הכפתור מצביע על links.payboxapp.com', (await page.$eval('#gd-open', (e) => e.getAttribute('href'))) === 'https://links.payboxapp.com/open');
  check(G, 'PayBox: אין קישור אישי, לכן ההוראה היא להדביק את המספר', (await page.$eval('#gd-step2', (e) => e.textContent)).includes('הדביקו את המספר'));
  check(G, 'PayBox: הכותרת מתחלפת', (await page.$eval('#gift-dialog-title', (e) => e.textContent)).includes('PayBox'));
  await page.keyboard.press('Escape'); await sleep(200);
  check(G, 'Escape סוגר את החלון', !(await page.$eval('#gift-dialog', (d) => d.open)));
  await page.click('[data-gift="paybox"]'); await sleep(300);
  await page.click('#gd-done');
  check(G, '"העברתי" מוביל למסך תודה על המתנה', await waitHash(page, '#thanks-gift', 3000));
  await sleep(700);
  const tg = await page.evaluate(() => ({ gift: !document.querySelector('[data-variant=gift]').hidden, others: document.querySelector('[data-variant=yes]').hidden && document.querySelector('[data-variant=no]').hidden,
    pink: document.querySelector('#view-thanks').classList.contains('is-gift'), toRsvp: !document.querySelector('#gift-to-rsvp').hidden, focus: document.activeElement.tagName }));
  check(G, 'מסך תודה-מתנה: הגרסה הנכונה, רקע ורוד, פוקוס על הכותרת', tg.gift && tg.others && tg.pink && tg.focus === 'H1', tg);
  check(G, 'מי שלא אישר הגעה רואה "עוד לא אישרתם הגעה?"', tg.toRsvp);
  await shot(page, 'thanks-gift-phone-he', false);

  // אנדרואיד ומחשב: קישור intent / בלי כפתור
  {
    const ap = await browser.newPage();
    await ap.setViewport(DEVICES['phone-375']);
    await ap.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
    await ap.goto(BASE + '?lang=he', { waitUntil: 'networkidle2' });
    await ap.evaluate(() => document.querySelector('[data-gift="bit"]').click()); await sleep(300);
    const bitHref = await ap.$eval('#gd-open', (e) => e.getAttribute('href'));
    await ap.evaluate(() => { document.querySelector('#gd-cancel').click(); document.querySelector('[data-gift="paybox"]').click(); }); await sleep(300);
    const pbHref = await ap.$eval('#gd-open', (e) => e.getAttribute('href'));
    check(G, 'אנדרואיד: bit = הקישור האישי, PayBox = intent עם שם החבילה וגיבוי לחנות',
      bitHref === 'https://www.bitpay.co.il/app/me/F64A64DB-6EB8-23B6-97AC-CD5F9A7EABCF8EA3' &&
      pbHref.startsWith('intent://links.payboxapp.com/open#Intent;scheme=https;package=com.payboxapp;'), [bitHref, pbHref]);
    await ap.close();
    const dp = await browser.newPage();
    await dp.setViewport(DEVICES['desktop-1366']);
    await dp.goto(BASE + '?lang=he', { waitUntil: 'networkidle2' });
    await dp.evaluate(() => document.querySelector('[data-gift="bit"]').click()); await sleep(300);
    const desk = await dp.evaluate(() => ({ btn: document.querySelector('#gd-open').hidden, note: document.querySelector('#gd-open-note').hidden, step1: document.querySelector('#gd-step1').textContent }));
    check(G, 'מחשב: אין כפתור פתיחת אפליקציה, ההוראות נשארות ידניות', desk.btn && desk.note && desk.step1 === 'פתחו את אפליקציית bit', desk);
    await dp.close();
  }

  // ניווט
  G = 'functional navigation';
  await sleep(400);
  await page.click('#gift-to-rsvp');
  const navOk = await waitHash(page, '#rsvp', 3000);
  await sleep(250); // המסך מתחלף באירוע hashchange, רגע אחרי שהכתובת משתנה
  check(G, 'מעבר ממסך המתנה לטופס', navOk && !(await isHidden(page, '#view-rsvp')) && await isHidden(page, '#view-main'),
    { navOk, hash: await hash(page), btn: await page.evaluate(() => { const b = document.querySelector('#gift-to-rsvp'); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { hidden: b.hidden, rect: [Math.round(r.top), Math.round(r.height)], topEl: top && (top.id || top.className) }; }) });
  check(G, 'בטופס אין כפתור צף', await isHidden(page, '#sticky-cta'));
  check(G, 'הטופס נפתח בראש העמוד', (await page.evaluate(() => scrollY)) === 0);
  await page.goBack(); await sleep(400);
  check(G, 'כפתור "אחורה" של הדפדפן עובד', (await hash(page)) === '#thanks-gift');
  await page.goto(BASE + '#rsvp', { waitUntil: 'networkidle2' }); await sleep(500);
  check(G, 'קישור ישיר ל-#rsvp פותח את הטופס', !(await isHidden(page, '#view-rsvp')));
  await page.click('.back-link'); await sleep(400);
  check(G, '"חזרה להזמנה" מחזיר לעמוד הראשי', !(await isHidden(page, '#view-main')) && (await hash(page)) === '');

  // טופס
  G = 'functional form';
  await page.click('#hero-cta'); await waitHash(page, '#rsvp', 3000); await sleep(300);
  check(G, 'אין שדה טלפון', (await page.$('#f-phone')) === null);
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  posted = [];
  await page.click('#submit-btn'); await sleep(200);
  let st = await page.evaluate(() => ({ err: !document.querySelector('#err-name').hidden, focus: document.activeElement.id, invalid: document.querySelector('#f-name').getAttribute('aria-invalid'), dlg: document.querySelector('#confirm-dialog').open }));
  check(G, 'שליחה ריקה: שגיאה, פוקוס על השם, בלי חלון ובלי שליחה', st.err && st.focus === 'f-name' && st.invalid === 'true' && !st.dlg && posted.length === 0, st);
  await page.type('#f-name', 'דנה'); await page.click('#submit-btn'); await sleep(150);
  check(G, 'שם פרטי בלבד נדחה', !(await page.$eval('#err-name', (e) => e.hidden)) && posted.length === 0);
  await page.type('#f-name', ' לוי');
  check(G, 'השגיאה נעלמת בזמן הקלדה', await page.$eval('#err-name', (e) => e.hidden));

  // מונים
  await clickN(page, '[data-step="adults"][data-delta="-1"]', 5);
  const minA = await page.$eval('#n-adults', (e) => e.textContent);
  await clickN(page, '[data-step="adults"][data-delta="1"]', 25);
  const maxA = await page.$eval('#n-adults', (e) => e.textContent);
  await clickN(page, '[data-step="kids"][data-delta="-1"]', 3);
  const minK = await page.$eval('#n-kids', (e) => e.textContent);
  await clickN(page, '[data-step="kids"][data-delta="1"]', 25);
  const maxK = await page.$eval('#n-kids', (e) => e.textContent);
  const manyFields = await page.$$eval('#comp-list input', (l) => l.length);
  check(G, 'מונים: בוגרים 1–20, ילדים 0–20', minA === '1' && maxA === '20' && minK === '0' && maxK === '20', { minA, maxA, minK, maxK });
  check(G, 'שדות שמות נפתחים לפי המונים (19 + 20)', manyFields === 39, manyFields);
  await clickN(page, '[data-step="adults"][data-delta="-1"]', 18);
  await clickN(page, '[data-step="kids"][data-delta="-1"]', 18);
  const chips = await page.$$eval('#comp-list .comp-chip', (l) => l.map((e) => e.textContent));
  check(G, 'תוויות השדות: בוגר/ת 2, ילד/ה 1, ילד/ה 2', JSON.stringify(chips) === JSON.stringify(['בוגר/ת 2', 'ילד/ה 1', 'ילד/ה 2']), chips);
  const hints = await page.$$eval('#view-rsvp .stepper-hint', (l) => l.map((e) => e.textContent));
  check(G, 'הבהרת גילים ליד המונים', hints[0] === 'גיל 13 ומעלה' && hints[1] === 'עד גיל 12', hints);

  await page.type('[data-comp="adult-0"]', 'רוני');
  await page.type('[data-comp="kid-0"]', 'נועה');
  await page.type('[data-comp="kid-1"]', '<img src=x onerror="window.__xss=1">');
  await page.click('[data-step="kids"][data-delta="-1"]'); await page.click('[data-step="kids"][data-delta="1"]');
  check(G, 'שמות נשמרים כשמורידים ומעלים כמות', (await page.$eval('[data-comp="kid-1"]', (e) => e.value)).startsWith('<img'));
  await page.type('#f-food', 'צמחוני');
  await page.type('#f-note', 'מזל טוב! 🎈');
  await shot(page, 'rsvp-filled-phone-he');

  // חלון וידוא
  G = 'functional confirm dialog';
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn'); await sleep(400);
  let cf = await page.evaluate(() => ({ open: document.querySelector('#confirm-dialog').open, a: document.querySelector('#cf-adults').textContent, k: document.querySelector('#cf-kids').textContent, t: document.querySelector('#cf-total').textContent,
    an: document.querySelector('#cf-adult-names').textContent, kn: document.querySelector('#cf-kid-names').textContent, injected: !!document.querySelector('#confirm-dialog img'), xss: window.__xss === 1,
    hints: [...document.querySelectorAll('#confirm-dialog .stepper-hint')].map((e) => e.textContent) }));
  check(G, 'נפתח עם הכמויות והסה״כ', cf.open && cf.a === '2' && cf.k === '2' && cf.t === '4', cf);
  check(G, 'מציג את השמות', cf.an === 'דנה לוי, רוני' && cf.kn.startsWith('נועה, <img'), [cf.an, cf.kn]);
  check(G, 'מציין גילים (13+ / עד 12)', cf.hints.join('|') === 'גיל 13 ומעלה|עד גיל 12', cf.hints);
  check(G, 'קלט זדוני מוצג כטקסט ולא רץ (XSS)', !cf.injected && !cf.xss);
  check(G, 'עדיין לא נשלח כלום', posted.length === 0);
  await shot(page, 'confirm-dialog-phone-he', false);
  await page.click('#cf-no'); await sleep(500);
  st = await page.evaluate(() => ({ open: document.querySelector('#confirm-dialog').open, hash: location.hash, focus: document.activeElement.getAttribute('data-step'),
    inView: (() => { const r = document.querySelector('.steppers').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() }));
  check(G, '"לתקן" סוגר, לא שולח, ומחזיר למונים', !st.open && st.hash === '#rsvp' && st.focus === 'adults' && st.inView && posted.length === 0, st);
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn'); await sleep(300);
  await page.keyboard.press('Escape'); await sleep(200);
  check(G, 'Escape סוגר בלי לשלוח', !(await page.$eval('#confirm-dialog', (d) => d.open)) && posted.length === 0);

  // שליחה מוצלחת (מדומה)
  G = 'functional submit';
  endpointMode = 'ok';
  await page.click('#submit-btn'); await sleep(300);
  await page.click('#cf-yes');
  check(G, 'אישור → מסך "תודה רבה"', await waitHash(page, '#thanks-yes', 5000));
  const body = posted[0] || {};
  check(G, 'נשלחה בקשה אחת בדיוק', posted.length === 1, posted.length);
  check(G, 'תוכן הבקשה נכון ומלא', body.name === 'דנה לוי' && body.attending === 'yes' && body.adults === 2 && body.kids === 2 && JSON.stringify(body.adultNames) === '["רוני"]' && body.kidNames.length === 2 && body.food === 'צמחוני' && body.note === 'מזל טוב! 🎈' && body.lang === 'he' && !('phone' in body), body);
  await sleep(900);
  const ty = await page.evaluate(() => ({ yes: !document.querySelector('[data-variant=yes]').hidden, text: document.querySelector('[data-variant=yes]').innerText, focus: document.activeElement.tagName, done: localStorage.getItem('rsvpDone') }));
  check(G, 'מסך תודה: טקסט, תאריך ושעה', ty.yes && ty.text.includes('אישור ההגעה שלכם נקלט') && ty.text.includes('יום שלישי, 27.10') && ty.text.includes('10:30') && ty.text.includes('אלון, הדר, מיה ותום'), ty.text.slice(0, 200));
  check(G, 'פוקוס עובר לכותרת (נגישות)', ty.focus === 'H1');
  await shot(page, 'thanks-yes-phone-he', false);
  await page.click('[data-variant=yes] a[href="#directions"]'); await sleep(600);
  const dirTop = await page.evaluate(() => Math.round(document.querySelector('#directions').getBoundingClientRect().top));
  check(G, '"חזרה להוראות ההגעה" גולל למקטע הנכון', !(await isHidden(page, '#view-main')) && Math.abs(dirTop) < 5, dirTop);
  await page.evaluate(() => { location.hash = 'rsvp'; }); await sleep(500);
  check(G, 'בכניסה חוזרת: הודעת "כבר קיבלנו מכם תשובה"', !(await isHidden(page, '#already')));

  // לא מגיעים
  G = 'functional not coming';
  posted = [];
  await page.click('.segmented label:nth-child(2)'); await sleep(200);
  check(G, 'בחירת "לא נוכל להגיע" מסתירה מונים, שמות ואלרגיות', await isHidden(page, '#coming-fields'));
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn');
  check(G, 'נשלח בלי חלון וידוא → מסך "תודה שעדכנתם"', await waitHash(page, '#thanks-no', 5000) && !(await page.$eval('#confirm-dialog', (d) => d.open)));
  const nb = posted[0] || {};
  check(G, 'הבקשה: לא מגיעים, 0 בוגרים, 0 ילדים, בלי שמות', nb.attending === 'no' && nb.adults === 0 && nb.kids === 0 && nb.adultNames.length === 0 && nb.kidNames.length === 0 && nb.food === '', nb);
  await sleep(600);
  await shot(page, 'thanks-no-phone-he', false);

  // תקלות
  G = 'functional failures';
  for (const mode of ['fail', 'abort']) {
    endpointMode = mode; posted = [];
    await page.evaluate(() => { location.hash = 'rsvp'; }); await sleep(400);
    await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
    await page.click('#submit-btn'); await sleep(1500);
    const f = await page.evaluate(() => ({ hash: location.hash, box: !document.querySelector('#send-error').hidden, wa: decodeURIComponent(document.querySelector('#send-wa').href), enabled: !document.querySelector('#submit-btn').disabled, label: document.querySelector('#submit-btn').textContent.trim() }));
    check(G, `${mode === 'fail' ? 'שגיאת שרת' : 'נפילת רשת'}: נשארים בטופס, הודעת שגיאה, גיבוי וואטסאפ עם הפרטים, הכפתור חוזר לפעולה`,
      f.hash === '#rsvp' && f.box && f.wa.includes('wa.me/972549488882') && f.wa.includes('דנה לוי') && f.enabled && f.label === 'שליחת התשובה', f);
    check(G, `${mode}: בוצע ניסיון חוזר אוטומטי (2 בקשות)`, posted.length === 2, posted.length);
    if (mode === 'fail') await shot(page, 'send-error-phone-he', false);
  }
  endpointMode = 'ok'; posted = [];
  await page.click('#submit-btn');
  check(G, 'ניסיון חוזר ידני אחרי תקלה מצליח', await waitHash(page, '#thanks-no', 5000));

  // תקלה רגעית: הניסיון הראשון נכשל, השני מצליח – האורח לא רואה שגיאה
  for (const mode of ['flaky', 'noaction']) {
    endpointMode = mode; posted = [];
    await page.evaluate(() => { location.hash = 'rsvp'; }); await sleep(400);
    await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
    await page.click('#submit-btn');
    const ok = await waitHash(page, '#thanks-no', 6000);
    check(G, mode === 'flaky' ? 'תקלה רגעית בשרת: ניסיון חוזר אוטומטי מציל את השליחה' : 'תשובת "הצלחה" בלי אישור כתיבה לא מתקבלת – נשלח שוב עד שנכתב',
      ok && posted.length === 2, { ok, requests: posted.length });
  }

  // שרת איטי: הודעה מרגיעה, ובסוף הצלחה
  endpointMode = 'slow'; posted = [];
  await page.evaluate(() => { location.hash = 'rsvp'; }); await sleep(400);
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn'); await sleep(300);
  const sending = await page.evaluate(() => ({ label: document.querySelector('#submit-btn').textContent.trim(), disabled: document.querySelector('#submit-btn').disabled }));
  check(G, 'בזמן שליחה: הכפתור נעול ומציג "שולחים…" (אין שליחה כפולה)', sending.disabled && sending.label === 'שולחים…', sending);
  await sleep(6200);
  const slowLabel = await page.$eval('#submit-btn', (b) => b.textContent.trim());
  check(G, 'שרת איטי: אחרי 6 שניות מופיעה הודעה מרגיעה', slowLabel === 'עוד רגע… זה לוקח קצת זמן', slowLabel);
  check(G, 'שרת איטי: בסוף השליחה מצליחה', await waitHash(page, '#thanks-no', 8000) && posted.length === 1, posted.length);

  // שרת שלא עונה בכלל: אחרי שני ניסיונות – שגיאה + גיבוי וואטסאפ (מקצרים את ההמתנה לצורך הבדיקה)
  endpointMode = 'hang'; posted = [];
  await page.evaluate(() => { location.hash = 'rsvp'; window.EVENT_CONFIG.rsvpTimeoutsMs = [1200, 1200]; }); await sleep(400);
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn'); await sleep(3400);
  const hung = await page.evaluate(() => ({ box: !document.querySelector('#send-error').hidden, enabled: !document.querySelector('#submit-btn').disabled, hash: location.hash }));
  check(G, 'שרת שלא עונה: timeout → ניסיון חוזר → שגיאה עם גיבוי וואטסאפ', hung.box && hung.enabled && hung.hash === '#rsvp' && posted.length === 2, { hung, requests: posted.length });
  await page.evaluate(() => { window.EVENT_CONFIG.rsvpTimeoutsMs = [30000, 40000]; });
  endpointMode = 'ok';

  // מלכודת ספאם
  posted = [];
  await page.evaluate(() => { location.hash = 'rsvp'; }); await sleep(400);
  await page.evaluate(() => { document.querySelector('input[name=website]').value = 'http://spam'; });
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn'); await sleep(600);
  check(G, 'מלכודת ספאם: בוט לא מגיע לגיליון', posted.length === 0 && (await hash(page)) === '#thanks-no');
  const hp = await page.evaluate(() => { const r = document.querySelector('.hp').getBoundingClientRect(); return { w: r.width, h: r.height, tab: document.querySelector('input[name=website]').tabIndex }; });
  check(G, 'השדה הנסתר באמת נסתר ולא בר-טאב', hp.w <= 1 && hp.h <= 1 && hp.tab === -1, hp);
  check(G, 'אין שגיאות JS לאורך כל התרחישים', page.problems.pageerror.length === 0, page.problems.pageerror);
  await page.close();

  // אנגלית + שמירת שפה
  G = 'functional english';
  page = await newPage(browser, 'phone-375', 'he');
  await page.evaluate(() => localStorage.clear());
  await page.click('#lang-toggle'); await sleep(300);
  check(G, 'כפתור השפה מחליף לאנגלית + LTR', await page.evaluate(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr' && document.querySelector('#lang-toggle').textContent === 'עב'));
  await page.goto(BASE, { waitUntil: 'networkidle2' }); await sleep(400);
  check(G, 'השפה נשמרת אחרי רענון', await page.evaluate(() => document.documentElement.lang === 'en'));
  await page.click('#hero-cta'); await waitHash(page, '#rsvp', 3000); await sleep(300);
  await page.type('#f-name', 'Sarah Green');
  await page.click('[data-step="kids"][data-delta="1"]');
  const enForm = await page.evaluate((src) => {
    const re = new RegExp(src);
    return [...document.querySelectorAll('#view-rsvp *')].filter((e) => e.children.length === 0 && e.offsetParent && re.test(e.textContent + (e.placeholder || ''))).map((e) => (e.textContent || e.placeholder).slice(0, 30));
  }, HEB.source);
  check(G, 'הטופס כולו באנגלית', enForm.length === 0, enForm);
  await shot(page, 'rsvp-phone-en');
  posted = []; endpointMode = 'ok';
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn'); await sleep(400);
  const enDlg = await page.$eval('#confirm-dialog', (d) => d.innerText);
  check(G, 'חלון הווידוא באנגלית', !HEB.test(enDlg) && enDlg.includes('Age 12 and under') && enDlg.includes('Total coming'), enDlg.replace(/\n/g, ' | '));
  await shot(page, 'confirm-dialog-phone-en', false);
  await page.click('#cf-yes'); await waitHash(page, '#thanks-yes', 5000); await sleep(700);
  const enTy = await page.$eval('[data-variant=yes]', (d) => d.innerText);
  check(G, 'מסך התודה באנגלית עם תאריך', !HEB.test(enTy) && enTy.includes('Tuesday, October 27') && enTy.includes('10:30'), enTy.replace(/\n/g, ' | ').slice(0, 220));
  check(G, 'הבקשה מסומנת lang=en', (posted[0] || {}).lang === 'en');
  await page.click('[data-variant=yes] a[href="#directions"]'); await sleep(400);
  await page.click('#lang-toggle'); await sleep(300);
  check(G, 'חזרה לעברית מחזירה את כל הטקסטים', await page.evaluate(() => document.documentElement.dir === 'rtl' && document.querySelector('#hero-cta span').textContent === 'מגיעים? עדכנו אותנו' && document.querySelector('.date-pill').textContent.startsWith('יום שלישי')));
  await page.close();
}

/* ================================================================== */
async function accessibility(browser) {
  const G = 'accessibility';
  const page = await newPage(browser, 'phone-375', 'he');
  await revealAll(page);
  const a = await page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const name = (e) => (e.getAttribute('aria-label') || e.textContent || '').trim();
    document.querySelector('#view-rsvp').hidden = false; // בודקים גם את הטופס
    const out = {};
    out.unnamedButtons = [...document.querySelectorAll('button, a[href]')].filter((e) => !e.hidden && !name(e)).map((e) => e.outerHTML.slice(0, 80));
    out.unlabeled = [...document.querySelectorAll('input:not([type=radio]):not([name=website]), textarea')].filter((e) => !(e.id && document.querySelector('label[for="' + e.id + '"]')) && !e.getAttribute('aria-label')).map((e) => e.outerHTML.slice(0, 80));
    out.imgNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.alt).length;
    out.decorativeSvgExposed = [...document.querySelectorAll('svg')].filter((s) => s.getAttribute('aria-hidden') !== 'true' && !s.closest('[aria-hidden=true]')).length;
    out.dialogs = [...document.querySelectorAll('dialog')].map((d) => !!d.getAttribute('aria-labelledby') && !!document.getElementById(d.getAttribute('aria-labelledby')));
    out.smallTargets = [...document.querySelectorAll('#view-main a.btn, #view-main button, #view-rsvp button, #view-rsvp a, #view-rsvp .segmented span, .cal-menu a')]
      .filter(vis).map((e) => ({ t: name(e).slice(0, 20), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })).filter((r) => r.h < 44 || r.w < 44);
    out.fontTooSmall = [...document.querySelectorAll('#view-main *, #view-rsvp *')].filter((e) => vis(e) && e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.textContent.trim().slice(0, 20));
    out.inputZoom = [...document.querySelectorAll('#view-rsvp input[type=text], #view-rsvp textarea')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;

    // ניגודיות צבעים
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m[3] === undefined ? 1 : m[3] }; };
    const bgOf = (e) => { while (e) { const b = parse(getComputedStyle(e).backgroundColor); if (b.a > 0.9) return b.rgb; e = e.parentElement; } return [255, 255, 255]; };
    out.lowContrast = [];
    [...document.querySelectorAll('#view-main *, #view-rsvp *')].forEach((e) => {
      if (!vis(e) || !e.textContent.trim() || [...e.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim())) return;
      const cs = getComputedStyle(e); const fg = parse(cs.color).rgb; const bg = bgOf(e);
      const l1 = lum(fg), l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize); const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      if (ratio < (large ? 3 : 4.5)) out.lowContrast.push({ t: e.textContent.trim().slice(0, 22), ratio: +ratio.toFixed(2), size });
    });
    out.h1Main = document.querySelectorAll('#view-main h1').length;
    return out;
  });
  check(G, 'לכל כפתור וקישור יש שם נגיש', a.unnamedButtons.length === 0, a.unnamedButtons);
  check(G, 'לכל שדה יש תווית', a.unlabeled.length === 0, a.unlabeled);
  check(G, 'לכל תמונה יש alt', a.imgNoAlt === 0, a.imgNoAlt);
  check(G, 'איורים דקורטיביים מוסתרים מקוראי מסך', a.decorativeSvgExposed === 0, a.decorativeSvgExposed);
  check(G, 'לחלונות הקופצים יש כותרת נגישה', a.dialogs.every(Boolean), a.dialogs);
  check(G, 'כל אזורי הלחיצה בגודל 44px לפחות', a.smallTargets.length === 0, a.smallTargets);
  check(G, 'אין טקסט קטן מ-13px', a.fontTooSmall.length === 0, a.fontTooSmall);
  check(G, 'שדות בגודל 16px+ (אייפון לא עושה זום בהקלדה)', a.inputZoom === 0, a.inputZoom);
  check(G, 'ניגודיות צבעים תקינה (WCAG AA)', a.lowContrast.length === 0, a.lowContrast);
  check(G, 'כותרת ראשית אחת בעמוד', a.h1Main === 1, a.h1Main);

  // מקלדת: טאב מגיע לכפתור אישור הגעה
  await page.goto(BASE + '?lang=he', { waitUntil: 'networkidle2' });
  const order = [];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.className)); }
  check(G, 'ניווט מקלדת: שפה → אישור הגעה', order[0] === 'lang-toggle' && order[1] === 'hero-cta', order);
  await page.close();

  // הפחתת תנועה
  const p2 = await browser.newPage();
  await p2.setViewport(DEVICES['phone-375']);
  await p2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p2.goto(BASE + '?lang=he', { waitUntil: 'networkidle2' });
  const rm = await p2.evaluate(() => ({ balloon: getComputedStyle(document.querySelector('.balloon')).animationName, reveal: getComputedStyle(document.querySelector('.reveal')).opacity }));
  check(G, 'מצב "הפחתת תנועה" מכובד (בלי אנימציות, תוכן גלוי)', rm.balloon === 'none' && rm.reveal === '1', rm);
  await p2.close();
}

/* ================================================================== */
async function metaAndPerf(browser) {
  const G = 'meta & performance';
  const page = await newPage(browser, 'phone-375', 'he');
  const m = await page.evaluate(async () => {
    const get = (s) => (document.querySelector(s) || {}).content;
    const og = get('meta[property="og:image"]');
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = og; });
    const entries = performance.getEntriesByType('resource');
    const own = entries.filter((e) => e.name.includes('alonkremer.github.io'));
    return { ogTitle: get('meta[property="og:title"]'), ogDesc: get('meta[property="og:description"]'), ogUrl: get('meta[property="og:url"]'), og, img, robots: get('meta[name=robots]'), viewport: get('meta[name=viewport]'),
      favicon: !!document.querySelector('link[rel=icon]'), ownBytes: own.reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0), ownCount: own.length,
      biggest: own.map((e) => [e.name.split('/').pop().split('?')[0], Math.round((e.transferSize || e.encodedBodySize) / 1024)]).sort((a, b) => b[1] - a[1]).slice(0, 5),
      domReady: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd) };
  });
  check(G, 'תצוגה מקדימה לוואטסאפ: כותרת, תיאור, כתובת', m.ogTitle && m.ogTitle.includes('תום') && m.ogDesc.includes('27.10.2026') && m.ogUrl === BASE, [m.ogTitle, m.ogDesc]);
  check(G, 'תמונת התצוגה המקדימה נטענת, 1200×630', m.img && m.img[0] === 1200 && m.img[1] === 630, m.img);
  check(G, 'האתר מסומן noindex (לא יופיע בגוגל)', /noindex/.test(m.robots || ''), m.robots);
  check(G, 'viewport למובייל + favicon', /width=device-width/.test(m.viewport || '') && m.favicon);
  check(G, 'משקל העמוד סביר (< 1.5MB מהאתר עצמו)', m.ownBytes < 1.5 * 1024 * 1024, { kb: Math.round(m.ownBytes / 1024), files: m.ownCount, biggest: m.biggest });
  check(G, 'העמוד מוכן מהר (DOM < 3 שניות)', m.domReady < 3000, m.domReady + 'ms');
  await page.close();
}

/* ================================================================== */
async function realBackend(browser) {
  const G = 'real Google Sheet';
  const page = await newPage(browser, 'phone-375', 'he');
  await page.evaluate(() => localStorage.clear());
  await page.click('#hero-cta'); await waitHash(page, '#rsvp', 3000); await sleep(300);
  endpointMode = 'real'; posted = [];
  await page.type('#f-name', 'בדיקה מהאתר');
  await page.click('[data-step="adults"][data-delta="1"]');
  await page.type('[data-comp="adult-0"]', 'בודק א');
  await page.type('[data-comp="adult-1"]', 'בודק ב');
  await page.type('#f-note', 'שורת בדיקה - למחיקה');
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.click('#submit-btn'); await sleep(300);
  const t0 = Date.now();
  await page.click('#cf-yes');
  const ok1 = await waitHash(page, '#thanks-yes', 80000);
  check(G, 'שליחה אמיתית (3 בוגרים) נקלטה בגיליון', ok1, { ms: Date.now() - t0, requests: posted.length, error: !(await isHidden(page, '#send-error')) });
  console.log('   real create:', Date.now() - t0, 'ms,', posted.length, 'request(s)');
  await page.evaluate(() => { location.hash = 'rsvp'; }); await sleep(400);
  await page.click('.segmented label:nth-child(2)');
  await page.evaluate(() => document.querySelector('#submit-btn').scrollIntoView({ behavior: 'instant', block: 'center' }));
  const t1 = Date.now();
  await page.click('#submit-btn');
  const ok2 = await waitHash(page, '#thanks-no', 80000);
  check(G, 'עדכון אמיתי של אותו אורח ל"לא מגיע" נקלט', ok2, { ms: Date.now() - t1, requests: posted.length });
  console.log('   real update:', Date.now() - t1, 'ms');
  endpointMode = 'ok';
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--hide-scrollbars'] });
  const only = process.argv[2];
  try {
    const stages = { layout: layoutAndVisual, functional, a11y: accessibility, meta: metaAndPerf, real: realBackend };
    for (const [k, fn] of Object.entries(stages)) {
      if (only ? only !== k : k === 'real') continue; // 'real' כותב שורת בדיקה לגיליון האמיתי – רץ רק בבקשה מפורשת: node run.js real
      console.log('==', k);
      try { await fn(browser); } catch (e) { check(k, 'השלב רץ עד הסוף', false, String(e && e.stack || e).slice(0, 400)); }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(__dirname, 'results' + (only ? '-' + only : '') + '.json'), JSON.stringify(results, null, 1));
  const failed = results.filter((r) => !r.ok);
  console.log(`\nTOTAL ${results.length}  PASS ${results.length - failed.length}  FAIL ${failed.length}`);
})();
