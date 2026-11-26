/*
 * "Lights off" switch (redesign 2026).
 * Any button with [data-lights-toggle] flips <html data-lights="off">. The choice is remembered in
 * this browser (localStorage "ohf-lights") and applied before paint by snippets/ohf-lights-init.liquid.
 * Buttons get aria-pressed (true = lights off) and an aria-label naming what a click will do.
 * Dispatches "ohf:lights" on document with { detail: { off } } for sections that need to react.
 */
(function () {
  const root = document.documentElement;
  const isOff = () => root.getAttribute('data-lights') === 'off';

  function sync() {
    const off = isOff();
    document.querySelectorAll('[data-lights-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(off));
      btn.setAttribute('aria-label', off ? btn.dataset.labelOn || 'Turn the lights on' : btn.dataset.labelOff || 'Turn the lights off');
    });
  }

  function set(off) {
    if (off) root.setAttribute('data-lights', 'off');
    else root.removeAttribute('data-lights');
    try {
      localStorage.setItem('ohf-lights', off ? 'off' : 'on');
    } catch (e) {}
    sync();
    document.dispatchEvent(new CustomEvent('ohf:lights', { detail: { off } }));
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-lights-toggle]');
    if (btn) set(!isOff());
  });

  // Section re-renders in the theme editor bring in fresh buttons
  document.addEventListener('shopify:section:load', sync);
  sync();
})();
