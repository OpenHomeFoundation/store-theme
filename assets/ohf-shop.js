/*
 * OHF shop grid behaviour (redesign 2026), shared by the Shop page and search results.
 */
(function () {
  // Sort: Shopify sorts on the server; changing the select reloads with ?sort_by=… (back to page 1)
  document.addEventListener('change', (e) => {
    const select = e.target.closest('[data-ohf-sort]');
    if (!select) return;
    const url = new URL(window.location.href);
    url.searchParams.set('sort_by', select.value);
    url.searchParams.delete('page');
    window.location.href = url.toString();
  });
})();
