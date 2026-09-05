const iconByName = {hello: '◎', spark: '✦', help: '?', lens: '⌕', records: '▤', people: '◌', bridge: '⌁'};
const storageKeys = {country: 'sgnw_office_country', language: 'sgnw_office_language'};
const assetRevision = new URL(import.meta.url).searchParams.get('v');

let supportedLocales = [];
let defaultLanguage = 'en';
let office;
let countries;
let fallbackMessages;
let messages;
let languageRequest = 0;
const missingKeys = new Set();

const url = new URL(window.location.href);
const requestedLanguage = url.searchParams.get('lang');
const storedLanguage = localStorage.getItem(storageKeys.language);
const requestedCountry = url.searchParams.get('country');
const storedCountry = localStorage.getItem(storageKeys.country);
const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
let currentLanguage;
let currentCountry;

function matchLanguage(code) {
  const normalized = String(code || '').replaceAll('_', '-').toLowerCase();
  if (!normalized) return null;
  const exact = supportedLocales.find((locale) =>
    locale.code.toLowerCase() === normalized
    || locale.bcp47.toLowerCase() === normalized
    || locale.aliases?.some((alias) => alias.toLowerCase() === normalized)
  );
  if (exact) return exact.code;
  const base = normalized.split('-')[0];
  const region = normalized.split('-').slice(1).find((part) => /^[a-z]{2}$/.test(part))?.toUpperCase();
  const compatible = supportedLocales.filter((locale) =>
    locale.bcp47.toLowerCase().split('-')[0] === base
    || locale.spokenCodes.includes(base)
  );
  return compatible.find((locale) => region && locale.suggestedCountries?.includes(region))?.code
    || compatible[0]?.code
    || null;
}

function chooseLanguage(code) {
  return matchLanguage(code) || defaultLanguage;
}

function initialLanguage() {
  for (const candidate of [requestedLanguage, storedLanguage, ...browserLanguages]) {
    const match = matchLanguage(candidate);
    if (match) return match;
  }
  return defaultLanguage;
}

function initialCountry() {
  for (const candidate of [requestedCountry, storedCountry, 'WO']) {
    const normalized = String(candidate || '').toUpperCase();
    if (countries.some((country) => country.code === normalized)) return normalized;
  }
  return 'WO';
}

function versionedUrl(resource) {
  const resourceUrl = new URL(resource, window.location.href);
  if (assetRevision) resourceUrl.searchParams.set('v', assetRevision);
  return resourceUrl;
}

async function fetchJson(resource) {
  const response = await fetch(versionedUrl(resource), {cache: 'no-cache'});
  if (!response.ok) throw new Error('Unable to load ' + resource + ': HTTP ' + response.status);
  return response.json();
}

async function loadMessages(code) {
  if (code === defaultLanguage) return fallbackMessages;
  return fetchJson(localeFor(code).catalog);
}

function localeFor(code) {
  return supportedLocales.find((locale) => locale.code === code)
    || supportedLocales.find((locale) => locale.code === defaultLanguage);
}

function t(key, values = {}) {
  let value = messages?.[key] ?? fallbackMessages?.[key];
  if (value === undefined) {
    if (!missingKeys.has(key)) console.error('Missing translation key:', key);
    missingKeys.add(key);
    return '';
  }
  for (const [name, replacement] of Object.entries(values)) {
    value = value.replaceAll('{' + name + '}', replacement);
  }
  return value;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function flagEmoji(code) {
  if (code === 'WO') return '🌐';
  return code.toUpperCase().split('').map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
}

function countryName(country) {
  if (country.code === 'WO') return t('context.international');
  try {
    return new Intl.DisplayNames([currentLanguage], {type: 'region'}).of(country.code) || country.name;
  } catch {
    return country.name;
  }
}

function languageName(code) {
  try {
    return new Intl.DisplayNames([currentLanguage], {type: 'language'}).of(code) || code;
  } catch {
    return code;
  }
}

function selectedCountry() {
  return countries.find((country) => country.code === currentCountry) || countries[0];
}

function mailtoHref(email, topic) {
  const country = selectedCountry();
  const subject = t('mail.subject', {topic});
  const body = t('mail.body', {
    country: countryName(country),
    countryCode: country.code,
    language: languageName(currentLanguage),
    languageCode: currentLanguage
  });
  return 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}

function updateDocumentLanguage() {
  const locale = localeFor(currentLanguage);
  document.documentElement.lang = locale.bcp47;
  document.documentElement.dir = locale.dir;
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]').setAttribute('content', t('meta.description'));
}

function translateStaticContent() {
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelector('.brand').setAttribute('aria-label', t('a11y.home'));
  document.querySelector('.desktop-nav').setAttribute('aria-label', t('a11y.primaryNav'));
  document.querySelector('.mobile-nav').setAttribute('aria-label', t('a11y.mobileNav'));
}

function renderLanguageSelect() {
  const select = document.querySelector('#language-select');
  select.replaceChildren();
  supportedLocales.forEach((locale) => {
    const option = element('option', '', locale.native);
    option.value = locale.code;
    option.selected = locale.code === currentLanguage;
    option.lang = locale.bcp47;
    select.append(option);
  });
}

function renderCountrySelect() {
  const select = document.querySelector('#country-select');
  const collator = new Intl.Collator(currentLanguage);
  const international = countries.find((country) => country.code === 'WO');
  const sorted = countries.filter((country) => country.code !== 'WO')
    .sort((a, b) => collator.compare(countryName(a), countryName(b)));
  select.replaceChildren();
  [international, ...sorted].forEach((country) => {
    const option = element('option', '', flagEmoji(country.code) + ' ' + countryName(country));
    option.value = country.code;
    option.selected = country.code === currentCountry;
    select.append(option);
  });
}

function renderContext() {
  const country = selectedCountry();
  document.querySelector('#context-flag').textContent = flagEmoji(country.code);
  document.querySelector('#context-country').textContent = countryName(country);

  const suggestions = document.querySelector('#site-language-suggestions');
  suggestions.replaceChildren();
  const countryLanguages = country.code === 'WO'
    ? supportedLocales.flatMap((locale) => locale.spokenCodes)
    : country.languages.map((language) => language.code);
  const supportedSuggestions = country.code === 'WO'
    ? supportedLocales.map((locale) => locale.code)
    : supportedLocales
      .filter((locale) =>
        locale.spokenCodes.some((code) => countryLanguages.includes(code))
        && (!locale.suggestedCountries?.length || locale.suggestedCountries.includes(country.code))
      )
      .map((locale) => locale.code);
  if (!supportedSuggestions.includes(defaultLanguage)) supportedSuggestions.push(defaultLanguage);

  const visibleSuggestions = country.code === 'WO'
    ? supportedSuggestions
    : supportedSuggestions.slice(0, 4);
  visibleSuggestions.forEach((code) => {
    const locale = supportedLocales.find((item) => item.code === code);
    const button = element('button', 'chip-button', locale.native);
    button.type = 'button';
    button.lang = locale.bcp47;
    button.setAttribute('aria-current', String(code === currentLanguage));
    button.addEventListener('click', () => changeLanguage(code));
    suggestions.append(button);
  });

  country.languages.filter((language) =>
    !supportedLocales.some((locale) => locale.spokenCodes.includes(language.code))
  )
    .slice(0, 3)
    .forEach((language) => {
      const chip = element('span', 'chip muted', languageName(language.code));
      chip.title = t('context.notYetAvailable');
      suggestions.append(chip);
    });

  const signList = document.querySelector('#sign-language-list');
  signList.replaceChildren();
  if (country.code === 'WO') {
    signList.append(element('span', 'chip muted', t('context.internationalSignData')));
  } else if (country.signLanguages.length) {
    country.signLanguages.forEach((language) => {
      const chip = element('span', 'chip', language.name);
      chip.lang = 'en';
      signList.append(chip);
    });
  } else {
    signList.append(element('span', 'chip muted', t('context.noSignData')));
  }

  document.querySelector('#language-help').href = mailtoHref('support@signwriting.org', t('mail.topic.language'));
  document.querySelectorAll('.js-register').forEach((link) => {
    link.href = mailtoHref('register@signwriting.org', t('mail.topic.register'));
  });
}

function renderContacts() {
  const container = document.querySelector('#contact-list');
  container.replaceChildren();
  office.contacts.forEach((contact) => {
    const title = t('contact.' + contact.id + '.title');
    const card = element('a', 'contact-card');
    card.href = mailtoHref(contact.email, title);
    card.setAttribute('aria-label', t('contact.writeTo', {title, email: contact.email}));
    const icon = element('span', 'contact-icon', iconByName[contact.icon] || '•');
    icon.setAttribute('aria-hidden', 'true');
    const copy = element('div');
    copy.append(
      element('h3', '', title),
      element('p', '', t('contact.' + contact.id + '.description')),
      element('span', 'email', contact.email)
    );
    card.append(icon, copy);
    container.append(card);
  });
}

function departmentLabel(id) {
  return t('department.' + id + '.title');
}

function renderBots() {
  const container = document.querySelector('#bot-list');
  container.replaceChildren();
  office.bots.forEach((bot) => {
    const card = element('article', 'bot-card');
    card.id = 'bot-' + bot.id;
    const top = element('div', 'bot-top');
    const avatar = element('div', 'bot-avatar avatar-' + bot.accent);
    avatar.setAttribute('aria-hidden', 'true');
    avatar.append(element('span', '', bot.initials));
    if (bot.image) {
      const portrait = element('img');
      portrait.src = bot.image;
      portrait.alt = '';
      portrait.loading = 'lazy';
      avatar.classList.add('has-image');
      portrait.addEventListener('error', () => {
        portrait.remove();
        avatar.classList.remove('has-image');
      }, {once: true});
      avatar.prepend(portrait);
    }
    const identity = element('div');
    identity.append(element('h3', '', bot.name), element('p', 'bot-title', bot.title));
    top.append(avatar, identity);
    card.append(top);

    const memberships = element('div', 'bot-memberships');
    if (bot.headOf) {
      memberships.append(element('span', 'membership head', t('bots.headOf', {department: departmentLabel(bot.headOf)})));
    }
    bot.memberOf.forEach((id) => memberships.append(element('span', 'membership', departmentLabel(id))));
    card.append(memberships);

    const primaryDepartment = office.departments.find((department) => department.id === bot.headOf)
      || office.departments.find((department) => bot.memberOf.includes(department.id));
    const contact = element('a', 'bot-contact', t('bots.include', {name: bot.name}));
    contact.href = mailtoHref(primaryDepartment?.email || 'steve@signwriting.org', bot.name);
    card.append(contact);
    container.append(card);
  });
}

function renderDepartments() {
  const container = document.querySelector('#department-list');
  container.replaceChildren();
  office.departments.forEach((department, index) => {
    const card = element('article', 'department');
    card.id = 'department-' + department.id;
    const summary = element('div', 'department-summary');
    summary.append(
      element('span', 'department-number', String(index + 1).padStart(2, '0')),
      element('h3', '', departmentLabel(department.id)),
      element('p', '', t('department.' + department.id + '.description'))
    );
    const people = element('div', 'department-people');
    office.bots.filter((bot) => bot.headOf === department.id || bot.memberOf.includes(department.id))
      .forEach((bot) => {
        const isHead = bot.headOf === department.id;
        people.append(element('span', 'person-pill' + (isHead ? ' head' : ''), bot.name + (isHead ? ' · ' + t('departments.head') : '')));
      });
    summary.append(people);

    const campaigns = element('div', 'campaign-stack');
    department.campaigns.forEach((campaignId) => {
      const campaign = office.campaigns.find((item) => item.id === campaignId);
      const title = t('campaign.' + campaign.id + '.title');
      const panel = element('div', 'campaign');
      panel.append(
        element('span', 'campaign-state', t('campaign.status.' + campaign.status)),
        element('h4', '', title),
        element('p', '', t('campaign.' + campaign.id + '.description'))
      );
      const link = element('a', '', t('campaign.contact'));
      link.href = mailtoHref(department.email, title);
      panel.append(link);
      campaigns.append(panel);
    });
    card.append(summary, campaigns);
    container.append(card);
  });
}

function renderResources() {
  const container = document.querySelector('#resource-list');
  container.replaceChildren();
  office.resources.forEach((resource) => {
    const card = element('a', 'resource-card');
    card.href = resource.url;
    card.target = '_blank';
    card.rel = 'noreferrer';
    card.append(
      element('h3', '', t('resource.' + resource.id + '.title')),
      element('p', '', t('resource.' + resource.id + '.description'))
    );
    container.append(card);
  });
}

function persistSelection() {
  localStorage.setItem(storageKeys.country, currentCountry);
  localStorage.setItem(storageKeys.language, currentLanguage);
  const nextUrl = new URL(window.location.href);
  if (currentCountry === 'WO') nextUrl.searchParams.delete('country');
  else nextUrl.searchParams.set('country', currentCountry);
  if (currentLanguage === 'en') nextUrl.searchParams.delete('lang');
  else nextUrl.searchParams.set('lang', currentLanguage);
  history.replaceState({}, '', nextUrl);
}

async function changeLanguage(code) {
  const request = ++languageRequest;
  const nextLanguage = chooseLanguage(code);
  let nextMessages;
  try {
    nextMessages = await loadMessages(nextLanguage);
  } catch (error) {
    console.error(error);
    nextMessages = fallbackMessages;
  }
  if (request !== languageRequest) return;
  currentLanguage = nextMessages === fallbackMessages && nextLanguage !== defaultLanguage
    ? defaultLanguage
    : nextLanguage;
  messages = nextMessages;
  persistSelection();
  render();
}

function render() {
  updateDocumentLanguage();
  translateStaticContent();
  renderLanguageSelect();
  renderCountrySelect();
  renderContext();
  renderContacts();
  renderBots();
  renderDepartments();
  renderResources();
}

async function start() {
  const [localeConfig, officeData, countryData] = await Promise.all([
    fetchJson('data/locales.json'),
    fetchJson('data/office.json'),
    fetchJson('data/countries.json')
  ]);
  supportedLocales = localeConfig.locales;
  defaultLanguage = localeConfig.defaultLocale;
  office = officeData;
  countries = countryData;
  currentLanguage = initialLanguage();
  currentCountry = initialCountry();
  fallbackMessages = await fetchJson(localeFor(defaultLanguage).catalog);
  try {
    messages = await loadMessages(currentLanguage);
  } catch (error) {
    console.error(error);
    currentLanguage = defaultLanguage;
    messages = fallbackMessages;
  }

  document.querySelector('#country-select').addEventListener('change', (event) => {
    currentCountry = event.target.value;
    persistSelection();
    renderContext();
    renderContacts();
    renderBots();
    renderDepartments();
  });
  document.querySelector('#language-select').addEventListener('change', (event) => changeLanguage(event.target.value));
  persistSelection();
  render();
}

start().catch((error) => {
  console.error(error);
  document.body.classList.add('load-error');
});
