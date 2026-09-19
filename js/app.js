(function () {
  'use strict';

  var cfg = window.EVENT_CONFIG;
  var dict = window.I18N;
  var TZ = 'Asia/Jerusalem';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lang = 'he';

  document.documentElement.classList.add('js');

  /* ---------- אחסון מקומי (נוחות בלבד, האתר עובד גם בלעדיו) ---------- */
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* מצב פרטי וכד' */ }
    return null;
  }

  /* ---------- תאריכים ---------- */
  function dateParts(iso, locale) {
    var d = new Date(iso);
    var parts = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(d).forEach(function (p) { parts[p.type] = p.value; });
    parts.weekday = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'long' }).format(d);
    parts.monthLong = new Intl.DateTimeFormat(locale, { timeZone: TZ, month: 'long' }).format(d);
    parts.monthShort = new Intl.DateTimeFormat(locale, { timeZone: TZ, month: 'short' }).format(d);
    return parts;
  }

  function tokens() {
    var he = lang === 'he';
    var ev = dateParts(cfg.startUtc, he ? 'he-IL' : 'en-US');
    var dl = dateParts(cfg.rsvpDeadlineUtc, he ? 'he-IL' : 'en-US');
    return {
      weekday: ev.weekday,
      time: ev.hour + ':' + ev.minute,
      date: he ? ev.day + '.' + ev.month + '.' + ev.year : ev.monthShort + ' ' + Number(ev.day) + ', ' + ev.year,
      dayDate: he ? ev.weekday + ', ' + ev.day + '.' + ev.month : ev.weekday + ', ' + ev.monthLong + ' ' + Number(ev.day),
      deadline: he ? dl.weekday + ', ' + dl.day + '.' + dl.month : dl.weekday + ', ' + dl.monthLong + ' ' + Number(dl.day),
      phone: cfg.phoneDisplay
    };
  }

  /* ---------- תרגום ---------- */
  function t(key) {
    var s = dict[lang][key];
    if (s === undefined) s = dict.he[key];
    if (s === undefined) return key;
    var tk = tokens();
    return s.replace(/\{(\w+)\}/g, function (m, name) { return tk[name] !== undefined ? tk[name] : m; });
  }

  // העברית היא מה שכתוב ב-HTML; שומרים אותה כדי שאפשר יהיה לחזור מאנגלית
  function captureHebrew() {
    $$('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (dict.he[k] === undefined) dict.he[k] = el.textContent.trim();
    });
    $$('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      if (dict.he[k] === undefined) dict.he[k] = el.getAttribute('placeholder');
    });
  }

  var STEP_WORDS = { he: { less: 'פחות', more: 'עוד' }, en: { less: 'Fewer', more: 'More' } };

  function applyLang(next) {
    lang = next === 'en' ? 'en' : 'he';
    var root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = t('js.title');

    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    $$('[data-fill="phone"]').forEach(function (el) { el.textContent = cfg.phoneDisplay; });
    $$('[data-step]').forEach(function (btn) {
      var word = STEP_WORDS[lang][btn.getAttribute('data-delta') < 0 ? 'less' : 'more'];
      btn.setAttribute('aria-label', word + ' ' + t('rsvp.' + btn.getAttribute('data-step')));
    });

    var toggle = $('#lang-toggle');
    toggle.textContent = lang === 'he' ? 'EN' : 'עב';
    toggle.setAttribute('aria-label', t('js.switchLang'));

    buildLinks();
    store('lang', lang);
  }

  /* ---------- קישורים חיצוניים ---------- */
  function waUrl(text) {
    return 'https://wa.me/' + cfg.phoneIntl + '?text=' + encodeURIComponent(text);
  }

  function buildLinks() {
    var q = encodeURIComponent(cfg.address);
    $('#waze-link').href = 'https://waze.com/ul?q=' + q + '&navigate=yes';
    $('#gmaps-link').href = 'https://www.google.com/maps/dir/?api=1&destination=' + q;
    var mapSrc = 'https://www.google.com/maps?q=' + q + '&hl=' + lang + '&z=16&output=embed';
    if ($('#map').getAttribute('src') !== mapSrc) $('#map').setAttribute('src', mapSrc);
    $('#wa-link').href = waUrl(t('js.wa.hello'));

    var stamp = function (iso) { return iso.replace(/[-:]/g, '').replace(/\.\d+/, ''); };
    $('#cal-google').href = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(t('js.cal.title')) +
      '&dates=' + stamp(cfg.startUtc) + '/' + stamp(cfg.endUtc) +
      '&ctz=' + encodeURIComponent(TZ) +
      '&location=' + encodeURIComponent(cfg.venueName + ', ' + cfg.address) +
      '&details=' + encodeURIComponent(t('js.cal.details'));
  }

  /* ---------- ספירה לאחור ---------- */
  function tickCountdown() {
    var diff = new Date(cfg.startUtc).getTime() - Date.now();
    if (diff <= 0) { $('#countdown').hidden = true; return; }
    var mins = Math.floor(diff / 60000);
    $('#cd-days').textContent = Math.floor(mins / 1440);
    $('#cd-hours').textContent = Math.floor((mins % 1440) / 60);
    $('#cd-mins').textContent = mins % 60;
  }

  /* ---------- תמונות: אם הקובץ חסר מציגים מסגרת ריקה ---------- */
  function initPhotos() {
    $$('.photo img').forEach(function (img) {
      var markEmpty = function () { img.parentNode.classList.add('empty'); };
      var src = (cfg.photos || [])[Number(img.getAttribute('data-photo'))];
      if (!src) { markEmpty(); return; }
      img.addEventListener('error', markEmpty);
      img.src = src;
    });
  }

  /* ---------- ניווט בין מסכים ---------- */
  var views = { main: $('#view-main'), rsvp: $('#view-rsvp'), thanks: $('#view-thanks') };
  var heroCtaVisible = true;

  function updateSticky() {
    var show = !views.main.hidden && !heroCtaVisible;
    $('#sticky-cta').hidden = !show;
    document.body.classList.toggle('has-sticky', show);
  }

  function route() {
    var hash = location.hash.replace('#', '');
    var name = 'main';
    var variant = null;
    if (hash === 'rsvp') name = 'rsvp';
    else if (/^thanks-(yes|no|gift)$/.test(hash)) { name = 'thanks'; variant = hash.split('-')[1]; }

    var cameFromOtherView = views[name].hidden;
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });

    if (name === 'thanks') {
      $$('.thanks-body').forEach(function (b) { b.hidden = b.getAttribute('data-variant') !== variant; });
      views.thanks.classList.toggle('is-gift', variant === 'gift');
      $('#gift-to-rsvp').hidden = store('rsvpDone') === '1';
    }
    if (name === 'rsvp') $('#already').hidden = store('rsvpDone') !== '1';

    updateSticky();

    var anchor = name === 'main' && hash ? document.getElementById(hash) : null;
    if (anchor) {
      anchor.scrollIntoView({ behavior: reducedMotion || cameFromOtherView ? 'instant' : 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    if (name === 'thanks') {
      var h = $('.thanks-body:not([hidden]) h1');
      if (h) h.focus({ preventScroll: true });
      if (variant !== 'no') confetti();
    }
  }

  /* ---------- טופס ---------- */
  var counts = { adults: 2, kids: 0 };
  var limits = { adults: [1, 20], kids: [0, 20] };

  function initForm() {
    var form = $('#rsvp-form');

    $$('[data-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var which = btn.getAttribute('data-step');
        var next = counts[which] + Number(btn.getAttribute('data-delta'));
        counts[which] = Math.min(limits[which][1], Math.max(limits[which][0], next));
        $('#n-' + which).textContent = counts[which];
      });
    });

    $$('input[name="attending"]').forEach(function (r) {
      r.addEventListener('change', function () {
        $('#coming-fields').hidden = form.attending.value !== 'yes';
      });
    });

    $('#f-name').addEventListener('input', function () { setError('name', false); });

    form.addEventListener('submit', onSubmit);
  }

  function setError(field, on) {
    $('#err-' + field).hidden = !on;
    var input = $('#f-' + field);
    if (on) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'err-' + field); }
    else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
  }

  function readForm() {
    var form = $('#rsvp-form');
    var coming = form.attending.value === 'yes';
    return {
      name: form.name.value.replace(/\s+/g, ' ').trim(),
      attending: coming ? 'yes' : 'no',
      adults: coming ? counts.adults : 0,
      kids: coming ? counts.kids : 0,
      food: coming ? form.food.value.trim() : '',
      note: form.note.value.trim(),
      lang: lang
    };
  }

  function rsvpText(d) {
    var lines = [
      t('js.wa.rsvp'),
      t('js.wa.name') + ': ' + d.name,
      d.attending === 'yes' ? t('js.wa.yes') : t('js.wa.no')
    ];
    if (d.attending === 'yes') {
      lines.push(t('js.wa.adults') + ': ' + d.adults, t('js.wa.kids') + ': ' + d.kids);
      if (d.food) lines.push(t('js.wa.food') + ': ' + d.food);
    }
    if (d.note) lines.push(t('js.wa.note') + ': ' + d.note);
    return lines.join('\n');
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.currentTarget;
    var data = readForm();

    // השם הוא המזהה של המשפחה בגיליון, לכן מבקשים שם + שם משפחה (שתי מילים לפחות)
    var badName = data.name.split(' ').length < 2 || data.name.length < 4;
    setError('name', badName);
    if (badName) { $('#f-name').focus(); return; }

    var done = function () {
      store('rsvpDone', '1');
      location.hash = data.attending === 'yes' ? 'thanks-yes' : 'thanks-no';
    };

    // בוטים ממלאים את השדה הנסתר – מתנהגים כאילו נשלח
    if (form.website.value) { done(); return; }

    // מי שמגיע מאשר קודם את הכמויות בחלון קופץ; "לתקן" מחזיר אותו למונים
    if (data.attending === 'yes') confirmCounts(data, function () { send(data, done); });
    else send(data, done);
  }

  function confirmCounts(data, onYes) {
    var dlg = $('#confirm-dialog');
    $('#cf-adults').textContent = data.adults;
    $('#cf-kids').textContent = data.kids;
    $('#cf-total').textContent = data.adults + data.kids;

    var close = function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
    $('#cf-yes').onclick = function () { close(); onYes(); };
    $('#cf-no').onclick = function () {
      close();
      $('.steppers').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
      $('[data-step="adults"][data-delta="1"]').focus({ preventScroll: true });
    };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function send(data, done) {

    $('#send-error').hidden = true;

    // עדיין אין גיליון מחובר: שולחים את הפרטים להורים בוואטסאפ
    if (!cfg.rsvpEndpoint) {
      window.open(waUrl(rsvpText(data)), '_blank', 'noopener');
      done();
      return;
    }

    var btn = $('#submit-btn');
    var label = $('span', btn);
    btn.disabled = true;
    label.textContent = t('js.sending');

    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 20000);

    // text/plain כדי להימנע מבקשת preflight ש-Apps Script לא תומך בה
    fetch(cfg.rsvpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
      signal: ctl.signal
    })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error('bad response'); done(); })
      .catch(function () {
        $('#send-wa').href = waUrl(rsvpText(data));
        $('#send-error').hidden = false;
      })
      .then(function () {
        clearTimeout(timer);
        btn.disabled = false;
        label.textContent = t('rsvp.send');
      });
  }

  /* ---------- מתנה ---------- */
  function copyPhone() {
    var text = cfg.phoneLocal;
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    var host = $('dialog[open]') || document.body;
    host.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    host.removeChild(ta);
    return ok;
  }

  function initGift() {
    var dlg = $('#gift-dialog');

    $('#copy-phone').addEventListener('click', function () {
      copyPhone().then(function (ok) { toast(ok ? t('js.copied') : t('js.copyFail')); });
    });

    $$('[data-gift]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var app = btn.getAttribute('data-gift');
        $('#gift-dialog-title').textContent = t('js.gd.title.' + app);
        $('#gd-step1').textContent = t('js.gd.step1.' + app);
        var link = app === 'bit' ? cfg.bitLink : cfg.payboxLink;
        var open = $('#gd-open');
        open.hidden = !link;
        if (link) { open.href = link; open.textContent = t('js.gd.open.' + app); }
        $('.dialog-copied').style.visibility = 'hidden';
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        copyPhone().then(function (ok) { $('.dialog-copied').style.visibility = ok ? 'visible' : 'hidden'; });
      });
    });

    var close = function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
    $('#gd-cancel').addEventListener('click', close);
    $('#gd-done').addEventListener('click', function () { close(); location.hash = 'thanks-gift'; });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  }

  /* ---------- הודעה קופצת ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- קונפטי ---------- */
  function confetti() {
    if (reducedMotion) return;
    var canvas = $('#confetti');
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = canvas.width = innerWidth * dpr;
    var H = canvas.height = innerHeight * dpr;
    var colors = ['#EFB8C2', '#A9CBE3', '#F3D88A', '#A8CDB6', '#FFFFFF', '#C9788A', '#4A7093'];
    var bits = [];
    for (var i = 0; i < 130; i++) {
      bits.push({
        x: Math.random() * W, y: -Math.random() * H * 0.6,
        w: (6 + Math.random() * 7) * dpr, h: (8 + Math.random() * 9) * dpr,
        vx: (Math.random() - 0.5) * 2 * dpr, vy: (2 + Math.random() * 3.5) * dpr,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.25,
        color: colors[i % colors.length], round: i % 3 === 0
      });
    }
    var start = performance.now();
    (function frame(now) {
      var life = (now - start) / 3800;
      ctx.clearRect(0, 0, W, H);
      if (life >= 1) return;
      ctx.globalAlpha = life > 0.75 ? (1 - life) * 4 : 1;
      bits.forEach(function (b) {
        b.x += b.vx + Math.sin(now / 400 + b.rot) * 0.6 * dpr;
        b.y += b.vy;
        b.rot += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.w / 2, 0, 6.28); ctx.fill(); }
        else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      requestAnimationFrame(frame);
    })(start);
  }

  /* ---------- אתחול ---------- */
  function init() {
    captureHebrew();

    var param = new URLSearchParams(location.search).get('lang');
    applyLang(param || store('lang') || 'he');

    $('#lang-toggle').addEventListener('click', function () { applyLang(lang === 'he' ? 'en' : 'he'); });

    $('#cal-toggle').addEventListener('click', function () {
      var menu = $('#cal-menu');
      menu.hidden = !menu.hidden;
      this.setAttribute('aria-expanded', String(!menu.hidden));
    });

    initPhotos();
    initForm();
    initGift();

    tickCountdown();
    setInterval(tickCountdown, 30000);

    if ('IntersectionObserver' in window) {
      // הכפתור הצף מיותר כשאחד מכפתורי אישור ההגעה הקבועים (למעלה / למטה) כבר על המסך
      var onScreen = new Set();
      var ctaWatcher = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { onScreen[en.isIntersecting ? 'add' : 'delete'](en.target); });
        heroCtaVisible = onScreen.size > 0;
        updateSticky();
      });
      $$('#view-main a.btn[href="#rsvp"]').forEach(function (el) { ctaWatcher.observe(el); });

      var revealer = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); revealer.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      $$('.reveal').forEach(function (el) { revealer.observe(el); });
    } else {
      $$('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    window.addEventListener('hashchange', route);
    route();
  }

  init();
})();
