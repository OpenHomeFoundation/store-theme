/*
 * Card colour swatches.
 *
 * Hovering or focusing a colour swatch on a product card shows that colour's variant
 * image over the card image.
 *
 * Images are never loaded up front. Liquid emits one srcset per colour (deduplicated
 * by colour, not by variant) as a data attribute, and the src is only assigned the
 * first time a shopper actually hovers that swatch. A 50-product collection page
 * therefore costs zero extra requests until someone explores a card, then at most one
 * request per colour they touch — the browser cache covers every hover after that.
 */
class CardColorSwatches extends HTMLElement {
  connectedCallback() {
    this.card = this.closest('.card-wrapper');
    this.preview = this.card && this.card.querySelector('[data-color-preview]');
    if (!this.preview) return;

    this.cardLink = this.card.querySelector('.card__heading a');
    this.defaultHref = this.cardLink && this.cardLink.getAttribute('href');
    this.activeSrcset = null;

    this.onPointerOver = this.onPointerOver.bind(this);
    this.onFocusIn = this.onFocusIn.bind(this);
    this.onFocusOut = this.onFocusOut.bind(this);
    this.reset = this.reset.bind(this);

    this.addEventListener('focusin', this.onFocusIn);
    this.addEventListener('focusout', this.onFocusOut);

    // On touch there is no hover: tapping a swatch just follows its link to that variant.
    if (!window.matchMedia('(hover: hover)').matches) return;

    this.addEventListener('pointerover', this.onPointerOver);
    // Leave the preview up while the pointer is anywhere on the card, so moving from a
    // swatch onto the image doesn't snap back to the default colour mid-gesture.
    this.card.addEventListener('pointerleave', this.reset);
  }

  disconnectedCallback() {
    if (this.card) this.card.removeEventListener('pointerleave', this.reset);
  }

  onPointerOver(event) {
    const swatch = event.target.closest('.card__swatch');
    if (swatch) this.show(swatch);
  }

  onFocusIn(event) {
    const swatch = event.target.closest('.card__swatch');
    if (swatch) this.show(swatch);
  }

  onFocusOut(event) {
    // Tabbing between swatches in the same row shouldn't flash the default image.
    if (!this.contains(event.relatedTarget)) this.reset();
  }

  async show(swatch) {
    const srcset = swatch.dataset.previewSrcset;

    // No srcset means this colour is the image the card is already showing.
    if (!srcset) {
      this.reset();
      this.setCardLink(swatch.getAttribute('href'));
      return;
    }

    this.setCardLink(swatch.getAttribute('href'));
    if (this.activeSrcset === srcset) {
      this.preview.classList.add('is-active');
      return;
    }
    this.activeSrcset = srcset;

    // Keep showing the current image until the new one is ready, so a cold hover
    // fades in rather than flashing an empty frame.
    this.preview.srcset = srcset;
    this.preview.src = swatch.dataset.previewSrc;

    try {
      await this.preview.decode();
    } catch (error) {
      return;
    }

    // The pointer may have moved on to another swatch while that was decoding.
    if (this.activeSrcset !== srcset) return;
    this.preview.classList.add('is-active');
  }

  reset() {
    this.activeSrcset = null;
    this.preview.classList.remove('is-active');
    this.setCardLink(this.defaultHref);
  }

  setCardLink(href) {
    if (this.cardLink && href) this.cardLink.setAttribute('href', href);
  }
}

customElements.define('card-color-swatches', CardColorSwatches);
