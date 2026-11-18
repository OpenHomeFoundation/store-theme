# Store emails

OHF-branded Shopify notification emails. This folder lives in the theme repo for version control only. Shopify's theme sync ignores `tools/`, and notifications are never deployed from git: each built template is pasted into **Settings → Notifications**.

## Approach: reskin Shopify's defaults

Shopify's default notification templates contain a lot of logic: split deliveries, bundles, subscriptions, local pickup, duties, RTL languages, and the terms and refund policy attached as PDFs. Rather than re-implement all of that, the build takes each default unchanged and changes only four things:

1. It removes the accent-colour `<style>` block (driven by **Customize email templates**).
2. It puts the OHF logo in the header's shop-name slot.
3. It tags the cell holding the order totals (`subtotal-content`), so the stylesheet can size it: right-aligned at 60% on desktop, full width on mobile. Without this, the Gmail app shrinks the totals tables to their content and the amounts don't line up.
4. It adds `src/brand.css` as the last thing in `<head>`.

`src/brand.css` changes colour, type weight, the buttons and the header. Apart from the totals width above, it doesn't change layout. Shopify's spacing and responsive rules are what has been proven in the Gmail and Outlook apps, including their forced dark modes. Earlier versions that restyled layout (a card on a tinted background, totals row lines, custom padding) looked right in browsers but broke in the Gmail app.

Shopify inlines its own base stylesheet plus ours at send time, so the brand rules win the cascade. Every anchor must match exactly once, so if Shopify changes a default upstream, the build fails instead of shipping a half-branded email.

```
current/<handle>/template.liquid   Shopify's default template (exported from the admin, committed)
current/<handle>/meta.json         subject, group, and whether it's still Shopify's default
src/brand.css                      the brand layer, written against Shopify's own class names
src/logo.liquid, src/head.html     header logo markup and head additions
brand.config.json                  colours and logo; referenced as [[color.brand]] and so on
emails.config.json                 which notifications get the brand (24 of 47)
dist/<handle>.liquid               build output: paste this into Shopify
```

## Everyday use

```bash
cd tools/emails
npm install
npm run build                      # current/ → dist/
npm run copy order_confirmation    # copies dist/order_confirmation.liquid to the clipboard
```

To ship a template, go to **Settings → Notifications → (notification) → Edit code**, paste over the body, then **Preview**, **Send test email** and **Save**. Subjects are left as Shopify's defaults.

## Comparing current and new

```bash
npm run compare        # compare/index.html: every email side by side, desktop or mobile
npm run compare:png    # also compare/png/<handle>.png and <handle>-mobile.png (uses your Google Chrome)
```

Both sides come from Shopify's own preview renderer, the one behind the editor's Preview button, so they get the same sample order and the real Liquid engine and CSS inliner. To refresh them after changing `src/brand.css`:

1. Run `npm run build`.
2. In the Shopify admin, open DevTools → Console, paste `scripts/admin/render-previews.js`, click **Choose _bundle.json** and pick `dist/_bundle.json`.
3. Run `npm run import -- ~/Downloads/shopify-notification-renders.json`, then `npm run compare`.

The snippet only calls the preview renderer and never saves. Shopify's renderer ignores edited code for six templates (the five return emails and Payment error), so for those the comparison applies the brand CSS to Shopify's render in the browser and labels it approximate. Check them with a real test email.

## When Shopify updates its defaults

Once a notification is customised, Shopify stops updating it automatically. Shopify's help centre says so for default versus customised templates, and occasionally publishes code for merchants to add by hand, as it did for duties and Shopify Tax. Shopify still tracks its latest default for every template (`defaultVersion`), so the rebrand can simply be rebuilt on top of it. Every month or so, and whenever Shopify announces a notification change:

1. In the admin, open Settings → Notifications → Customer notifications, then DevTools → Console, and paste `scripts/admin/export-notifications.js`. It's read-only.
2. Run `npm run import -- ~/Downloads/shopify-notifications-export.json`. This writes Shopify's defaults to `current/` and backs up what's live to `live/`. It also warns if a live template no longer matches `dist/`, which means it was edited in the admin or needs re-pasting.
3. Run `git diff current/` to see exactly what Shopify changed.
4. Run `npm run build`. It fails loudly if a change moved anything the rebrand relies on.
5. Re-paste the changed templates (`npm run copy <handle>`), then preview, send a test and save.

The admin snippets use Shopify's internal admin operations, which aren't a public API. If Shopify changes them, the snippets report an error and the ids need re-capturing from the Network tab.

## Backups and rollback

- **`current/`:** Shopify's default code for all 47 notifications, as of the last export.
- **`live/`:** exactly what was live on the store at the last export, including any admin edits.
- **`dist/`:** what the build produces, and what should be live for the 24 branded templates.
- **In Shopify:** each notification's editor has **Revert to → Previous** (the version before the last save) and **Revert to → Default** (Shopify's current default). Either undoes a bad paste instantly.

## Logo

The email logo is the OHF colour lockup from the [Brand Assets API](https://brands.openhomefoundation.org/api/), baked onto a white rounded plate (`assets/brand/ohf-lockup-email@2x.png`, hosted in Shopify → Content → Files, URL in `brand.config.json` → `logo.src`). On the white page the plate is invisible, and the template offsets it so the logo lines up with the text. In Gmail's and Outlook's forced dark modes, which repaint the email but never touch images, it shows as a white badge instead of losing its dark-ink "FOUNDATION" and house base.

To regenerate it (for example after a brand update), run `npm run assets`, upload the PNG to Files and update `logo.src`.

## Notes

- **Dark mode:** the emails declare light only (`color-scheme: light`), so Apple Mail, Gmail on the web and Yahoo show them as designed. Gmail's apps and Outlook repaint them anyway, so the design is built to survive that: Shopify's flat white layout (a tinted canvas, card or border-based padding turns into grey frames there), the plated logo, and buttons with white text on `#0A77A8`, which Gmail leaves alone.
- **Product photos in Gmail on Android:** in dark mode, Gmail's Android app inverts photos it reads as graphics, such as black or white garments on white backgrounds, so a black hoodie shows as white. Shopify's untouched templates do the same. Declaring `color-scheme: light dark` doesn't stop it (tested November 2026), and there's no supported way to opt an image out. Product shots on tinted backgrounds are the only mitigation.
- **Dark-mode logo swap:** tried and dropped (November 2026). Swapping to a light-on-dark logo with `@media (prefers-color-scheme: dark)` only works in Apple Mail and Outlook for Mac and iOS. The Gmail apps ignore it and repaint the email themselves, and Shopify strips Outlook.com's `[data-ogsc]` selectors at send time. The plated logo is the one version that works everywhere.
- **Buttons:** white on the deeper brand blue `#0A77A8` (4.98:1, WCAG AA). Ink on `#18BCF2` reads well in light mode, but Gmail's dark mode flips the ink to white and leaves the light blue, which fails contrast. The Shop Pay button keeps Shop's own colours.
- **Customize email templates:** the logo and accent colour set on that admin page no longer affect branded templates.
