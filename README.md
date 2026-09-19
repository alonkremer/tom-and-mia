# הזמנה – הברית של תום ויום ההולדת של מיה

אתר הזמנה סטטי (HTML/CSS/JS בלי ספריות) עם אישור הגעה, הוראות הגעה וחניה, מתנה ב‑bit / PayBox, עברית + אנגלית.

האתר: <https://alonkremer.github.io/tom-and-mia/> · אנגלית: `?lang=en`

## מה משנים ואיפה

| מה | איפה |
|---|---|
| תאריך ושעה, תאריך אחרון לאישור, טלפון, כתובת | [`js/config.js`](js/config.js) – מתעדכן בכל האתר, כולל ספירה לאחור, ווייז ויומן Google |
| **תמונות** | ראו "החלפת תמונה" למטה |
| חיבור הטופס לגיליון Google | [`apps-script/SETUP.md`](apps-script/SETUP.md) |
| טקסטים בעברית | [`index.html`](index.html) |
| טקסטים באנגלית | [`js/i18n.js`](js/i18n.js) |
| לו״ז האירוע | [`index.html`](index.html) (`.schedule`) + תיאור היומן ב‑`js/i18n.js` (`js.cal.details`) |
| עיצוב וצבעים | [`css/style.css`](css/style.css) (המשתנים בראש הקובץ) |

אם התאריך משתנה צריך לעדכן גם את [`event.ics`](event.ics) (קובץ היומן ל‑Apple/Outlook), את ה‑`og:description` ב‑`index.html`,
ואת תמונת התצוגה המקדימה לוואטסאפ: עורכים את [`tools/og.html`](tools/og.html) ומריצים

```bash
chrome --headless=new --window-size=1200,630 --virtual-time-budget=8000 --screenshot=images/og.png tools/og.html
```

## החלפת תמונה

שם הקובץ הוא המיקום באתר (גם בעברית וגם באנגלית):

| מיקום באתר | קובץ |
|---|---|
| למעלה מימין | `images/photo-1-top-right.jpg` |
| למעלה משמאל | `images/photo-2-top-left.jpg` |
| למטה מימין | `images/photo-3-bottom-right.jpg` |
| למטה משמאל | `images/photo-4-bottom-left.jpg` |

```bash
python tools/add-photo.py 2 "C:/path/to/new photo.jpeg"
```

הפקודה מקטינה את התמונה, מנקה ממנה מטא-דאטה ושומרת אותה במקום הנכון (כאן: מיקום 2, למעלה משמאל). אחר כך `git add -A`, `git commit`, `git push`.
אם הפנים נחתכות במסגרת – משנים את הערך המתאים ב-`photoFocus` שב-`js/config.js` (אופקי אנכי, למשל `'50% 20%'` מזיז את הפריים למעלה).

## פיתוח ובדיקות

```bash
node tools/dev-server.js
```

פותח את האתר ב‑<http://localhost:4173> כשהטופס מחובר לגיליון **מדומה** (לא נוגע בגיליון האמיתי).
`/mock-rows` מציג מה נשמר, `/mock-reset` מאפס, `/mock-fail?on=1` מדמה תקלה, ו‑`?wa=1` בכתובת האתר בודק את מצב הוואטסאפ.

```bash
node --test "tests/*.test.js"
```

מריץ את `apps-script/Code.gs` האמיתי מול הגיליון המדומה: הוספה, עדכון של אותו אורח, מעבר בין מגיע/לא מגיע, מחיקת שורות, קלט לא תקין, סיכומים.

### בדיקת קצה-לקצה מול האתר החי

```bash
cd tests/e2e && npm install && node run.js
```

מריץ כרום אמיתי עם הדמיית מכשירים (טלפונים 320/375/414, טאבלט, מחשב; עברית ואנגלית): פריסה וגלישה, כל הזרימות של הטופס, חלונות קופצים,
תקלות שרת וניסיון חוזר, נגישות וניגודיות, תצוגה מקדימה לוואטסאפ, ושליחה אמיתית אחת לגיליון (בשם "בדיקה מהאתר", מסתיימת ב"לא מגיע").
צילומי המסך נשמרים ב-`tests/e2e/shots/`. שלב בודד: `node run.js layout|functional|a11y|meta|real`. מול גרסה מקומית: `BASE=http://localhost:4173/ node run.js functional`.

## פרסום

GitHub Pages מתוך הענף `main`. כל `git push` מעדכן את האתר תוך דקה‑שתיים.
