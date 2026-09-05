# Translation model

This Office is the small reference implementation for translation in the larger Sutton
SignWriting project. The model separates product support, language suggestion, translated
messages, and human review.

## Coverage rule

A spoken language becomes a translation candidate when public evidence shows SignWriting use in
a community that the language can reasonably reach. Evidence may connect the language directly,
or it may combine documented SignWriting use in a country or region with credible spoken-language
data for that place. The amount of documented use does not set a minimum. A language may be
deferred only when there is a reasonable expectation that translation work would produce no
practical return, and that exception should record its evidence, reason, owner, and review date.

Country-to-sign-language association data is not evidence of actual SignWriting use by itself.
Use evidence can come from the official country list, a country archive, a publication, teaching
material, a SignWriting Symposium presentation, an active project, or a direct community request.
Current activity should be worked before archival evidence, but both qualify.

Starting evidence sources:

- [Where SignWriting is used](https://m.signwriting.org/learning-faq-09.html), the official
  51-country list;
- [SignWriting Symposium](https://www.signwriting.org/symposium/), the official archive of
  projects, presentations, authors, and countries.

Coverage has three independent states:

- candidate: documented use exists and translation is owed;
- supported: a complete catalog builds and is available in the interface;
- reviewed: a fluent community reviewer has approved the wording.

Supported does not mean reviewed. The interface may publish a complete working translation while
clearly keeping the correction route open. It must not present a partly translated catalog as
complete.

## Files and authority

- data/locales.json is the only list of supported interface locales.
- i18n/en.json is the source catalog and defines the complete key set.
- Every other i18n catalog must contain exactly the same keys and placeholders.
- Country and spoken-language suggestions do not determine interface language.
- Sign-language associations are separate project data, not interface locales.

The application reads the locale manifest. The build reads the same manifest and fails when a
catalog is missing keys, has extra keys, changes a placeholder, repeats a locale code, or declares
an invalid text direction.

## Locale records

Each record contains:

- code: the stable internal identifier and catalog key;
- bcp47: the standards-based HTML and formatting tag;
- english and native: readable names for maintainers and visitors;
- dir: left-to-right or right-to-left layout;
- spokenCodes: language codes that can suggest this interface locale;
- aliases: optional legacy or compatibility identifiers accepted on input;
- suggestedCountries: optional country codes that select among regional variants;
- catalog: the public message-catalog path;
- reviewStatus: source or needs-community-review.

The code and BCP 47 tag are separate so a stable product identifier can point to a specific
writing-system or regional choice. Brazilian Portuguese (`pt-BR`) and European Portuguese
(`pt-PT`) use separate complete catalogs. The legacy `pt` identifier is an alias for `pt-BR`, while
country suggestions route Brazil to `pt-BR` and Portugal and other listed Lusophone regions to
`pt-PT`. Country choice still never changes the interface without visitor action.

## Adding a locale

1. Add one record to data/locales.json.
2. Copy the English catalog to the declared catalog path.
3. Translate values without changing keys, placeholders, email addresses, or service hostnames.
4. Run `node scripts/build.mjs`. A supported locale is not allowed to publish with missing messages.
5. Test a narrow mobile viewport, a desktop viewport, long labels, and text direction.
6. Set reviewStatus after a fluent community reviewer approves it.

English remains the emergency runtime fallback if a file cannot load, but fallback is not a
substitute for completing a supported catalog.

## Content workflow

Stable message keys belong to meaning, not page position. Office records refer to those keys by
stable IDs, so names, departments, and campaigns can move without invalidating translations.
Source copy changes first in English, then all supported catalogs change in the same revision.

Visitors can report missing languages or translation problems through support@signwriting.org.
Corrections should record the locale, message key, proposed wording, reviewer, and review date.
