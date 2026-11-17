/*
 * Lusso Vita - kampanya pop-up'ı ("İlk taksit Şubat 2027", Meta form reklamındaki görsel).
 *
 *  - Sayfa açıldıktan DELAY_MS sonra bir kez gösterilir; aynı oturumda tekrar çıkmaz
 *    (sessionStorage, takip/çerez yok).
 *  - Çerez kartı açıksa onun kapanmasını bekler, üst üste binmez.
 *  - END tarihinden sonra kendiliğinden devre dışı kalır.
 *  - Kapatma: X düğmesi, Esc, karartılmış alana tıklama.
 *  - WhatsApp / telefon tıklamaları cookie-consent.js'teki genel izleyiciyle
 *    (whatsapp_click / phone_click) zaten ölçülür.
 *  - Test için: sayfa adresine ?kampanya=goster eklenince oturum kaydına bakmadan açılır.
 */
(function () {
    'use strict';

    var END = new Date('2027-02-01T00:00:00+03:00');   // kampanya bitişi
    var DELAY_MS = 5000;
    var KEY = 'lv_kampanya_ilk_taksit_gosterildi';
    var IMG = 'assets/images/kampanya/ilk-taksit-subat-2027.jpg';
    var WA = 'https://wa.me/905331587419?text=' + encodeURIComponent('Merhaba, "İlk taksit Şubat 2027" kampanyası hakkında bilgi almak istiyorum.');
    var TEL = 'tel:+903129118883';
    var FORM = 'hakkimizda.html#iletisim';
    // Telefon/tablette WhatsApp uygulaması açılır; bilgisayarda WhatsApp'a geçiş zor,
    // orada iletişim formuna yönlendirilir ve numara düğmede yazılı gösterilir.
    var MOBILE = window.matchMedia('(pointer: coarse), (max-width: 767px)').matches;

    var force = /[?&]kampanya=goster\b/.test(location.search);
    if (!force && Date.now() > END.getTime()) return;
    function seen() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
    function markSeen() { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }
    if (!force && seen()) return;

    var css = '\
#lv-kp{position:fixed;inset:0;z-index:2147482000;display:none;align-items:center;justify-content:center;padding:16px;\
background:rgba(4,22,39,.72);opacity:0;transition:opacity .3s ease;-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}\
#lv-kp.lv-open{display:flex}#lv-kp.lv-in{opacity:1}\
#lv-kp .lv-kp-card{position:relative;width:min(420px,calc(100vw - 32px),calc((100vh - 120px) * .8));\
width:min(420px,calc(100vw - 32px),calc((100dvh - 120px) * .8));background:#041627;border-radius:6px;overflow:hidden;\
box-shadow:0 24px 60px rgba(0,0,0,.45);transform:translateY(12px) scale(.98);transition:transform .35s ease}\
#lv-kp.lv-in .lv-kp-card{transform:none}\
#lv-kp img{display:block;width:100%;height:auto;aspect-ratio:4/5}\
#lv-kp .lv-kp-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:0;cursor:pointer;\
background:rgba(4,22,39,.6);color:#fcf9f1;font-size:22px;line-height:36px;text-align:center;padding:0}\
#lv-kp .lv-kp-x:hover{background:rgba(4,22,39,.85)}\
#lv-kp .lv-kp-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px}\
#lv-kp .lv-kp-actions a{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:3px;\
font-family:Manrope,system-ui,sans-serif;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;text-decoration:none}\
#lv-kp .lv-kp-wa{background:#C9A86A;color:#041627}#lv-kp .lv-kp-wa:hover{background:#d6b87e}\
#lv-kp .lv-kp-tel{border:1px solid rgba(252,249,241,.35);color:#fcf9f1}#lv-kp .lv-kp-tel:hover{border-color:#fcf9f1}\
#lv-kp a:focus-visible,#lv-kp button:focus-visible{outline:2px solid #C9A86A;outline-offset:2px}\
@media (max-width:400px){#lv-kp .lv-kp-actions a{letter-spacing:.06em;font-size:10.5px}}\
@media (prefers-reduced-motion:reduce){#lv-kp,#lv-kp .lv-kp-card{transition:none}}';

    var root, lastFocus;

    function build() {
        var st = document.createElement('style');
        st.textContent = css;
        document.head.appendChild(st);
        root = document.createElement('div');
        root.id = 'lv-kp';
        root.innerHTML =
            '<div class="lv-kp-card" role="dialog" aria-modal="true" aria-label="Kampanya: İlk taksit Şubat 2027, yüzde 50 peşinat, 18 ay sıfır faiz">' +
            '<button type="button" class="lv-kp-x" aria-label="Kapat">&times;</button>' +
            '<img src="' + IMG + '" width="800" height="1000" alt="İlk taksit Şubat 2027. %50 peşinat, kalanı 18 ay sıfır faiz. Lusso Vita.">' +
            '<div class="lv-kp-actions">' +
            (MOBILE
                ? '<a class="lv-kp-wa" href="' + WA + '" target="_blank" rel="noopener noreferrer">WhatsApp ile bilgi al</a>' +
                  '<a class="lv-kp-tel" href="' + TEL + '">Hemen ara</a>'
                : '<a class="lv-kp-wa lv-kp-form" href="' + FORM + '">Formu doldurun</a>' +
                  '<a class="lv-kp-tel" href="' + TEL + '">0312 911 88 83</a>') +
            '</div></div>';
        document.body.appendChild(root);
        root.addEventListener('click', function (e) {
            if (e.target === root || e.target.closest('.lv-kp-x')) close();
            // Form zaten bu sayfadaysa (Hakkımızda) bağlantı sadece kaydırır: pop-up'ı da kapat.
            else if (e.target.closest('.lv-kp-form') && document.getElementById('iletisim')) {
                e.preventDefault();
                close(true);
            }
        });
        root.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
            if (e.key !== 'Tab') return;
            var f = root.querySelectorAll('button, a[href]');
            var first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });
    }

    function open() {
        if (!root) build();
        markSeen();
        lastFocus = document.activeElement;
        root.classList.add('lv-open');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('lv-in'); }); });
        root.querySelector('.lv-kp-x').focus({ preventScroll: true });
    }

    function close(toForm) {
        root.classList.remove('lv-in');
        document.body.style.overflow = '';
        setTimeout(function () { root.classList.remove('lv-open'); }, 300);
        if (toForm) {
            // Kaydırma kilidi kalktıktan sonra forma kaydır, ilk alana odaklan.
            setTimeout(function () {
                document.getElementById('iletisim').scrollIntoView({ behavior: 'smooth', block: 'start' });
                try { history.replaceState(null, '', '#iletisim'); } catch (e) {}
                var f = document.getElementById('contact-name');
                if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 700);
            }, 50);
            return;
        }
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    function cookieCardOpen() {
        var c = document.getElementById('lv-cerez');
        return !!(c && c.classList.contains('lv-open'));
    }
    function menuOpen() {
        var m = document.getElementById('mobile-menu');
        return !!(m && !m.classList.contains('hidden'));
    }

    // Çerez kartı veya mobil menü açıkken bekle, kapanınca kısa bir aradan sonra göster.
    function tryOpen() {
        if (cookieCardOpen() || menuOpen()) { setTimeout(tryOpen, 1500); return; }
        open();
    }

    function start() { setTimeout(tryOpen, force ? 800 : DELAY_MS); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
