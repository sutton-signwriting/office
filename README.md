# Sutton SignWriting Office

This is the canonical source for the public, read-only Sutton SignWriting Office at
https://office.signwriting.org/. Private operating details and platform development belong outside
this public publication repository.

## Local build and preview

Run `npm ci` once, then `npm run build` to validate the data, translations, local assets, and generated country
manifest. The static publication is written to `dist/`.

The public Office model is maintained in `site/office-model.md`. Its generated page provides the
Markdown source, browser print, and a downloadable PDF. Run `npm run build:pdf` when the model
changes so the reviewed HTML, Markdown, and PDF editions remain aligned.

The Docker Compose service publishes the same static build on port 7040 for LAN review.

After the service is running, run:

```bash
node scripts/test_state.mjs http://127.0.0.1:7040/
```

The test drives the country and language selects
in an isolated Chromium profile. It verifies German selection, refresh persistence, resetting to
English and International, reset persistence, invalid URL fallback, translated Advancement copy,
the country control's placement in the local starting point, the selected flag, and the
bot email action. It also checks the Research contact and department route and all twelve avatar
records. The temporary browser profile is removed after the run.

## Bot avatars

Bot records include initials and an `image` path. The current twelve-image WebP set is stored in
`site/assets/avatars/`. This public repository contains approved publication assets. Initials
remain the resilient public fallback.

## GitHub Pages publishing

A push to `main` runs `.github/workflows/pages.yml`. The workflow validates and builds the site,
uploads `dist/` as the Pages artifact, and deploys it through the protected `github-pages`
environment. No repository secret or generated branch is required.

The repository Pages setting owns the custom domain. DNS must provide a specific `office` CNAME to
`sutton-signwriting.github.io.`; that record overrides the existing wildcard. Enable enforced HTTPS
after GitHub provisions the certificate.

## Launch checklist

- Provision and test every address listed in site/data/office.json.
- Confirm that help@signwriting.org receives language requests and translation corrections.
- Review the translated copy with fluent community members.
- Confirm every bot avatar remains suitable for public use after any replacement.
- Review each active campaign and its owner before announcing the site.
- Confirm the Pages custom domain is `office.signwriting.org` and HTTPS is enforced.

Country choice is not language choice. The interface suggests spoken languages using Unicode CLDR,
shows sign languages from the curated Sutton SignWriting world snapshot, and always leaves the
final site-language choice to the visitor. International is the neutral starting point for work
between countries and on shared infrastructure; it is not treated as a country. See [the translation guide](site/TRANSLATION.md) for the reusable locale-manifest, catalog-validation, fallback, and human-review model.

Pre-registration is deliberately separate from authenticated application membership. The planned
flow is register email interest, invitation from register.signwriting.org, one-time key redemption,
then revocable app and API credentials. Never use the emailed invitation key as a permanent API
secret.
