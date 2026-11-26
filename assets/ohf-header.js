/*
 * OHF header behaviour (redesign 2026). Markup: sections/ohf-header.liquid.
 *
 * Dropdown panels (desktop, wider than 1100px)
 *  - Mouse: hovering a top item opens its panel; leaving the nav closes it. Clicking the top item
 *    follows its link.
 *  - Touch: the first tap opens the panel, a second tap follows the link.
 *  - Keyboard: Enter follows the link; Space or Arrow Down opens the panel and moves focus into it.
 *    Escape closes and returns focus. Tabbing out of a panel closes it.
 *  - Photos crossfade: the next photo loads into the hidden <img> before swapping, so there's no
 *    blank frame. Hovering a link or column picks a photo matched to it (Dropdown photo blocks).
 * Region popover: the globe opens it (hover with a mouse, click or keyboard otherwise).
 * Phone menu: the menu button opens the light-blue panel.
 * Cart dropdown: <ohf-cart> (assets/ohf-cart.js) runs itself and calls closeOthers / syncScrim here.
 * One thing open at a time; a scrim dims the page behind.
 * Scrolled: past 8px from the top the card gets .is-stuck (a soft shadow), so it lifts off the page.
 * Contrast: once the page has scrolled, the header checks what's behind its card. Where that's the same colour as
 * the card (beige on beige, or navy on navy with the lights off), the card fades to a contrasting surface
 * (.is-blend, styles in ohf-header.css). Photos and other colours leave it as it is.
 */
if (!customElements.get('ohf-header')) {
  customElements.define(
    'ohf-header',
    class OhfHeader extends HTMLElement {
      connectedCallback() {
        this.scrim = this.parentElement.querySelector('[data-ohf-scrim]');
        this.toggles = [...this.querySelectorAll('[data-ohf-sub-toggle]')];
        this.regionToggle = this.querySelector('[data-ohf-region-toggle]');
        this.regionPop = this.querySelector('[data-ohf-region-pop]');
        this.menuToggle = this.querySelector('[data-ohf-menu-toggle]');
        this.mobile = this.querySelector('[data-ohf-mobile]');
        this.hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
        this.desktop = window.matchMedia('(min-width: 1101px)');
        this.closeTimer = null;
        this.lastPointer = 'mouse';

        this.onKeydown = this.onKeydown.bind(this);
        this.onDocClick = this.onDocClick.bind(this);
        this.onBreakpoint = () => this.closeAll();

        this.bindSubs();
        this.bindRegion();
        this.bindMobile();
        this.bindSearch();
        this.bindContrast();

        this.scrim?.addEventListener('click', () => this.closeAll());
        document.addEventListener('keydown', this.onKeydown);
        document.addEventListener('click', this.onDocClick);
        this.desktop.addEventListener('change', this.onBreakpoint);
      }

      disconnectedCallback() {
        window.removeEventListener('scroll', this.onContrastScroll);
        window.removeEventListener('resize', this.onContrastScroll);
        this.lightsObserver?.disconnect();
        document.removeEventListener('keydown', this.onKeydown);
        document.removeEventListener('click', this.onDocClick);
        this.desktop.removeEventListener('change', this.onBreakpoint);
      }

      /* ---------- Dropdown panels ---------- */

      panelFor(toggle) {
        return this.querySelector(`[data-ohf-sub="${toggle.dataset.ohfSubToggle}"]`);
      }

      bindSubs() {
        this.toggles.forEach((toggle) => {
          const panel = this.panelFor(toggle);
          if (!panel) return;

          toggle.addEventListener('pointerdown', (e) => (this.lastPointer = e.pointerType));
          toggle.addEventListener('pointerenter', (e) => {
            if (e.pointerType === 'mouse' && this.hoverCapable.matches) this.openSub(toggle);
          });
          toggle.addEventListener('click', (e) => {
            // Touch: first tap opens, second follows the link
            if (this.lastPointer !== 'mouse' && toggle.getAttribute('aria-expanded') !== 'true') {
              e.preventDefault();
              this.openSub(toggle);
            }
          });
          toggle.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              this.openSub(toggle);
              panel.querySelector('a')?.focus();
            }
          });

          // Leaving a panel by keyboard closes it
          panel.addEventListener('focusout', (e) => {
            if (!panel.contains(e.relatedTarget) && e.relatedTarget !== toggle) this.closeSubs();
          });

          // Photo follows the link or column under the pointer (or focus)
          panel.querySelectorAll('[data-ohf-photo-key]').forEach((el) => {
            const pick = () => this.showPhoto(panel, el.dataset.ohfPhotoKey);
            el.addEventListener('pointerenter', pick);
            if (el.tagName === 'A') el.addEventListener('focus', pick);
          });
        });

        // Plain top links close an open panel when hovered
        this.querySelectorAll('.ohf-nav__top:not([data-ohf-sub-toggle])').forEach((link) => {
          link.addEventListener('pointerenter', (e) => {
            if (e.pointerType === 'mouse') this.closeSubs();
          });
        });

        // Leaving the whole nav (card and panels) closes with a short grace period
        this.addEventListener('pointerleave', (e) => {
          if (e.pointerType !== 'mouse') return;
          this.closeTimer = setTimeout(() => this.closeSubs(), 150);
        });
        this.addEventListener('pointerenter', () => clearTimeout(this.closeTimer));
      }

      openSub(toggle) {
        if (!this.desktop.matches) return;
        clearTimeout(this.closeTimer);
        this.closeRegion();
        this.closeCart();
        this.toggles.forEach((t) => {
          const p = this.panelFor(t);
          const on = t === toggle;
          t.setAttribute('aria-expanded', String(on));
          if (p) p.hidden = !on;
        });
        const panel = this.panelFor(toggle);
        if (panel && !panel.dataset.photoShown) {
          panel.dataset.photoShown = 'true';
          this.showPhoto(panel, '');
        }
        this.syncScrim();
      }

      closeSubs() {
        this.toggles.forEach((t) => {
          t.setAttribute('aria-expanded', 'false');
          const p = this.panelFor(t);
          if (p) {
            p.hidden = true;
            delete p.dataset.photoShown;
          }
        });
        this.syncScrim();
      }

      openToggle() {
        return this.toggles.find((t) => t.getAttribute('aria-expanded') === 'true');
      }

      photosFor(panel) {
        const holder = panel.querySelector('[data-ohf-photos]');
        if (!holder) return null;
        if (!holder._photos) {
          try {
            holder._photos = JSON.parse(holder.dataset.ohfPhotos || '[]');
          } catch (e) {
            holder._photos = [];
          }
        }
        return holder;
      }

      showPhoto(panel, key) {
        const holder = this.photosFor(panel);
        if (!holder || !holder._photos.length) return;
        const all = holder._photos;
        let pool = key ? all.filter((p) => p.key === key) : [];
        if (!pool.length) pool = all.filter((p) => !p.key);
        if (!pool.length) pool = all;

        const [a, b] = holder.querySelectorAll('[data-ohf-img]');
        const shown = a.classList.contains('is-on') ? a : b;
        const hidden = shown === a ? b : a;
        const current = shown.getAttribute('src');
        if (pool.length > 1) pool = pool.filter((p) => p.src !== current);
        if (pool.length === 1 && pool[0].src === current) return;
        const next = pool[Math.floor(Math.random() * pool.length)];
        if (!next || next.src === current) return;

        if (!current) {
          shown.src = next.src;
          return;
        }
        hidden.onload = () => {
          hidden.classList.add('is-on');
          shown.classList.remove('is-on');
          hidden.onload = null;
        };
        hidden.src = next.src;
      }

      /* ---------- Region popover ---------- */

      bindRegion() {
        if (!this.regionToggle || !this.regionPop) return;
        this.regionToggle.addEventListener('click', () => {
          if (this.regionPop.hidden) this.openRegion();
          else this.closeRegion();
        });
        this.regionToggle.addEventListener('pointerenter', (e) => {
          if (e.pointerType === 'mouse' && this.hoverCapable.matches) this.openRegion();
        });

        // With a mouse, the list closes shortly after the pointer leaves the globe and the list
        // (the gap between them is bridged in CSS), not only when it leaves the whole header.
        const menu = this.regionToggle.closest('[data-ohf-region-menu]');
        menu.addEventListener('pointerleave', (e) => {
          if (e.pointerType !== 'mouse') return;
          // Keep it open while someone is typing in the filter box
          if (this.regionPop.contains(document.activeElement) && document.activeElement.matches('input')) return;
          this.regionTimer = setTimeout(() => this.closeRegion(), 200);
        });
        menu.addEventListener('pointerenter', () => clearTimeout(this.regionTimer));

        // Filter box in any region list in the header (the globe popover and the phone menu's copy)
        this.addEventListener('input', (e) => {
          const filter = e.target.closest('[data-ohf-region-filter]');
          if (!filter) return;
          const q = filter.value.trim().toLowerCase();
          filter
            .closest('[data-ohf-region]')
            .querySelectorAll('.ohf-region__list li')
            .forEach((li) => {
              li.hidden = q !== '' && !li.dataset.name.includes(q);
            });
        });
      }

      openRegion() {
        this.closeSubs();
        this.closeMobile();
        this.closeCart();
        this.regionPop.hidden = false;
        this.regionToggle.setAttribute('aria-expanded', 'true');
        this.regionPop.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
        this.syncScrim();
      }

      closeRegion() {
        if (!this.regionPop || this.regionPop.hidden) return;
        this.regionPop.hidden = true;
        this.regionToggle.setAttribute('aria-expanded', 'false');
        this.syncScrim();
      }

      /* ---------- Phone menu ---------- */

      bindMobile() {
        if (!this.menuToggle || !this.mobile) return;
        this.menuToggle.addEventListener('click', () => {
          if (this.mobile.hidden) this.openMobile();
          else this.closeMobile();
        });
        // Tabbing out of the open menu closes it, so focus never sits on the page hidden behind it
        this.mobile.addEventListener('focusout', (e) => {
          const to = e.relatedTarget;
          if (to && !this.mobile.contains(to) && to !== this.menuToggle) this.closeMobile();
        });
      }

      openMobile() {
        this.closeRegion();
        this.closeCart();
        this.mobile.hidden = false;
        this.menuToggle.setAttribute('aria-expanded', 'true');
        this.syncScrim();
      }

      closeMobile() {
        if (!this.mobile || this.mobile.hidden) return;
        this.mobile.hidden = true;
        this.menuToggle.setAttribute('aria-expanded', 'false');
        this.syncScrim();
      }

      /* ---------- Shared ---------- */

      syncScrim() {
        if (!this.scrim) return;
        const anyOpen =
          !!this.openToggle() ||
          (this.regionPop && !this.regionPop.hidden) ||
          (this.mobile && !this.mobile.hidden) ||
          !!this.cartEl?.isOpen ||
          !!this.searchDetails?.open;
        this.scrim.hidden = !anyOpen;
      }

      /* ---------- Search ---------- */

      // Dawn's search modal (details-modal) opens and closes itself; the header only dims the page behind
      // it with the same full-screen scrim, and closes any other menu when it opens. Clicking the scrim
      // closes the search through Dawn's own outside-click handling.
      bindSearch() {
        this.searchDetails = this.querySelector('.ohf-search details');
        this.searchDetails?.addEventListener('toggle', () => {
          if (this.searchDetails.open) {
            this.closeSubs();
            this.closeRegion();
            this.closeMobile();
            this.closeCart();
          }
          this.syncScrim();
        });
      }

      /* ---------- Contrast with what's behind the card ---------- */

      bindContrast() {
        this.card = this.querySelector('.ohf-nav__card');
        if (!this.card) return;
        // The card's own colour, read from a probe so it follows the lights switch
        this.probe = document.createElement('span');
        this.probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;background:var(--bg);pointer-events:none';
        this.probe.setAttribute('aria-hidden', 'true');
        this.card.appendChild(this.probe);
        this.readBase = () => (this.base = this.parseColour(getComputedStyle(this.probe).backgroundColor));
        this.readBase();

        this.onContrastScroll = () => {
          if (!this.contrastFrame) this.contrastFrame = requestAnimationFrame(() => this.checkContrast());
        };
        window.addEventListener('scroll', this.onContrastScroll, { passive: true });
        window.addEventListener('resize', this.onContrastScroll);
        // Lights on/off changes both the card and the sections
        this.lightsObserver = new MutationObserver(() => {
          this.readBase();
          this.onContrastScroll();
        });
        this.lightsObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lights'] });
        this.checkContrast();
      }

      parseColour(value) {
        const m = value && value.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = 1] = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
        return { r, g, b, a };
      }

      // The colour of the band behind one point of the card: the first thing under it (outside the header) that's
      // at least 60% of the screen wide and has a solid background colour. Narrower things (product cards, buttons)
      // are skipped, so scrolling over a grid doesn't flicker. A wide photo or background image counts as "not a
      // flat colour".
      colourBehind(x, y) {
        const stack = document.elementsFromPoint(x, y);
        const minWidth = window.innerWidth * 0.6;
        for (const hit of stack) {
          if (this.contains(hit) || hit.closest('[data-ohf-scrim]')) continue;
          for (let el = hit; el && el !== document.documentElement; el = el.parentElement) {
            if (this.contains(el)) break;
            if (el.getBoundingClientRect().width < minWidth) continue;
            if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS') return 'photo';
            const cs = getComputedStyle(el);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'photo';
            const c = this.parseColour(cs.backgroundColor);
            if (c && c.a > 0.5) return c;
          }
        }
        return this.parseColour(getComputedStyle(document.body).backgroundColor);
      }

      checkContrast() {
        this.contrastFrame = null;
        if (!this.base) return;
        // At the very top the page is laid out around the header as designed
        const stuck = window.scrollY > 8;
        this.card.classList.toggle('is-stuck', stuck);
        let blend = false;
        if (stuck) {
          const r = this.card.getBoundingClientRect();
          const y = r.top + r.height / 2;
          // Left, middle and right of the card: blend if any of them matches
          for (const fx of [0.08, 0.5, 0.92]) {
            const c = this.colourBehind(r.left + r.width * fx, y);
            if (c && c !== 'photo') {
              const d = Math.hypot(c.r - this.base.r, c.g - this.base.g, c.b - this.base.b);
              if (d < 6) {
                blend = true;
                break;
              }
            }
          }
        }
        this.card.classList.toggle('is-blend', blend);
      }

      closeAll() {
        this.closeSubs();
        this.closeRegion();
        this.closeMobile();
        this.closeCart();
      }

      /* ---------- Cart dropdown (assets/ohf-cart.js) ---------- */

      get cartEl() {
        return this.querySelector('ohf-cart');
      }

      closeCart() {
        this.cartEl?.close?.();
      }

      // Called by the cart when it opens: one thing open at a time
      closeOthers() {
        this.closeSubs();
        this.closeRegion();
        this.closeMobile();
      }

      onKeydown(e) {
        if (e.key !== 'Escape') return;
        const toggle = this.openToggle();
        if (toggle) {
          this.closeSubs();
          toggle.focus();
        } else if (this.regionPop && !this.regionPop.hidden) {
          this.closeRegion();
          this.regionToggle.focus();
        } else if (this.mobile && !this.mobile.hidden) {
          this.closeMobile();
          this.menuToggle.focus();
        }
      }

      onDocClick(e) {
        if (this.regionPop && !this.regionPop.hidden && !e.target.closest('[data-ohf-region-menu]')) this.closeRegion();
        if (this.openToggle() && !this.contains(e.target)) this.closeSubs();
      }
    }
  );
}
