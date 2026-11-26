/*
 * Shared entrance motion (redesign 2026).
 * - .ohf-reveal: fades and rises in once it scrolls into view.
 * - .ohf-rise: a heading whose words rise in line by line. Words are wrapped in masks here;
 *   words on the same line share a delay (--l), so lines arrive one after another.
 * With reduced motion turned on, everything is shown straight away.
 * Re-runs for sections added or reloaded in the theme editor.
 */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function splitWords(heading) {
    if (heading.dataset.riseReady) return;
    heading.dataset.riseReady = 'true';
    const text = heading.textContent.trim().split(/\s+/);
    heading.setAttribute('aria-label', text.join(' '));
    heading.textContent = '';
    text.forEach((word, i) => {
      const mask = document.createElement('span');
      mask.className = 'rw';
      mask.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.className = 'rw__in';
      inner.textContent = word;
      mask.appendChild(inner);
      heading.appendChild(mask);
      if (i < text.length - 1) heading.appendChild(document.createTextNode(' '));
    });
    // Line index per word, from where each one wrapped
    let line = -1;
    let top = null;
    heading.querySelectorAll('.rw').forEach((mask) => {
      if (mask.offsetTop !== top) {
        top = mask.offsetTop;
        line += 1;
      }
      mask.style.setProperty('--l', line);
    });
  }

  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add('is-in');
              observer.unobserve(entry.target);
            });
          },
          { rootMargin: '0px 0px -10% 0px' }
        )
      : null;

  function init(scope) {
    const items = scope.querySelectorAll('.ohf-reveal, .ohf-rise');
    items.forEach((el) => {
      if (el.classList.contains('ohf-rise') && !reduce.matches) splitWords(el);
      if (reduce.matches || !observer) el.classList.add('is-in');
      else observer.observe(el);
    });
  }

  init(document);
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
