/*
 * OHF product page behaviour (redesign 2026). Markup: sections/ohf-main-product.liquid.
 * - Options: colour swatches and size pills pick the variant (product JSON in the page), update price, stock,
 *   Add to cart, the URL (?variant=) and, for a new colour, the photo. Sizes that are sold out in the chosen colour
 *   are struck through. Sizes start unchosen; Add to cart asks for one first.
 * - Add to cart itself is Dawn's <product-form> (cart pop-up, errors).
 * - Gallery: thumbnails swap the big photo; dots show when the thumbnails scroll.
 * - Photo viewer: every gallery photo full screen; zoom with the wheel, a double click/tap or a pinch; drag to move
 *   a zoomed photo; arrows, buttons or a swipe for previous / next; Escape or a click outside closes.
 * - Size guide dialog and Share (the device's share sheet, or copy the link).
 */
if (!customElements.get('ohf-product')) {
  customElements.define(
    'ohf-product',
    class OhfProduct extends HTMLElement {
      connectedCallback() {
        const json = this.querySelector('[data-product-json]');
        this.product = json ? JSON.parse(json.textContent) : null;
        this.input = this.querySelector('[data-variant-input]');
        this.needsChoice = this.input?.hasAttribute('data-needs-choice');
        this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

        this.bindOptions();
        this.bindSubmitGuard();
        this.bindQuantity();
        this.bindGallery();
        this.bindViewer();
        this.bindGuide();
        this.bindShare();
        if (this.product) this.refreshAvailability();
      }

      /* ---------------- Options and variants ---------------- */

      fieldsets() {
        return [...this.querySelectorAll('[data-option-index]')];
      }

      selected() {
        // One entry per option: the chosen value, or null when nothing is chosen yet
        const values = this.product.options.map(() => null);
        this.fieldsets().forEach((fs) => {
          const btn = fs.querySelector('[aria-pressed="true"]');
          values[+fs.dataset.optionIndex] = btn ? btn.dataset.value : null;
        });
        return values;
      }

      findVariant(values) {
        return this.product.variants.find((v) => v.options.every((o, i) => values[i] === null || o === values[i]));
      }

      bindOptions() {
        this.fieldsets().forEach((fs) => {
          fs.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-value]');
            if (!btn || btn.classList.contains('is-out')) return;
            const colourBefore = this.colourValue();
            fs.querySelectorAll('[data-value]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
            const label = fs.querySelector('[data-option-value]');
            if (label) label.textContent = btn.dataset.value;
            this.querySelector('[data-choose-msg]')?.setAttribute('hidden', '');
            this.update(colourBefore !== this.colourValue());
          });
        });
      }

      colourValue() {
        const fs = this.querySelector('.ohf-pdp__swatches');
        return fs?.querySelector('[aria-pressed="true"]')?.dataset.value || null;
      }

      update(colourChanged) {
        const values = this.selected();
        const complete = values.every((v) => v !== null);
        const variant = this.findVariant(values);
        if (variant) {
          this.input.value = variant.id;
          this.setPrice(variant);
          if (complete) {
            this.needsChoice = false;
            const url = new URL(window.location.href);
            url.searchParams.set('variant', variant.id);
            window.history.replaceState({}, '', url.toString());
          }
          this.setButton(complete ? variant.available : this.anyAvailable(values));
          if (colourChanged && variant.featured_media) this.showMediaId(variant.featured_media.id);
        } else {
          this.setButton(false, true);
        }
        this.refreshAvailability();
      }

      anyAvailable(values) {
        return this.product.variants.some((v) => v.available && v.options.every((o, i) => values[i] === null || o === values[i]));
      }

      // Strike through values that can't be bought with the other choices as they are
      refreshAvailability() {
        const values = this.selected();
        this.fieldsets().forEach((fs) => {
          const i = +fs.dataset.optionIndex;
          fs.querySelectorAll('[data-value]').forEach((btn) => {
            const trial = values.slice();
            trial[i] = btn.dataset.value;
            const ok = this.anyAvailable(trial);
            btn.classList.toggle('is-out', !ok);
            btn.setAttribute('aria-disabled', String(!ok));
          });
        });
      }

      setPrice(variant) {
        if (!this.prices) {
          const el = this.querySelector('[data-variant-prices]');
          this.prices = el ? JSON.parse(el.textContent) : {};
        }
        const [price, compare] = this.prices[variant.id] || [];
        const priceEl = this.querySelector('[data-price]');
        const compareEl = this.querySelector('[data-compare]');
        if (priceEl && price) priceEl.textContent = price;
        if (compareEl) {
          compareEl.hidden = !compare;
          if (compare) compareEl.textContent = compare;
        }
      }

      setButton(available, unavailable) {
        const btn = this.querySelector('[data-add]');
        const text = this.querySelector('[data-add-text]');
        if (!btn || !text) return;
        btn.disabled = !available;
        text.textContent = available
          ? window.variantStrings?.addToCart || 'Add to cart'
          : unavailable
          ? window.variantStrings?.unavailable || 'Unavailable'
          : window.variantStrings?.soldOut || 'Sold out';
      }

      // Sizes start unchosen: ask for one before Dawn's product-form sends anything
      bindSubmitGuard() {
        const form = this.querySelector('product-form');
        if (!form) return;
        form.addEventListener(
          'submit',
          (e) => {
            if (!this.needsChoice) return;
            const missing = this.fieldsets().find((fs) => !fs.querySelector('[aria-pressed="true"]'));
            if (!missing) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const msg = this.querySelector('[data-choose-msg]');
            if (msg) msg.hidden = false;
            missing.querySelector('[data-value]:not(.is-out)')?.focus();
          },
          true
        );
      }

      bindQuantity() {
        const input = this.querySelector('[data-qty-input]');
        this.querySelectorAll('[data-qty]').forEach((b) =>
          b.addEventListener('click', () => {
            input.value = Math.max(1, (parseInt(input.value, 10) || 1) + parseInt(b.dataset.qty, 10));
          })
        );
      }

      /* ---------------- Gallery ---------------- */

      thumbs() {
        return [...this.querySelectorAll('[data-gallery-thumbs] .ohf-pdp__thumb')];
      }

      bindGallery() {
        this.mainImg = this.querySelector('.ohf-pdp__main-img');
        this.thumbs().forEach((t, i) => t.addEventListener('click', () => this.show(i)));
        this.setupThumbDots();
      }

      currentIndex() {
        return Math.max(0, this.thumbs().findIndex((t) => t.getAttribute('aria-current') === 'true'));
      }

      show(i) {
        const thumbs = this.thumbs();
        const t = thumbs[i];
        if (!t || !this.mainImg) return;
        thumbs.forEach((x) => x.removeAttribute('aria-current'));
        t.setAttribute('aria-current', 'true');
        this.mainImg.removeAttribute('srcset');
        this.mainImg.src = t.dataset.src;
        this.mainImg.alt = t.dataset.alt || '';
        this.mainImg.classList.toggle('is-worn', t.hasAttribute('data-worn'));
        t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: this.reduce.matches ? 'auto' : 'smooth' });
      }

      showMediaId(id) {
        const i = this.thumbs().findIndex((t) => t.dataset.mediaId === String(id));
        if (i >= 0) this.show(i);
      }

      setupThumbDots() {
        const row = this.querySelector('[data-gallery-thumbs]');
        const dots = this.querySelector('[data-thumb-dots]');
        if (!row || !dots) return;
        const build = () => {
          const pages = Math.ceil(row.scrollWidth / Math.max(1, row.clientWidth) - 0.05);
          if (pages < 2) {
            dots.hidden = true;
            return;
          }
          if (dots.children.length !== pages) {
            dots.replaceChildren(
              ...Array.from({ length: pages }, (_, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ohf-pdp__dot';
                b.setAttribute('aria-label', `Show thumbnails ${i + 1} of ${pages}`);
                b.addEventListener('click', () => row.scrollTo({ left: i * row.clientWidth, behavior: 'smooth' }));
                return b;
              })
            );
          }
          dots.hidden = false;
          sync();
        };
        const sync = () => {
          const i = Math.round(row.scrollLeft / Math.max(1, row.clientWidth));
          [...dots.children].forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
        };
        row.addEventListener('scroll', sync, { passive: true });
        new ResizeObserver(build).observe(row);
      }

      /* ---------------- Photo viewer ---------------- */

      bindViewer() {
        const dlg = this.querySelector('[data-viewer]');
        const open = this.querySelector('[data-gallery-open]');
        if (!dlg || !open) return;
        const img = dlg.querySelector('[data-viewer-img]');
        const stage = dlg.querySelector('[data-viewer-stage]');
        let index = 0;
        let scale = 1;
        let x = 0;
        let y = 0;
        const pointers = new Map();
        let pinchStart = null;
        let dragStart = null;
        let swipeStart = null;

        const apply = () => {
          img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
          dlg.classList.toggle('is-zoomed', scale > 1);
        };
        const clamp = () => {
          if (scale <= 1) {
            scale = 1;
            x = 0;
            y = 0;
            return;
          }
          const r = img.getBoundingClientRect();
          const w = (r.width / scale) * (scale - 1) * 0.5;
          const h = (r.height / scale) * (scale - 1) * 0.5;
          x = Math.max(-w, Math.min(w, x));
          y = Math.max(-h, Math.min(h, y));
        };
        const zoomAt = (newScale, cx, cy) => {
          const r = img.getBoundingClientRect();
          const ox = cx - (r.left + r.width / 2);
          const oy = cy - (r.top + r.height / 2);
          const k = newScale / scale;
          x = (x - ox) * k + ox;
          y = (y - oy) * k + oy;
          scale = Math.max(1, Math.min(4, newScale));
          clamp();
          apply();
        };
        const load = (i) => {
          const thumbs = this.thumbs();
          if (!thumbs.length) return;
          index = (i + thumbs.length) % thumbs.length;
          const t = thumbs[index];
          scale = 1;
          x = 0;
          y = 0;
          apply();
          img.src = t.dataset.full || t.dataset.src;
          img.alt = t.dataset.alt || '';
          dlg.querySelector('[data-viewer-count]').textContent = `${index + 1} / ${thumbs.length}`;
          dlg.querySelector('[data-viewer-caption]').textContent = t.dataset.caption || t.dataset.alt || '';
          const single = thumbs.length < 2;
          dlg.querySelector('[data-viewer-prev]').hidden = single;
          dlg.querySelector('[data-viewer-next]').hidden = single;
        };

        open.addEventListener('click', () => {
          load(this.currentIndex());
          dlg.showModal();
        });
        dlg.querySelector('[data-viewer-close]').addEventListener('click', () => dlg.close());
        dlg.querySelector('[data-viewer-prev]').addEventListener('click', () => load(index - 1));
        dlg.querySelector('[data-viewer-next]').addEventListener('click', () => load(index + 1));
        dlg.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft') load(index - 1);
          if (e.key === 'ArrowRight') load(index + 1);
        });
        // A click outside the photo (not the end of a drag) closes
        stage.addEventListener('click', (e) => {
          if (e.target === stage && !this.dragged) dlg.close();
        });
        img.addEventListener('dblclick', (e) => zoomAt(scale > 1 ? 1 : 2.5, e.clientX, e.clientY));
        stage.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault();
            zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
          },
          { passive: false }
        );
        stage.addEventListener('pointerdown', (e) => {
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          stage.setPointerCapture(e.pointerId);
          this.dragged = false;
          if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), scale };
          } else if (scale > 1) {
            dragStart = { x: e.clientX - x, y: e.clientY - y };
          } else {
            swipeStart = { x: e.clientX, y: e.clientY };
          }
        });
        stage.addEventListener('pointermove', (e) => {
          if (!pointers.has(e.pointerId)) return;
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinchStart && pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            zoomAt(pinchStart.scale * (d / pinchStart.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
            this.dragged = true;
          } else if (dragStart) {
            x = e.clientX - dragStart.x;
            y = e.clientY - dragStart.y;
            clamp();
            apply();
            this.dragged = true;
          }
        });
        const end = (e) => {
          if (swipeStart && pointers.size === 1 && scale === 1) {
            const dx = e.clientX - swipeStart.x;
            const dy = e.clientY - swipeStart.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
              load(index + (dx < 0 ? 1 : -1));
              this.dragged = true;
            }
          }
          pointers.delete(e.pointerId);
          if (pointers.size < 2) pinchStart = null;
          if (!pointers.size) {
            dragStart = null;
            swipeStart = null;
          }
        };
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);
      }

      /* ---------------- Size guide and share ---------------- */

      bindGuide() {
        const dlg = this.querySelector('[data-guide]');
        if (!dlg) return;
        this.querySelectorAll('[data-guide-open]').forEach((b) => b.addEventListener('click', () => dlg.showModal()));
        dlg.querySelector('[data-guide-close]')?.addEventListener('click', () => dlg.close());
        // A click on the backdrop (outside the dialog box) closes it
        dlg.addEventListener('click', (e) => {
          if (e.target !== dlg) return;
          const r = dlg.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (!inside) dlg.close();
        });
      }

      bindShare() {
        const btn = this.querySelector('[data-share]');
        const status = this.querySelector('[data-share-status]');
        if (!btn) return;
        btn.addEventListener('click', async () => {
          const url = btn.dataset.shareUrl;
          if (navigator.share) {
            try {
              await navigator.share({ title: btn.dataset.shareTitle, url });
              return;
            } catch (e) {
              if (e.name === 'AbortError') return;
            }
          }
          try {
            await navigator.clipboard.writeText(url);
            if (status) status.textContent = window.accessibilityStrings?.shareSuccess || 'Link copied';
          } catch (e) {
            if (status) status.textContent = url;
          }
        });
      }
    }
  );
}
