import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {marked} from 'marked';
import {renderRedesign} from './redesign.mjs';
import {checkProductionBundle} from './check_account_bundle.mjs';

const root = process.cwd();
const sourceDir = path.join(root, 'site');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--account-preview'))
  throw new Error('Usage: node scripts/build.mjs [--account-preview EXTERNAL_SOURCE_DIRECTORY]');
const previewSource = args.length ? path.resolve(args[1]) : null;
const outputDir = path.join(root, previewSource ? 'dist-preview' : 'dist');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const localeConfig = await readJson(path.join(sourceDir, 'data', 'locales.json'));
const locales = localeConfig.locales;
const localeCodes = locales.map((locale) => locale.code);
const iso = await readJson(path.join(sourceDir, 'vendor', 'iso_3166-1.json'));
const cldr = await readJson(path.join(sourceDir, 'vendor', 'cldr-territory-info.json'));
const signwritingCountries = await readJson(path.join(sourceDir, 'vendor', 'signwriting-countries.json'));
const signwritingLanguages = await readJson(path.join(sourceDir, 'vendor', 'signwriting-languages.json'));
const office = await readJson(path.join(sourceDir, 'data', 'office.json'));
const statusWeight = {official: 4, de_facto_official: 3, official_regional: 2, official_minority: 1};

function territoryLanguages(code) {
  const population = cldr.supplemental.territoryInfo[code]?.languagePopulation || {};
  const merged = new Map();
  for (const [rawCode, details] of Object.entries(population)) {
    const languageCode = rawCode.split('_')[0];
    const next = {
      code: languageCode,
      populationPercent: Number(details._populationPercent || 0),
      officialStatus: details._officialStatus || null
    };
    const previous = merged.get(languageCode);
    if (!previous || next.populationPercent > previous.populationPercent) merged.set(languageCode, next);
  }
  return [...merged.values()]
    .filter((language) => language.populationPercent >= 0.5 || language.officialStatus)
    .sort((a, b) => {
      const officialDifference = (statusWeight[b.officialStatus] || 0) - (statusWeight[a.officialStatus] || 0);
      return officialDifference || b.populationPercent - a.populationPercent;
    })
    .slice(0, 8);
}

const countries = iso['3166-1'].map((country) => {
  const code = country.alpha_2;
  const projectCountry = signwritingCountries[code] || {};
  const languages = territoryLanguages(code);
  for (const languageCode of projectCountry.language_spoken || []) {
    if (!languages.some((language) => language.code === languageCode)) {
      languages.push({code: languageCode, populationPercent: null, officialStatus: null});
    }
  }
  return {
    code,
    name: country.common_name || country.name,
    languages: languages.slice(0, 8),
    signLanguages: (projectCountry.language_signed || []).map((languageCode) => ({
      code: languageCode,
      name: signwritingLanguages[languageCode]?.name || languageCode
    }))
  };
}).sort((a, b) => a.name.localeCompare(b.name));

countries.unshift({
  code: 'WO',
  name: 'International',
  languages: localeCodes.map((code) => ({code, populationPercent: null, officialStatus: null})),
  signLanguages: []
});

const fallback = await readJson(path.join(sourceDir, 'i18n', 'en.json'));
const requiredKeys = new Set(Object.keys(fallback));
for (const contact of office.contacts) {
  requiredKeys.add('contact.' + contact.id + '.title');
  requiredKeys.add('contact.' + contact.id + '.description');
}
for (const bot of office.bots) {
  if (!bot.name || !bot.title || !bot.initials) throw new Error('Incomplete bot identity: ' + bot.id);
}
for (const department of office.departments) {
  requiredKeys.add('department.' + department.id + '.title');
  requiredKeys.add('department.' + department.id + '.description');
}
for (const campaign of office.campaigns) {
  requiredKeys.add('campaign.' + campaign.id + '.title');
  requiredKeys.add('campaign.' + campaign.id + '.description');
}
for (const resource of office.resources) {
  requiredKeys.add('resource.' + resource.id + '.title');
  requiredKeys.add('resource.' + resource.id + '.description');
}
const localeIds = new Set();
const localeAliases = new Set();
for (const locale of locales) {
  if (localeIds.has(locale.code)) throw new Error('Duplicate locale code: ' + locale.code);
  localeIds.add(locale.code);
  if (!['ltr', 'rtl'].includes(locale.dir)) throw new Error('Invalid text direction: ' + locale.code);
  if (!locale.spokenCodes?.length) throw new Error('Locale needs spokenCodes: ' + locale.code);
  for (const alias of locale.aliases || []) {
    const normalized = alias.toLowerCase();
    if (localeAliases.has(normalized)) throw new Error('Duplicate locale alias: ' + alias);
    localeAliases.add(normalized);
  }
  for (const country of locale.suggestedCountries || []) {
    if (!/^[A-Z]{2}$/.test(country)) throw new Error('Invalid suggested country for ' + locale.code + ': ' + country);
  }
  const translations = await readJson(path.join(sourceDir, locale.catalog));
  const missing = [...requiredKeys].filter((key) => !translations[key]);
  const extra = Object.keys(translations).filter((key) => !requiredKeys.has(key));
  if (missing.length || extra.length) {
    throw new Error(locale.code + ' translation mismatch. Missing: ' + missing.join(', ') + '. Extra: ' + extra.join(', '));
  }
  for (const key of requiredKeys) {
    const sourcePlaceholders = [...fallback[key].matchAll(/\{[a-zA-Z][a-zA-Z0-9]*\}/g)].map((match) => match[0]).sort();
    const translatedPlaceholders = [...translations[key].matchAll(/\{[a-zA-Z][a-zA-Z0-9]*\}/g)].map((match) => match[0]).sort();
    if (sourcePlaceholders.join('|') !== translatedPlaceholders.join('|')) {
      throw new Error(locale.code + ' placeholder mismatch for ' + key);
    }
  }
}
if (!localeIds.has(localeConfig.defaultLocale)) throw new Error('Unknown default locale');

const botIds = new Set(office.bots.map((bot) => bot.id));
const departmentIds = new Set(office.departments.map((department) => department.id));
const campaignIds = new Set(office.campaigns.map((campaign) => campaign.id));
for (const department of office.departments) {
  if (!botIds.has(department.head)) throw new Error('Unknown department head: ' + department.head);
  for (const campaign of department.campaigns) {
    if (!campaignIds.has(campaign)) throw new Error('Unknown campaign: ' + campaign);
  }
}
for (const bot of office.bots) {
  if (bot.headOf && !departmentIds.has(bot.headOf)) throw new Error('Unknown home department: ' + bot.headOf);
  for (const membership of bot.memberOf) {
    if (!departmentIds.has(membership)) throw new Error('Unknown bot membership: ' + membership);
  }
  if (bot.image) await readFile(path.join(sourceDir, bot.image));
}

await rm(outputDir, {recursive: true, force: true});
await mkdir(outputDir, {recursive: true});
await cp(sourceDir, outputDir, {
  recursive: true,
  filter(source) {
    const relative = path.relative(sourceDir, source);
    return relative !== 'vendor'
      && relative !== 'README.md'
      && relative !== path.join('assets', 'front-office-ensemble.png');
  }
});
await writeFile(path.join(outputDir, 'data', 'countries.json'), JSON.stringify(countries), 'utf8');
await writeFile(path.join(outputDir, 'account-build.json'), JSON.stringify({mode: previewSource ? 'preview' : 'production'}));
if (previewSource) {
  await mkdir(path.join(outputDir, 'preview'), {recursive: true});
  for (const file of ['provider.js', 'styles.css'])
    await cp(path.join(previewSource, file), path.join(outputDir, 'preview', file));
  await writeFile(path.join(outputDir, 'account-provider.js'), "export {createAccountProvider} from './preview/provider.js';\n");
} else {
  await writeFile(path.join(outputDir, 'account-provider.js'), "export {createAccountProvider} from './account-unavailable.js';\n");
}

const modelMarkdown = await readFile(path.join(sourceDir, 'office-model.md'), 'utf8');
const modelRevision = createHash('sha256').update(modelMarkdown).digest('hex').slice(0, 12);
const modelBody = await marked.parse(modelMarkdown.replace(/^# .+\n+/, ''));
const modelHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="A public explanation of how the Sutton SignWriting Front and Back Offices work together.">
<link rel="canonical" href="https://office.signwriting.org/office-model.html"><link rel="stylesheet" href="office-model.css">
<title>How the Sutton SignWriting Office works</title></head><body>
<div class="print-document-header" aria-hidden="true"><strong>Sutton SignWriting Office</strong><span>https://office.signwriting.org/office-model.html · Reviewed 2026-09-07</span></div>
<header class="model-header"><a class="brand" href="./">Sutton SignWriting Office</a><a class="back-link" href="./">Back to the Office</a></header>
<main class="model-main"><header class="hero"><p class="eyebrow">Public Office model · Reviewed 2026-09-07</p><h1>How the Office works</h1><p class="lede">One human-directed path from research and design to implementation, verification, and deliberate publication.</p>
<div class="actions"><a class="button primary" href="office-model.md">Markdown source</a><button class="button" type="button" data-print>Print / Save PDF</button><a class="button" href="downloads/office-model.pdf">Download PDF</a></div></header>
<article class="markdown-body">${modelBody}</article></main>
<footer class="model-footer"><span>Public method only; private operational detail stays private.</span><span>Reviewed 2026-09-07 · Source ${modelRevision}</span></footer>
<script src="office-model.js" defer></script></body></html>\n`;
for (const pattern of [/192\.168\./, /127\.0\.0\.1/, /\/home\//, /oauth_token/i, /BEGIN [A-Z ]*PRIVATE KEY/]) {
  if (pattern.test(modelMarkdown + modelHtml)) throw new Error(`Prohibited public Office-model content matched ${pattern}`);
}
await writeFile(path.join(outputDir, 'office-model.html'), modelHtml);
try { await cp(path.join(root, 'downloads'), path.join(outputDir, 'downloads'), {recursive: true}); } catch {}

const revisionHash = createHash('sha256');
for (const file of [
  'app.js',
  'index.html',
  'data/publications.json',
  'account.js',
  'account-unavailable.js',
  'account-callback.js',
  'auth/callback/index.html',
  'styles.css',
  'data/office.json',
  'data/locales.json',
  ...locales.map((locale) => locale.catalog),
  ...office.bots.map((bot) => bot.image).filter(Boolean),
  'office-model.md',
  'office-model.css',
  'office-model.js'
]) {
  revisionHash.update(await readFile(path.join(sourceDir, file)));
}
revisionHash.update(JSON.stringify(countries));
const revision = revisionHash.digest('hex').slice(0, 12);

const redesign = await renderRedesign(sourceDir, office);
const indexPath = path.join(outputDir, 'index.html');
let index = (await readFile(indexPath, 'utf8'))
  .replace('<!-- STEWARDS -->', redesign.stewards)
  .replace('<!-- WORK -->', redesign.work)
  .replace('<!-- PUBLICATIONS -->', redesign.publications)
  .replace('href="styles.css"', 'href="styles.css?v=' + revision + '"')
  .replace('src="app.js"', 'src="app.js?v=' + revision + '"');
if (previewSource) index = index.replace('</head>', '<link rel="stylesheet" href="preview/styles.css"></head>');
await writeFile(indexPath, index);

const localAssets = [...index.matchAll(/(?:href|src)="([^"#]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !reference.includes(':'));
for (const reference of localAssets) await readFile(path.join(outputDir, reference.split('?')[0]));

if (!previewSource) await checkProductionBundle(outputDir);

console.log('Built ' + (previewSource ? 'local preview' : 'public') + ' office ' + revision + ': ' + countries.length + ' locations, ' + localeCodes.length + ' complete interface languages, ' + office.bots.length + ' bots, ' + office.departments.length + ' departments.');
