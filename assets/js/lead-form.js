/*
 * Lusso Vita - lead forms (İletişim, Daire Tipleri, Villalar).
 *
 * Every <form data-lead-form="<form_name>"> on the page is handled here:
 * client-side checks, delivery, the status box ([data-lead-status]), and on
 * success a "lv:lead" DOM event with { form_name, interested_unit }.
 * cookie-consent.js listens for that event and reports generate_lead to the
 * measurement tools the visitor consented to. No personal data goes into the
 * event: only the form name and the unit type.
 *
 * Delivery, in order:
 *   1. LEAD_ENDPOINT: Google Apps Script web app (lussovitaankara Google
 *      account) -> "Lusso Vita Web Form Talepleri" sheet + e-mail + Telegram.
 *   2. /api/contact (Vercel function, e-mail) if the first one fails.
 *   3. If both fail, the visitor gets a one-tap WhatsApp button with the
 *      request already written, so the lead still reaches the sales team.
 */
(function () {
    'use strict';

    var LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyjbFCWSIOr575oso-o4UJqtU3V9z1Sf7g68tfzfDlZFJq2oNviA6BLP_Ayfh72uoEM/exec';
    var WHATSAPP = '905331587419';

    var MSG = {
        name: 'Lütfen adınızı ve soyadınızı girin.',
        phone: 'Lütfen geçerli bir telefon numarası girin (örn. 0532 123 45 67).',
        email: 'Lütfen geçerli bir e-posta adresi girin.',
        message: 'Mesajınız en fazla 2000 karakter olabilir.',
        kvkk: 'Devam etmek için KVKK Aydınlatma Metni onayı gereklidir.',
        ok: 'Talebiniz alınmıştır. Satış ekibimiz en kısa sürede sizi arayacaktır.',
        fail: 'Talebiniz otomatik iletilemedi. Aşağıdaki düğmeyle WhatsApp üzerinden tek dokunuşla gönderebilir veya 0312 911 88 83 numarasından bizi arayabilirsiniz.'
    };
    var UNIT_LABEL = { '1+1': '1+1 Daire', '2+1': '2+1 Daire', villa: 'Villa', belirsiz: 'Henüz karar vermedim' };

    // same rule as api/contact.js and the Apps Script
    function phoneOk(raw) {
        var s = String(raw || '').trim();
        var d = s.replace(/\D/g, '');
        if (d.length === 10 && /^[2-5]/.test(d)) return true;
        if (d.length === 11 && /^0[2-5]/.test(d)) return true;
        if (d.length === 12 && /^90[2-5]/.test(d)) return true;
        return s.charAt(0) === '+' && d.length >= 10 && d.length <= 15 && d.indexOf('90') !== 0;
    }

    function postJson(url, data, plain) {
        // text/plain keeps the Apps Script call a "simple" request (no CORS preflight)
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': plain ? 'text/plain;charset=utf-8' : 'application/json' },
            body: JSON.stringify(data),
            redirect: 'follow'
        })
            .then(function (res) { return res.json().then(function (j) { return !!(res.ok && j && j.ok); }, function () { return false; }); })
            .catch(function () { return false; });
    }

    function deliver(data) {
        var first = LEAD_ENDPOINT ? postJson(LEAD_ENDPOINT, data, true) : Promise.resolve(false);
        return first.then(function (ok) { return ok || postJson('/api/contact', data, false); });
    }

    function whatsappLink(data) {
        var text = 'Merhaba, web sitesindeki formdan bilgi almak istiyorum.\n' +
            'Ad Soyad: ' + data.name + '\n' +
            'Telefon: ' + data.phone + '\n' +
            'İlgilendiğim ünite: ' + (UNIT_LABEL[data.interestedUnit] || 'Belirtilmedi') +
            (data.message ? '\nMesaj: ' + data.message : '');
        return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text);
    }

    function init(form) {
        var formName = form.getAttribute('data-lead-form') || 'iletisim';
        var statusBox = form.querySelector('[data-lead-status]');
        var btn = form.querySelector('[type="submit"]');
        var btnText = btn ? btn.textContent : '';
        var busy = false;

        function field(n) { return form.querySelector('[name="' + n + '"]'); }
        function val(n) { var el = field(n); return el ? String(el.value || '').trim() : ''; }
        function checked(n) { var el = field(n); return !!(el && el.checked); }
        function stamp() { var el = field('loadedAt'); if (el) el.value = String(Date.now()); }

        function show(kind, text, waHref) {
            if (!statusBox) return;
            statusBox.textContent = text;
            statusBox.classList.remove('hidden', 'bg-green-50', 'text-green-800', 'bg-red-50', 'text-red-800');
            statusBox.classList.add(kind === 'success' ? 'bg-green-50' : 'bg-red-50', kind === 'success' ? 'text-green-800' : 'text-red-800');
            if (waHref) {
                var a = document.createElement('a');
                a.href = waHref;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = 'WhatsApp ile gönder';
                a.style.cssText = 'display:inline-block;margin-top:10px;padding:10px 18px;background:#25D366;color:#fff;font-weight:700;text-decoration:none;border-radius:4px';
                statusBox.appendChild(document.createElement('br'));
                statusBox.appendChild(a);
            }
        }

        stamp();

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (busy) return;

            var data = {
                formName: formName,
                name: val('name'),
                phone: val('phone'),
                email: val('email'),
                message: val('message'),
                interestedUnit: val('interestedUnit'),
                kvkkConsent: checked('kvkkConsent'),
                marketingConsent: checked('marketingConsent'),
                company: val('company'),
                loadedAt: val('loadedAt'),
                page: location.pathname
            };

            if (data.name.length < 2 || data.name.length > 100) return show('error', MSG.name);
            if (!phoneOk(data.phone)) return show('error', MSG.phone);
            if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return show('error', MSG.email);
            if (data.message.length > 2000) return show('error', MSG.message);
            if (!data.kvkkConsent) return show('error', MSG.kvkk);

            busy = true;
            if (btn) { btn.disabled = true; btn.textContent = 'GÖNDERİLİYOR...'; }
            if (statusBox) statusBox.classList.add('hidden');

            deliver(data)
                .then(function (ok) {
                    if (!ok) return show('error', MSG.fail, whatsappLink(data));
                    show('success', MSG.ok);
                    try {
                        document.dispatchEvent(new CustomEvent('lv:lead', {
                            detail: { form_name: formName, interested_unit: data.interestedUnit || 'belirsiz' }
                        }));
                    } catch (err) {}
                    form.reset();
                    stamp();
                })
                .then(function () {
                    busy = false;
                    if (btn) { btn.disabled = false; btn.textContent = btnText; }
                });
        });
    }

    var forms = document.querySelectorAll('form[data-lead-form]');
    for (var i = 0; i < forms.length; i++) init(forms[i]);
})();
