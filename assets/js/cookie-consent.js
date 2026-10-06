/*
 * Lusso Vita - çerez tercih aracı (KVKK / Kurul'un Çerez Uygulamaları Rehberi).
 *
 *  - Nothing that needs consent runs before the visitor chooses: the Meta Pixel
 *    is NOT in the pages any more, it is loaded from here only after an explicit
 *    "pazarlama" consent.
 *  - It is a small, non-blocking card at the bottom centre of the page: no
 *    overlay, no blur, the page stays fully usable while it is shown.
 *  - First layer: "Reddet" and "Kabul Et" have the same size and style;
 *    "Tercihler" opens the per-category layer (off by default).
 *  - The choice is kept in localStorage (no cookie is written for it), with its
 *    date and the consent-text version; it is asked again after 6 months or
 *    when VERSION changes (bump VERSION whenever a tool/category is added).
 *  - Every element with [data-cerez-ayarlari] (footer link, policy page button)
 *    reopens the dialog, so withdrawing consent is as easy as giving it.
 *
 * Categories: zorunlu (always), analitik (Google Analytics 4), pazarlama (Meta Pixel).
 * Google Analytics is loaded from here only after an explicit "analitik" consent.
 * To add Google Ads later: add the tool below, load its script inside
 * applyConsent(), bump VERSION, update cerez-politikasi.html.
 */
(function () {
    'use strict';

    var VERSION = 2;                         // consent text / tool list version
    var KEY = 'lv_cerez_tercihi';
    var MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182;   // ~6 ay
    var META_PIXEL_ID = '28939791892284691';
    var GA_ID = 'G-2JW4Q4KGH4';

    /* ---------- storage ---------- */
    function read() {
        try {
            var c = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (!c || c.v !== VERSION || !c.ts || Date.now() - c.ts > MAX_AGE_MS) return null;
            return c;
        } catch (e) { return null; }
    }
    function write(analytics, marketing) {
        var c = { v: VERSION, ts: Date.now(), zorunlu: true, analitik: !!analytics, pazarlama: !!marketing };
        try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
        return c;
    }

    /* ---------- tools that need consent ---------- */
    var pixelLoaded = false;
    function loadMetaPixel() {
        if (pixelLoaded) return;
        pixelLoaded = true;
        /* Meta Pixel base code - only ever executed after "pazarlama" consent */
        !function (f, b, e, v, n, t, s) {
            if (f.fbq) return; n = f.fbq = function () {
                n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
            };
            if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
            n.queue = []; t = b.createElement(e); t.async = !0;
            t.src = v; s = b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t, s);
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', META_PIXEL_ID);
        window.fbq('track', 'PageView');
    }
    function removeMarketingCookies() {
        var host = location.hostname, parts = host.split('.');
        var domains = ['', host];
        for (var i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'));
        ['_fbp', '_fbc'].forEach(function (name) {
            domains.forEach(function (d) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
            });
        });
    }
    var gaLoaded = false;
    function loadGoogleAnalytics() {
        if (gaLoaded) return;
        gaLoaded = true;
        /* Google tag (gtag.js) - only ever executed after "analitik" consent */
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        document.head.appendChild(s);
        window.gtag('js', new Date());
        window.gtag('config', GA_ID);
    }
    function removeAnalyticsCookies() {
        var host = location.hostname, parts = host.split('.');
        var domains = ['', host];
        for (var i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'));
        document.cookie.split(';').forEach(function (pair) {
            var name = pair.split('=')[0].trim();
            if (name !== '_ga' && name.indexOf('_ga_') !== 0) return;
            domains.forEach(function (d) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
            });
        });
    }
    function applyConsent(c, wasMarketing, wasAnalytics) {
        if (c.pazarlama) loadMetaPixel(); else removeMarketingCookies();
        if (c.analitik) loadGoogleAnalytics(); else removeAnalyticsCookies();
        // consent withdrawn while the tool is already running on this page:
        // a reload is the only way to actually stop it
        if ((!c.pazarlama && wasMarketing && pixelLoaded) || (!c.analitik && wasAnalytics && gaLoaded)) location.reload();
    }

    /* ---------- conversion events ----------
     * Fired only when the tool is already running, i.e. after the visitor consented.
     * No personal data is sent: just the event name. The contact form code is not
     * touched; its success box turning green is observed instead.
     */
    function track(gaEvent, fbEvent) {
        try {
            if (gaLoaded && typeof window.gtag === 'function') window.gtag('event', gaEvent);
            if (pixelLoaded && typeof window.fbq === 'function') window.fbq('track', fbEvent);
        } catch (e) {}
    }
    function setupEvents() {
        document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('a[href]');
            if (!a) return;
            var h = (a.getAttribute('href') || '').toLowerCase();
            if (h.indexOf('wa.me/') > -1 || h.indexOf('api.whatsapp.com') > -1 || h.indexOf('whatsapp:') === 0) track('whatsapp_click', 'Contact');
            else if (h.indexOf('tel:') === 0) track('phone_click', 'Contact');
            else if (h.indexOf('mailto:') === 0) track('email_click', 'Contact');
        }, true);
        var box = document.getElementById('contact-status');
        if (box && window.MutationObserver) {
            var sent = false;
            new MutationObserver(function () {
                var hidden = box.classList.contains('hidden');
                if (hidden) { sent = false; return; }
                if (box.classList.contains('bg-green-50') && !sent) { sent = true; track('generate_lead', 'Lead'); }
            }).observe(box, { attributes: true, attributeFilter: ['class'] });
        }
    }

    /* ---------- UI ---------- */
    var CSS = '\
#lv-cerez{position:fixed;left:50%;bottom:20px;z-index:2147483000;display:none;width:calc(100% - 24px);max-width:460px;\
transform:translate(-50%,14px);opacity:0;transition:opacity .35s ease,transform .45s cubic-bezier(.16,1,.3,1);\
font-family:Manrope,system-ui,sans-serif}\
#lv-cerez.lv-open{display:block}#lv-cerez.lv-in{opacity:1;transform:translate(-50%,0)}\
#lv-cerez .lv-box{background:#fcf9f1;color:#1c1c17;max-height:calc(100vh - 40px);overflow:auto;padding:18px 20px 16px;\
border:1px solid rgba(142,121,102,.35);box-shadow:0 12px 40px rgba(4,22,39,.18);outline:none}\
#lv-cerez h2{font-family:inherit;font-size:10.5px;letter-spacing:.2em;font-weight:700;color:#8E7966;text-transform:uppercase;margin:0 0 8px;outline:none}\
#lv-cerez p{font-size:12.5px;line-height:1.55;color:#44474c;margin:0 0 8px}\
#lv-cerez a{color:#041627;text-decoration:underline;text-underline-offset:3px}\
#lv-cerez a:hover{color:#8E7966}\
#lv-cerez .lv-actions{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:stretch;margin-top:12px}\
#lv-cerez button{font-family:inherit;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;\
padding:11px 10px;cursor:pointer;border:1px solid #041627;transition:opacity .2s ease,border-color .2s ease}\
#lv-cerez .lv-solid{background:#041627;color:#fcf9f1}#lv-cerez .lv-solid:hover{opacity:.88}\
#lv-cerez .lv-ghost{background:transparent;color:#041627;border-color:rgba(4,22,39,.25);padding-left:14px;padding-right:14px}\
#lv-cerez .lv-ghost:hover{border-color:#041627}\
#lv-cerez button:focus-visible,#lv-cerez a:focus-visible,#lv-cerez input:focus-visible+.lv-sw{outline:2px solid #8E7966;outline-offset:2px}\
#lv-cerez .lv-cat{border-top:1px solid rgba(4,22,39,.12);padding:10px 0;display:flex;gap:14px;align-items:flex-start;justify-content:space-between}\
#lv-cerez .lv-cat h3{font-family:inherit;font-size:12.5px;font-weight:700;color:#041627;margin:0 0 2px}\
#lv-cerez .lv-cat p{font-size:12px;margin:0}\
#lv-cerez .lv-always{font-size:10px;font-weight:700;letter-spacing:.1em;color:#8E7966;text-transform:uppercase;white-space:nowrap;padding-top:2px}\
#lv-cerez .lv-toggle{position:relative;flex:none;width:40px;height:22px;cursor:pointer}\
#lv-cerez .lv-toggle input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}\
#lv-cerez .lv-sw{position:absolute;inset:0;border-radius:22px;background:#c9c6be;transition:background-color .2s ease}\
#lv-cerez .lv-sw:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s ease}\
#lv-cerez input:checked+.lv-sw{background:#041627}#lv-cerez input:checked+.lv-sw:after{transform:translateX(18px)}\
#lv-cerez [hidden]{display:none!important}\
@media (max-width:520px){#lv-cerez{bottom:10px}#lv-cerez .lv-box{padding:14px 14px 12px}\
#lv-cerez p{font-size:12px;line-height:1.5}#lv-cerez .lv-actions{margin-top:10px;gap:6px}\
#lv-cerez button{padding:10px 6px;letter-spacing:.08em}#lv-cerez .lv-ghost{padding-left:10px;padding-right:10px}}';

    var HTML = '\
<div class="lv-box" role="dialog" aria-modal="false" aria-labelledby="lv-cerez-title" tabindex="-1">\
  <div data-layer="1">\
    <h2 id="lv-cerez-title">Çerez Tercihleri</h2>\
    <p>Sitemizin çalışması için zorunlu teknolojileri kullanıyoruz. Açık rızanızı verirseniz site kullanımını ölçmek için analitik çerezler (Google Analytics) ve reklam ölçümü için pazarlama çerezleri (Meta Pixel) de kullanılır; verileriniz yurt dışına (Google LLC, Meta Platforms, Inc.) aktarılır. <a href="/cerez-politikasi.html">Çerez Politikası</a> · <a href="/kvkk.html">KVKK Aydınlatma Metni</a></p>\
    <div class="lv-actions">\
      <button type="button" class="lv-solid" data-act="reject">Reddet</button>\
      <button type="button" class="lv-solid" data-act="accept">Kabul Et</button>\
      <button type="button" class="lv-ghost" data-act="manage">Tercihler</button>\
    </div>\
  </div>\
  <div data-layer="2" hidden>\
    <h2>Çerez Tercihleri</h2>\
    <p>Açık rızaya tabi kategoriler varsayılan olarak kapalıdır. Tercihinizi sayfa altındaki “Çerez Ayarları”ndan dilediğiniz zaman değiştirebilirsiniz.</p>\
    <div class="lv-cat">\
      <div><h3>Zorunlu</h3><p>Sitenin çalışması, güvenliği ve çerez tercihinizin hatırlanması için gereklidir. Kişiyi takip etmez, kapatılamaz.</p></div>\
      <span class="lv-always">Her zaman açık</span>\
    </div>\
    <div class="lv-cat">\
      <div><h3 id="lv-cat-ana">Analitik / Performans</h3><p>Google Analytics (Google LLC): sitenin nasıl kullanıldığını (ziyaret edilen sayfalar, ziyaret süresi, cihaz türü) anonim istatistiklerle ölçmek ve siteyi iyileştirmek için kullanılır. Verileriniz yurt dışına (başta ABD) aktarılır. Açık rızanıza tabidir.</p></div>\
      <label class="lv-toggle"><input type="checkbox" id="lv-ana" aria-labelledby="lv-cat-ana"><span class="lv-sw"></span></label>\
    </div>\
    <div class="lv-cat">\
      <div><h3 id="lv-cat-paz">Pazarlama / Hedefleme</h3><p>Meta Pixel (Meta Platforms, Inc.): reklamlarımızın etkinliğini ve dönüşümleri ölçmek, Facebook ve Instagram\'da size uygun reklamlar göstermek için kullanılır. Verileriniz yurt dışına (başta ABD) aktarılır. Açık rızanıza tabidir.</p></div>\
      <label class="lv-toggle"><input type="checkbox" id="lv-paz" aria-labelledby="lv-cat-paz"><span class="lv-sw"></span></label>\
    </div>\
    <div class="lv-actions">\
      <button type="button" class="lv-solid" data-act="reject">Reddet</button>\
      <button type="button" class="lv-solid" data-act="accept">Kabul Et</button>\
      <button type="button" class="lv-ghost" data-act="save">Kaydet</button>\
    </div>\
  </div>\
</div>';

    var root, lastFocus;
    function build() {
        if (root) return;
        var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
        root = document.createElement('div'); root.id = 'lv-cerez'; root.innerHTML = HTML;
        document.body.appendChild(root);
        root.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-act]'); if (!b) return;
            var act = b.getAttribute('data-act');
            if (act === 'manage') return layer(2);
            if (act === 'accept') return decide(true, true);
            if (act === 'reject') return decide(false, false);
            if (act === 'save') return decide(root.querySelector('#lv-ana').checked, root.querySelector('#lv-paz').checked);
        });
        // non-modal notice: the page behind stays fully usable; Esc closes it only when a choice already exists
        root.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && read()) close();
        });
    }
    function layer(n) {
        [].forEach.call(root.querySelectorAll('[data-layer]'), function (el) { el.hidden = el.getAttribute('data-layer') !== String(n); });
        root.querySelector('.lv-box').scrollTop = 0;
    }
    function open(startLayer, byUser) {
        build();
        var c = read();
        root.querySelector('#lv-ana').checked = !!(c && c.analitik);    // off unless previously accepted
        root.querySelector('#lv-paz').checked = !!(c && c.pazarlama);
        lastFocus = byUser ? document.activeElement : null;
        layer(startLayer || 1);
        root.classList.add('lv-open');
        setTimeout(function () {
            root.classList.add('lv-in');
            if (byUser) root.querySelector('.lv-box').focus();   // opened from "Çerez Ayarları": move focus to it
        }, 20);
    }
    function close() {
        root.classList.remove('lv-in');
        setTimeout(function () { root.classList.remove('lv-open'); }, 350);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function decide(analytics, marketing) {
        var before = read();
        var c = write(analytics, marketing);
        close();
        applyConsent(c, !!(before && before.pazarlama), !!(before && before.analitik));
    }

    /* ---------- boot ---------- */
    function boot() {
        setupEvents();
        document.addEventListener('click', function (e) {
            var t = e.target.closest('[data-cerez-ayarlari]'); if (!t) return;
            e.preventDefault(); open(read() ? 2 : 1, true);
        });
        var c = read();
        if (c) applyConsent(c, false, false); else open(1);
    }
    window.LVCerez = { open: function () { open(read() ? 2 : 1, true); }, get: read };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
