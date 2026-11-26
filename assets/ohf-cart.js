/*
 * OHF header cart dropdown (redesign 2026). Markup: sections/ohf-header.liquid (<ohf-cart>) and
 * snippets/ohf-cart-body.liquid (contents, also re-rendered as the section ohf-cart-drawer).
 *
 * As in the concept:
 *  - Mouse: hovering the cart icon opens it; leaving the icon and the dropdown closes it shortly after.
 *  - Click / tap / keyboard: the icon toggles it (keyboard moves focus inside). Escape, the close button,
 *    the scrim or a click outside closes it.
 *  - After an add to cart it opens for a few seconds so you see what went in.
 *
 * Shopify's own cart throughout:
 *  - Dawn's product-form.js finds this element and calls getSectionsToRender / setActiveElement /
 *    renderContents, exactly as it does for Dawn's cart pop-up.
 *  - + / − / remove post to /cart/change.js and re-render this dropdown and the icon count from the response.
 *  - Other cart changes (e.g. Dawn's cart page) arrive through Dawn's pub/sub cartUpdate event.
 */
if (!customElements.get('ohf-cart')) {
  customElements.define(
    'ohf-cart',
    class OhfCart extends HTMLElement {
      connectedCallback() {
        this.menu = this.closest('[data-ohf-cart-menu]');
        this.button = this.menu.querySelector('#cart-icon-bubble');
        this.header = this.closest('ohf-header');
        this.hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
        this.openedAt = 0;
        this.hovering = false;

        this.button.addEventListener('click', (e) => {
          e.preventDefault();
          if (!this.isOpen) this.open({ focus: e.detail === 0 });
          // A click right after hover opened it keeps it open
          else if (performance.now() - this.openedAt > 400) this.close();
        });

        this.menu.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse' || !this.hoverCapable.matches) return;
          this.hovering = true;
          clearTimeout(this.leaveTimer);
          clearTimeout(this.briefTimer);
          if (!this.isOpen) this.open();
        });
        this.menu.addEventListener('pointerleave', (e) => {
          if (e.pointerType !== 'mouse') return;
          this.hovering = false;
          this.leaveTimer = setTimeout(() => this.close(), 250);
        });

        this.addEventListener('click', (e) => {
          if (e.target.closest('[data-ohf-cart-close]')) {
            this.close();
            this.button.focus({ preventScroll: true });
            return;
          }
          const step = e.target.closest('[data-ohf-cart-qty]');
          if (step) this.change(step);
        });

        this.onDocClick = (e) => {
          if (!this.isOpen) return;
          const path = e.composedPath();
          // Clicks inside (+, − and remove re-render away before this runs, hence the path) or on an add button stay open
          if (path.includes(this.menu) || path.some((n) => n.matches?.('product-form, product-form *'))) return;
          this.close();
        };
        this.onKeydown = (e) => {
          if (e.key === 'Escape' && this.isOpen) {
            this.close();
            this.button.focus({ preventScroll: true });
          }
        };
        document.addEventListener('click', this.onDocClick);
        document.addEventListener('keydown', this.onKeydown);

        // Changes made elsewhere (Dawn's cart page) refresh the dropdown
        if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
          this.unsubscribe = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
            if (event.source === 'ohf-cart' || event.source === 'product-form') return;
            this.refresh();
          });
        }
      }

      disconnectedCallback() {
        document.removeEventListener('click', this.onDocClick);
        document.removeEventListener('keydown', this.onKeydown);
        this.unsubscribe?.();
      }

      get isOpen() {
        return this.classList.contains('is-open');
      }

      open({ focus = false, brief = false } = {}) {
        clearTimeout(this.briefTimer);
        if (!this.isOpen) this.openedAt = performance.now();
        this.header?.closeOthers?.('cart');
        this.classList.add('is-open');
        this.setAttribute('aria-hidden', 'false');
        this.button.setAttribute('aria-expanded', 'true');
        this.header?.syncScrim?.();
        if (focus) this.querySelector('[data-ohf-cart-close]')?.focus({ preventScroll: true });
        if (brief) this.briefTimer = setTimeout(() => !this.hovering && this.close(), 3500);
      }

      close() {
        clearTimeout(this.briefTimer);
        if (!this.isOpen) return;
        this.classList.remove('is-open');
        this.setAttribute('aria-hidden', 'true');
        this.button.setAttribute('aria-expanded', 'false');
        this.header?.syncScrim?.();
      }

      /* ---------- Contract with Dawn's product-form.js ---------- */

      getSectionsToRender() {
        return [{ id: 'ohf-cart-drawer' }, { id: 'cart-icon-bubble' }];
      }

      setActiveElement(element) {
        this.activeElement = element;
      }

      renderContents(response) {
        this.render(response.sections);
        this.open({ brief: true });
      }

      /* ---------- Rendering ---------- */

      sectionHTML(html, selector) {
        return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
      }

      render(sections) {
        if (!sections) return;
        const body = sections['ohf-cart-drawer'] && this.sectionHTML(sections['ohf-cart-drawer'], '[data-ohf-cart-body]');
        if (body) this.querySelector('[data-ohf-cart-body]').replaceWith(body);
        const bubble = sections['cart-icon-bubble'] && this.sectionHTML(sections['cart-icon-bubble'], '.shopify-section');
        if (bubble) this.button.innerHTML = bubble.innerHTML;
      }

      async refresh() {
        try {
          const res = await fetch(`${window.Shopify?.routes?.root || '/'}?sections=ohf-cart-drawer,cart-icon-bubble`);
          this.render(await res.json());
        } catch (e) {
          /* keep what is shown */
        }
      }

      async change(button) {
        const row = button.closest('[data-line]');
        if (!row || this.busy) return;
        this.busy = true;
        this.setAttribute('aria-busy', 'true');
        row.classList.add('is-busy');
        const line = Number(row.dataset.line);
        const quantity = Number(button.dataset.ohfCartQty);
        // Where focus goes after the re-render: the same control on the same row, else the close button
        const focusKey = button.matches('.ohf-cart__remove') ? null : button === row.querySelector('.ohf-cart__step') ? 0 : 1;

        try {
          const res = await fetch(`${routes.cart_change_url}`, {
            ...fetchConfig(),
            body: JSON.stringify({
              line,
              quantity,
              sections: this.getSectionsToRender().map((s) => s.id),
              sections_url: window.location.pathname,
            }),
          });
          const data = await res.json();
          if (data.errors || data.status) {
            this.showError(data.errors || data.description || data.message);
            row.classList.remove('is-busy');
            return;
          }
          this.render(data.sections);
          const newRow = this.querySelector(`[data-line="${line}"]`);
          const target =
            (newRow && focusKey !== null && newRow.querySelectorAll('.ohf-cart__step')[focusKey]) ||
            this.querySelector('[data-ohf-cart-close]');
          if (this.contains(document.activeElement) || document.activeElement === document.body)
            target?.focus({ preventScroll: true });
          if (typeof publish === 'function') publish(PUB_SUB_EVENTS.cartUpdate, { source: 'ohf-cart', cartData: data });
        } catch (e) {
          this.showError(window.cartStrings?.error);
          row.classList.remove('is-busy');
        } finally {
          this.busy = false;
          this.removeAttribute('aria-busy');
        }
      }

      showError(message) {
        const el = this.querySelector('[data-ohf-cart-error]');
        if (!el) return;
        el.textContent = typeof message === 'string' && message ? message : window.cartStrings?.error || '';
        el.hidden = !el.textContent;
      }
    }
  );
}
