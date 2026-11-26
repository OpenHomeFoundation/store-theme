/*
 * <ohf-rail> (redesign 2026): a horizontal row of cards that scrolls, with position dots underneath and no arrows
 * (concept, Clelia 23 Nov). Used by the New collection and Wear the mission sections.
 *
 * Markup: <ohf-rail> containing [data-rail-track] (the scrolling row of [data-rail-slide] items) and an empty
 * [data-rail-dots] container.
 * - One dot per position, one card apart. Clicking a dot scrolls there; the current dot is wider and solid, and
 *   follows swipes, trackpad and keyboard scrolling.
 * - With a mouse the row can be dragged; a drag doesn't count as a click on the card underneath, and letting go
 *   settles on the nearest card. Touch and trackpads use native scrolling.
 * - Dots are hidden when everything fits. Reduced motion: jumps instead of smooth scrolling.
 */
if (!customElements.get('ohf-rail')) {
  customElements.define(
    'ohf-rail',
    class OhfRail extends HTMLElement {
      connectedCallback() {
        this.track = this.querySelector('[data-rail-track]');
        this.dotsEl = this.querySelector('[data-rail-dots]');
        if (!this.track || !this.dotsEl) return;
        this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.dots = [];

        this.onScroll = () => this.sync();
        this.track.addEventListener('scroll', this.onScroll, { passive: true });
        this.resizeObserver = new ResizeObserver(() => this.build());
        this.resizeObserver.observe(this.track);
        this.build();
        this.bindDrag();
      }

      disconnectedCallback() {
        this.resizeObserver?.disconnect();
        this.track?.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('pointerup', this.onUp);
      }

      step() {
        const slides = this.track.querySelectorAll('[data-rail-slide]');
        if (slides.length > 1) return slides[1].offsetLeft - slides[0].offsetLeft;
        return slides[0]?.offsetWidth || 300;
      }

      maxScroll() {
        return Math.max(0, this.track.scrollWidth - this.track.clientWidth);
      }

      count() {
        return Math.max(1, Math.ceil(this.maxScroll() / this.step() - 0.05) + 1);
      }

      current() {
        const n = this.count();
        if (this.track.scrollLeft >= this.maxScroll() - 4) return n - 1;
        return Math.min(n - 1, Math.round(this.track.scrollLeft / this.step()));
      }

      goTo(i) {
        this.track.scrollTo({
          left: Math.min(i * this.step(), this.maxScroll()),
          behavior: this.reduce.matches ? 'auto' : 'smooth',
        });
      }

      build() {
        const n = this.count();
        if (this.dots.length !== n) {
          const label = this.dotsEl.dataset.label || 'Products';
          this.dotsEl.replaceChildren(
            ...Array.from({ length: n }, (_, i) => {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'ohf-rail__dot';
              b.setAttribute('aria-label', `${label}: show position ${i + 1} of ${n}`);
              b.addEventListener('click', () => this.goTo(i));
              return b;
            })
          );
          this.dots = [...this.dotsEl.children];
        }
        this.dotsEl.hidden = n < 2;
        this.sync();
      }

      sync() {
        const c = this.current();
        this.dots.forEach((b, i) => b.setAttribute('aria-current', String(i === c)));
      }

      bindDrag() {
        let start = null;
        let moved = false;
        this.track.addEventListener('dragstart', (e) => e.preventDefault());
        this.track.addEventListener('pointerdown', (e) => {
          if (e.pointerType !== 'mouse' || e.button !== 0) return;
          start = { x: e.clientX, left: this.track.scrollLeft };
          moved = false;
        });
        this.onMove = (e) => {
          if (!start) return;
          const dx = e.clientX - start.x;
          if (!moved && Math.abs(dx) > 5) {
            moved = true;
            this.track.classList.add('is-panning');
          }
          if (moved) this.track.scrollLeft = start.left - dx;
        };
        this.onUp = () => {
          if (!start) return;
          const was = moved;
          start = null;
          if (!was) return;
          this.track.classList.remove('is-panning');
          this.goTo(Math.round(this.track.scrollLeft / this.step()));
        };
        // A click that ends a drag shouldn't open the card underneath
        this.track.addEventListener(
          'click',
          (e) => {
            if (moved) {
              e.preventDefault();
              e.stopPropagation();
              moved = false;
            }
          },
          true
        );
        window.addEventListener('pointermove', this.onMove);
        window.addEventListener('pointerup', this.onUp);
      }
    }
  );
}
