/*
 * Lusso Vita - shared lightbox navigation (all pages with a #lightbox popup).
 * Adds prev/next arrows, ←/→ keys, touch swipe, an "n / N" counter and a soft
 * fade between images to the page's own lightbox. The page keeps its own
 * openLightbox()/closeLightbox(); this file wraps openLightbox.
 *
 * Sequence = every image the visitor can currently see on the page (the
 * elements with onclick="openLightbox('src', 'caption'[, flag])", in page
 * order), so on filtered pages the arrows stay inside the active category.
 * A page can override it with window.lightboxItems(src) -> [{src, caption, flag}].
 * window.lightboxFlag names what the optional 3rd argument means on that page:
 *   'wide'    - panorama: use (almost) the full viewport width
 *   'lightBg' - transparent plan: show it on the site's ivory
 */
(function () {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const cap = document.getElementById('lightbox-caption');
    if (!lb || !img || typeof window.openLightbox !== 'function') return;
    const figure = img.closest('figure');

    const style = document.createElement('style');
    style.textContent = `
        #lightbox-img { transition: opacity .3s ease, transform .3s ease; }
        #lightbox-img.lb-fade { opacity: 0; transform: scale(.985); }
        #lightbox figure.lb-wide { max-width: 96vw; overflow-x: auto; }
        #lightbox figure.lb-wide img { width: 100%; height: auto; max-height: none; }
        @media (max-width: 767px) { #lightbox figure.lb-wide img { width: auto; height: 45vh; max-width: none; } }
        @media (min-width: 768px) { #lightbox figure.lb-has-nav { padding-left: 4rem; padding-right: 4rem; } }
        .lb-nav { position: absolute; top: 50%; transform: translateY(-50%); z-index: 10; width: 2.75rem; height: 2.75rem;
                  border-radius: 9999px; background: rgba(255,255,255,.1); color: #fff; display: flex; align-items: center;
                  justify-content: center; transition: background-color .2s ease; }
        .lb-nav:hover { background: rgba(255,255,255,.2); }
        .lb-nav .material-symbols-outlined { font-size: 1.9rem; }
        @media (min-width: 768px) { .lb-nav { width: 3.5rem; height: 3.5rem; } .lb-nav .material-symbols-outlined { font-size: 2.25rem; } }
        #lb-prev { left: .5rem; } #lb-next { right: .5rem; }
        @media (min-width: 768px) { #lb-prev { left: 1.5rem; } #lb-next { right: 1.5rem; } }
        #lightbox-count { color: rgba(255,255,255,.4); text-align: center; margin-top: .5rem; font-size: 10px; letter-spacing: .15em; }
    `;
    document.head.appendChild(style);

    const mkBtn = (id, icon, label, dir) => {
        const b = document.createElement('button');
        b.id = id; b.className = 'lb-nav'; b.type = 'button'; b.setAttribute('aria-label', label);
        b.innerHTML = `<span class="material-symbols-outlined">${icon}</span>`;
        b.addEventListener('click', (e) => { e.stopPropagation(); step(dir); });
        lb.appendChild(b);
        return b;
    };
    const prevBtn = mkBtn('lb-prev', 'chevron_left', 'Önceki görsel', -1);
    const nextBtn = mkBtn('lb-next', 'chevron_right', 'Sonraki görsel', 1);
    const counter = document.createElement('div');
    counter.id = 'lightbox-count';
    figure.appendChild(counter);

    const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return u; } };
    const flagName = window.lightboxFlag || '';
    let list = [], idx = 0, busy = false;

    function collect(src) {
        if (typeof window.lightboxItems === 'function') {
            const custom = window.lightboxItems(src);
            if (custom && custom.length) return custom;
        }
        const seen = new Set();
        return [...document.querySelectorAll('[onclick^="openLightbox"]')]
            .filter(el => el.offsetParent !== null && !el.closest('#lightbox'))
            .map(el => {
                const m = el.getAttribute('onclick').match(/openLightbox\('([^']+)',\s*'([^']*)'(?:,\s*(true))?\)/);
                return m && { src: m[1], caption: m[2], flag: !!m[3] };
            })
            .filter(it => it && !seen.has(abs(it.src)) && seen.add(abs(it.src)));
    }

    function render(it) {
        img.src = it.src;
        img.alt = it.caption || 'Lusso Vita görseli';
        cap.textContent = it.caption || '';
        figure.classList.toggle('lb-wide', flagName === 'wide' && !!it.flag);
        const light = flagName === 'lightBg' && !!it.flag;
        img.style.background = light ? '#FCF9F1' : '';
        img.style.padding = light ? '2.5%' : '';
        img.style.borderRadius = light ? '12px' : '';
        const multi = list.length > 1;
        prevBtn.style.display = nextBtn.style.display = multi ? '' : 'none';
        figure.classList.toggle('lb-has-nav', multi);
        counter.textContent = multi ? `${idx + 1} / ${list.length}` : '';
    }

    function step(dir) {
        if (list.length < 2 || busy || lb.classList.contains('hidden')) return;
        busy = true;
        idx = (idx + dir + list.length) % list.length;
        const it = list[idx];
        img.classList.add('lb-fade');                       // soft fade-out
        const pre = new Image();
        const swap = () => setTimeout(() => {               // swap once faded out AND loaded
            render(it);
            setTimeout(() => { img.classList.remove('lb-fade'); busy = false; }, 20);  // next frame: fade back in
        }, 300);
        pre.onload = swap; pre.onerror = swap;
        pre.src = it.src;
    }

    const original = window.openLightbox;
    window.openLightbox = function (src, caption, flag) {
        original.apply(this, arguments);
        list = collect(src);
        idx = list.findIndex(it => abs(it.src) === abs(src));
        if (idx < 0) { list = [{ src, caption, flag: !!flag }]; idx = 0; }
        img.classList.remove('lb-fade');
        busy = false;
        render(list[idx]);
    };

    document.addEventListener('keydown', (e) => {
        if (lb.classList.contains('hidden')) return;
        if (e.key === 'ArrowRight') step(1);
        if (e.key === 'ArrowLeft') step(-1);
    });
    let x0 = null;
    lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0; x0 = null;
        const it = list[idx];
        if (Math.abs(dx) < 50 || (it && it.flag && flagName === 'wide')) return;  // panoramas scroll sideways themselves
        step(dx < 0 ? 1 : -1);
    });
})();
