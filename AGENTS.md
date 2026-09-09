# Sutton SignWriting Office Guidance

## Purpose

Maintain the public, read-only Sutton SignWriting Office website. This repository contains only
material approved for public release and publishes the static site at `office.signwriting.org`.
Private Grok workspace details, infrastructure planning, and Archie operations belong elsewhere.

## Publication boundary

- Treat every tracked file and GitHub Actions artifact as public.
- Never add credentials, private correspondence, unpublished development details, local hostnames,
  LAN addresses, raw agent transcripts, or private Front Office material.
- Use only approved images, translations, contact routes, campaigns, and public references.
- Keep the site static, informational, and read-only unless Steve explicitly approves a broader
  product change and its privacy and security design.
- Public claims should identify an authoritative source or a human-approved office decision.

## Editing

- Edit authoritative files under `site/`; do not hand-edit generated `dist/` output.
- Keep locale catalogs structurally aligned with `site/i18n/en.json`.
- Preserve the canonical URL `https://office.signwriting.org/` in metadata, robots, and sitemap.
- Keep asset paths relative so both the custom domain and local port 7040 preview work.
- Changes to contacts, bot roles, departments, or campaigns require human review before publishing.

## Verification

Run `node scripts/build.mjs`, `docker compose config --quiet`, and the local container build. After
starting the preview, check `/health`, load the page at desktop and mobile widths, and run
`node scripts/test_state.mjs http://127.0.0.1:7040/` when Chromium is available. Verify the
GitHub Pages workflow and custom-domain status after publication.
