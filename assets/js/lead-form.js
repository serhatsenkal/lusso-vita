/*
 * Lusso Vita - lead forms (İletişim, Daire Tipleri, Villalar).
 *
 * Every <form data-lead-form="<form_name>"> on the page is handled here:
 * client-side checks, POST /api/contact, the status box ([data-lead-status]),
 * and on success a "lv:lead" DOM event with { form_name, interested_unit }.
 * cookie-consent.js listens for that event and reports generate_lead to the
 * measurement tools the visitor consented to. No personal data goes into the
 * event: only the form name and the unit type.
 */
(function () {
    'use strict';

    var MSG = {
        name: 'Lütfen adınızı ve soyadınızı girin.',
        phone: 'Lütfen geçerli bir telefon numarası girin (örn. 0532 123 45 67).',
        email: 'Lütfen geçerli bir e-posta adresi girin.',
        message: 'Mesajınız en fazla 2000 karakter olabilir.',
        kvkk: 'Devam etmek için KVKK Aydınlatma Metni onayı gereklidir.',
        ok: 'Talebiniz alınmıştır. Satış ekibimiz en kısa sürede sizi arayacaktır.',
        fail: 'Talebiniz şu anda gönderilemedi. Lütfen 0312 911 88 83 numarasından bizi arayın veya tekrar deneyin.'
    };

    // same rule as api/contact.js
    function phoneOk(raw) {
        var s = String(raw || '').trim();
        var d = s.replace(/\D/g, '');
        if (d.length === 10 && /^[2-5]/.test(d)) return true;
        if (d.length === 11 && /^0[2-5]/.test(d)) return true;
        if (d.length === 12 && /^90[2-5]/.test(d)) return true;
        return s.charAt(0) === '+' && d.length >= 10 && d.length <= 15 && d.indexOf('90') !== 0;
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

        function show(kind, text) {
            if (!statusBox) return;
            statusBox.textContent = text;
            statusBox.classList.remove('hidden', 'bg-green-50', 'text-green-800', 'bg-red-50', 'text-red-800');
            statusBox.classList.add(kind === 'success' ? 'bg-green-50' : 'bg-red-50', kind === 'success' ? 'text-green-800' : 'text-red-800');
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
                loadedAt: val('loadedAt')
            };

            if (data.name.length < 2 || data.name.length > 100) return show('error', MSG.name);
            if (!phoneOk(data.phone)) return show('error', MSG.phone);
            if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return show('error', MSG.email);
            if (data.message.length > 2000) return show('error', MSG.message);
            if (!data.kvkkConsent) return show('error', MSG.kvkk);

            busy = true;
            if (btn) { btn.disabled = true; btn.textContent = 'GÖNDERİLİYOR...'; }
            if (statusBox) statusBox.classList.add('hidden');

            fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
                .then(function (res) { return res.json().then(function (j) { return res.ok && j && j.ok; }, function () { return false; }); })
                .then(function (ok) {
                    if (!ok) return show('error', MSG.fail);
                    show('success', MSG.ok);
                    try {
                        document.dispatchEvent(new CustomEvent('lv:lead', {
                            detail: { form_name: formName, interested_unit: data.interestedUnit || 'belirsiz' }
                        }));
                    } catch (err) {}
                    form.reset();
                    stamp();
                })
                .catch(function () { show('error', MSG.fail); })
                .then(function () {
                    busy = false;
                    if (btn) { btn.disabled = false; btn.textContent = btnText; }
                });
        });
    }

    var forms = document.querySelectorAll('form[data-lead-form]');
    for (var i = 0; i < forms.length; i++) init(forms[i]);
})();
