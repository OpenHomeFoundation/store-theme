// Export every customer notification template from the Shopify admin.
//
// READ-ONLY: it only lists templates and reads each one's subject and code:
// Shopify's current default (for current/) and what's live (backed up to live/).
//
// Use: open https://admin.shopify.com/store/<store>/settings/notifications/customer,
// open DevTools → Console, paste this file, press Enter. It downloads
// shopify-notifications-export.json; then run
//   npm run import -- ~/Downloads/shopify-notifications-export.json
//
// These are the admin's own internal operations (the same requests the
// Notifications pages make). If Shopify changes them the snippet will report
// PERSISTED_OPERATION_NOT_FOUND — re-capture the ids from the Network tab.
(async () => {
  const store = location.pathname.split('/')[2];
  const op = (id, name, vars) =>
    `/api/operations/${id}/${name}/shopify/${store}?operationName=${name}&variables=${encodeURIComponent(JSON.stringify(vars))}`;
  const get = async (url) => {
    const res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    return json.data;
  };

  const list = (await get(op('d47d7495f6bec4845a911811c99bb04cba50c7e91ec1a93338a880e8956f93c3', 'TemplateList', {})))
    .customerNotificationSettings;

  const out = { kind: 'export', exportedAt: new Date().toISOString(), store, templates: {} };
  for (const setting of list) {
    const handle = setting.id.split('/').pop();
    const data = await get(op('e67a8ea1d2ab5083aaecae34c83947199bab14e56f3ea47cf04ba7eff39a7969', 'EmailTemplate', {
      templateId: `gid://shopify/EmailTemplate/${handle}`,
    }));
    const t = data.emailTemplate;
    if (!t) continue;
    // Once a template is customised (i.e. our branded version is saved), bodyHtml
    // is OUR code; Shopify's latest default lives in defaultVersion. current/ must
    // only ever hold Shopify's default, so take it from there, and keep the live
    // template separately as a backup.
    const defaultBody = t.hasDefaultBody ? t.bodyHtml : t.defaultVersion?.bodyHtml;
    const defaultTitle = t.hasDefaultTitle ? t.title : t.defaultVersion?.title;
    out.templates[handle] = {
      handle,
      group: setting.groupName,
      displayName: t.displayName,
      subject: defaultTitle ?? null,
      bodyHtml: defaultBody ?? null,
      hasDefaultBody: t.hasDefaultBody,
      hasDefaultTitle: t.hasDefaultTitle,
      live: { subject: t.title, bodyHtml: t.bodyHtml, updatedAt: t.updatedAt },
    };
    console.log(`${defaultBody ? '✓' : '⚠ no default available for'} ${handle}${t.hasDefaultBody ? '' : ' (customised)'}`);
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = 'shopify-notifications-export.json';
  a.click();
  console.log(`Exported ${Object.keys(out.templates).length} templates.`);
})();
