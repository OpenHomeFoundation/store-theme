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
 * One thing open at a time; a scrim dims the page behind.
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

        this.scrim?.addEventListener('click', () => this.closeAll());
        document.addEventListener('keydown', this.onKeydown);
        document.addEventListener('click', this.onDocClick);
        this.desktop.addEventListener('change', this.onBreakpoint);
      }

      disconnectedCallback() {
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

        const filter = this.regionPop.querySelector('[data-ohf-region-filter]');
        filter?.addEventListener('input', () => {
          const q = filter.value.trim().toLowerCase();
          this.regionPop.querySelectorAll('.ohf-region__list li').forEach((li) => {
            li.hidden = q !== '' && !li.dataset.name.includes(q);
          });
        });
      }

      openRegion() {
        this.closeSubs();
        this.closeMobile();
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
      }

      openMobile() {
        this.closeRegion();
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
          !!this.openToggle() || (this.regionPop && !this.regionPop.hidden) || (this.mobile && !this.mobile.hidden);
        this.scrim.hidden = !anyOpen;
      }

      closeAll() {
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
