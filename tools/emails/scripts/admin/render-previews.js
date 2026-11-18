// Render "current" (Shopify's saved template) and "new" (dist/_bundle.json)
// for every template in the bundle, using the admin's own preview renderer —
// the same one behind the Preview button in the notification editor. Both
// sides get Shopify's real Liquid engine, CSS inlining and sample order data.
//
// SAVES NOTHING: it only calls emailTemplateGeneratePreview, which renders
// unsaved code. It never calls the template update (save) mutation.
//
// Use: npm run build, then open any page under https://admin.shopify.com/store/<store>/,
// open DevTools → Console, paste this file, press Enter, click the
// "Choose _bundle.json" button that appears and pick dist/_bundle.json.
// It downloads shopify-notification-renders.json; then run
//   npm run import -- ~/Downloads/shopify-notification-renders.json
(async () => {
  const store = location.pathname.split('/')[2];
  const pageScripts = [...document.scripts].map((s) => s.textContent).join('\n');
  const csrf = (pageScripts.match(/"csrfToken"\s*:\s*"([^"]+)"/) || [])[1];
  if (!csrf) throw new Error('No CSRF token on this page — reload an admin page and try again.');

  const get = async (id, name, vars) => {
    const url = `/api/operations/${id}/${name}/shopify/${store}?operationName=${name}&variables=${encodeURIComponent(JSON.stringify(vars))}`;
    return (await (await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } })).json()).data;
  };

  const preview = async (handle, title, bodyHtml) => {
    const res = await fetch(
      `/api/operations/cae18b90de6bfab810dad98c40afcb84563c47a8e72a083a884aea180c104031/EmailTemplateGeneratePreview/shopify/${store}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': csrf, 'x-shopify-web': '1' },
        body: JSON.stringify({
          operationName: 'EmailTemplateGeneratePreview',
          variables: { input: { emailTemplateId: `gid://shopify/EmailTemplate/${handle}`, title, bodyHtml, includeHtml: true } },
        }),
      },
    );
    const json = await res.json();
    if (json.errors?.length) throw new Error(`${handle}: ${json.errors.map((e) => e.message).join('; ')}`);
    const r = json.data.emailTemplateGeneratePreview;
    return { subject: r.preview?.subject ?? '', bodyHtml: r.preview?.bodyHtml ?? '', userErrors: r.userErrors ?? [] };
  };

  const bundle = window.__bundle ?? (await new Promise((resolve) => {
    const button = document.createElement('button');
    button.textContent = 'Choose _bundle.json';
    Object.assign(button.style, { position: 'fixed', top: '16px', right: '16px', zIndex: 99999, padding: '12px 16px', font: '600 14px system-ui' });
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json' });
    input.onchange = async () => { button.remove(); resolve(JSON.parse(await input.files[0].text())); };
    button.onclick = () => input.click();
    document.body.append(button);
  }));

  const out = { kind: 'renders', renderedAt: new Date().toISOString(), store, templates: {} };
  for (const [handle, built] of Object.entries(bundle.templates)) {
    const saved = (await get('e67a8ea1d2ab5083aaecae34c83947199bab14e56f3ea47cf04ba7eff39a7969', 'EmailTemplate', {
      templateId: `gid://shopify/EmailTemplate/${handle}`,
    })).emailTemplate;
    out.templates[handle] = {
      current: await preview(handle, saved.title, saved.bodyHtml),
      new: await preview(handle, built.subject, built.bodyHtml),
    };
    const errs = [...out.templates[handle].current.userErrors, ...out.templates[handle].new.userErrors];
    console.log(`${errs.length ? '⚠' : '✓'} ${handle}${errs.length ? ` — ${errs.map((e) => e.message).join('; ')}` : ''}`);
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = 'shopify-notification-renders.json';
  a.click();
  console.log(`Rendered ${Object.keys(out.templates).length} templates.`);
})();
