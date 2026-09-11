import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

const baseUrl = process.argv[2] || 'http://127.0.0.1:7040/';
const profile = await mkdtemp(path.join(process.cwd(), '.browser-cdp-'));
let browser;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function endpointFrom(process) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chromium debugging endpoint timed out')), 10000);
    process.stderr.on('data', (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    process.once('exit', (code) => reject(new Error('Chromium exited early with ' + code)));
  });
}

async function connectPage(browserEndpoint) {
  const endpoint = new URL(browserEndpoint);
  let target;
  for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
    const targets = await fetch('http://' + endpoint.host + '/json/list').then((response) => response.json());
    target = targets.find((item) => item.type === 'page' && item.url.startsWith(baseUrl));
    if (!target) await delay(50);
  }
  if (!target) throw new Error('No Chromium page target');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const {resolve, reject} = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    socket,
    call(method, params = {}) {
      const requestId = ++id;
      socket.send(JSON.stringify({id: requestId, method, params}));
      return new Promise((resolve, reject) => pending.set(requestId, {resolve, reject}));
    }
  };
}

async function evaluate(client, expression, attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await client.call('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
      return response.result.value;
    } catch (error) {
      const transientContextError = error.message.includes('Execution context was destroyed')
        || error.message.includes('Cannot find default execution context');
      if (!transientContextError || attempt === attempts) throw error;
      await delay(100);
    }
  }
}

const waitForOffice = `new Promise((resolve, reject) => {
  const deadline = Date.now() + 8000;
  const check = () => {
    if (document.querySelector('#language-select')?.options.length === 12 && document.querySelectorAll('.bot-contact').length === 12) resolve(true);
    else if (Date.now() > deadline) reject(new Error('Office did not initialize'));
    else setTimeout(check, 50);
  };
  check();
})`;

const snapshot = `(() => ({
  language: document.documentElement.lang,
  direction: document.documentElement.dir,
  languageSelect: document.querySelector('#language-select').value,
  countrySelect: document.querySelector('#country-select').value,
  country: document.querySelector('#context-country').textContent,
  flag: document.querySelector('#context-flag').textContent,
  headerCountryControl: Boolean(document.querySelector('.site-header #country-select')),
  localCountryControl: Boolean(document.querySelector('.context-location #country-select')),
  internationalOption: document.querySelector('#country-select option[value="WO"]')?.textContent,
  suggestedLanguageCount: document.querySelectorAll('#site-language-suggestions .chip-button').length,
  brazilianSuggestion: Boolean(document.querySelector('#site-language-suggestions .chip-button[lang="pt-BR"]')),
  portugalSuggestion: Boolean(document.querySelector('#site-language-suggestions .chip-button[lang="pt-PT"]')),
  portugueseOptions: [...document.querySelectorAll('#language-select option')]
    .filter((option) => option.value.startsWith('pt-')).map((option) => option.value).join('|'),
  signContext: document.querySelector('#sign-language-list').textContent,
  savedLanguage: localStorage.getItem('sgnw_office_language'),
  savedCountry: localStorage.getItem('sgnw_office_country'),
  search: location.search,
  urlLanguage: new URL(location.href).searchParams.get('lang'),
  urlCountry: new URL(location.href).searchParams.get('country'),
  advancement: document.querySelector('#department-advancement .department-summary p').textContent,
  firstBotAction: document.querySelector('.bot-contact').textContent,
  researchContact: [...document.querySelectorAll('#contact-list .contact-card')].some((card) =>
    card.querySelector('.email')?.textContent === 'research@signwriting.org'
    && card.getAttribute('href')?.startsWith('mailto:research@signwriting.org?')),
  helpContact: [...document.querySelectorAll('#contact-list .contact-card')].some((card) =>
    card.querySelector('.email')?.textContent === 'help@signwriting.org'
    && card.getAttribute('href')?.startsWith('mailto:help@signwriting.org?')),
  languageHelp: document.querySelector('#language-help')
    ?.getAttribute('href')?.startsWith('mailto:help@signwriting.org?') || false,
  researchDepartment: document.querySelector('#department-research .campaign a')
    ?.getAttribute('href')?.startsWith('mailto:research@signwriting.org?') || false,
  avatarImages: document.querySelectorAll('.bot-avatar.has-image img').length,
  rawKeyVisible: document.body.textContent.includes('department.advancement.description')
}))()`;

function assertState(label, actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(label + ': expected ' + key + '=' + JSON.stringify(value) + ', got ' + JSON.stringify(actual[key]));
  }
  console.log(label + ': PASS');
}

try {
  browser = spawn('/snap/bin/chromium', [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    baseUrl
  ], {stdio: ['ignore', 'ignore', 'pipe']});
  const browserEndpoint = await endpointFrom(browser);
  const client = await connectPage(browserEndpoint);
  await evaluate(client, waitForOffice);
  assertState('international initialization', await evaluate(client, snapshot), {
    language: 'en', languageSelect: 'en', countrySelect: 'WO', country: 'International',
    flag: '🌐', headerCountryControl: false, localCountryControl: true,
    internationalOption: '🌐 International', suggestedLanguageCount: 12,
    brazilianSuggestion: true, portugalSuggestion: true,
    portugueseOptions: 'pt-BR|pt-PT',
    signContext: 'Choose a country or region to see its known sign languages.',
    savedLanguage: 'en', savedCountry: 'WO', search: '', urlLanguage: null, urlCountry: null
  });

  await evaluate(client, `(async () => {
    const language = document.querySelector('#language-select');
    language.value = 'pt-PT';
    language.dispatchEvent(new Event('change', {bubbles: true}));
    while (document.documentElement.lang !== 'pt-PT') await new Promise((resolve) => setTimeout(resolve, 25));
    const country = document.querySelector('#country-select');
    country.value = 'PT';
    country.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  assertState('Portugal Portuguese', await evaluate(client, snapshot), {
    language: 'pt-PT', languageSelect: 'pt-PT', countrySelect: 'PT', country: 'Portugal',
    flag: '🇵🇹', brazilianSuggestion: false, portugalSuggestion: true,
    savedLanguage: 'pt-PT', savedCountry: 'PT', urlLanguage: 'pt-PT', urlCountry: 'PT',
    firstBotAction: 'Enviar e-mail a Chief of Staff'
  });

  await evaluate(client, `(async () => {
    const language = document.querySelector('#language-select');
    language.value = 'pt-BR';
    language.dispatchEvent(new Event('change', {bubbles: true}));
    while (document.documentElement.lang !== 'pt-BR') await new Promise((resolve) => setTimeout(resolve, 25));
    const country = document.querySelector('#country-select');
    country.value = 'BR';
    country.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  assertState('Brazil Portuguese', await evaluate(client, snapshot), {
    language: 'pt-BR', languageSelect: 'pt-BR', countrySelect: 'BR', country: 'Brasil',
    flag: '🇧🇷', brazilianSuggestion: true, portugalSuggestion: false,
    savedLanguage: 'pt-BR', savedCountry: 'BR', urlLanguage: 'pt-BR', urlCountry: 'BR',
    firstBotAction: 'Enviar e-mail para Chief of Staff'
  });

  await evaluate(client, `(async () => {
    const language = document.querySelector('#language-select');
    language.value = 'de';
    language.dispatchEvent(new Event('change', {bubbles: true}));
    while (document.documentElement.lang !== 'de') await new Promise((resolve) => setTimeout(resolve, 25));
    const country = document.querySelector('#country-select');
    country.value = 'DE';
    country.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  assertState('dropdown setting', await evaluate(client, snapshot), {
    language: 'de', languageSelect: 'de', countrySelect: 'DE', country: 'Deutschland',
    flag: '🇩🇪', headerCountryControl: false, localCountryControl: true,
    savedLanguage: 'de', savedCountry: 'DE', urlLanguage: 'de', urlCountry: 'DE',
    firstBotAction: 'E-Mail an Chief of Staff', researchContact: true, helpContact: true,
    languageHelp: true, researchDepartment: true, avatarImages: 12, rawKeyVisible: false
  });

  await client.call('Page.reload', {ignoreCache: false});
  await delay(800);
  await evaluate(client, waitForOffice);
  assertState('refresh persistence', await evaluate(client, snapshot), {
    language: 'de', languageSelect: 'de', countrySelect: 'DE', country: 'Deutschland',
    savedLanguage: 'de', savedCountry: 'DE', firstBotAction: 'E-Mail an Chief of Staff', rawKeyVisible: false
  });

  await evaluate(client, `(async () => {
    const language = document.querySelector('#language-select');
    language.value = 'en';
    language.dispatchEvent(new Event('change', {bubbles: true}));
    while (document.documentElement.lang !== 'en') await new Promise((resolve) => setTimeout(resolve, 25));
    const country = document.querySelector('#country-select');
    country.value = 'WO';
    country.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  assertState('dropdown reset', await evaluate(client, snapshot), {
    language: 'en', languageSelect: 'en', countrySelect: 'WO', country: 'International',
    flag: '🌐', headerCountryControl: false, localCountryControl: true,
    internationalOption: '🌐 International',
    savedLanguage: 'en', savedCountry: 'WO', search: '', urlLanguage: null, urlCountry: null,
    firstBotAction: 'Email Chief of Staff', researchContact: true,
    researchDepartment: true, avatarImages: 12, rawKeyVisible: false
  });

  await client.call('Page.reload', {ignoreCache: false});
  await delay(800);
  await evaluate(client, waitForOffice);
  assertState('reset persistence', await evaluate(client, snapshot), {
    language: 'en', languageSelect: 'en', countrySelect: 'WO', country: 'International',
    flag: '🌐', headerCountryControl: false, localCountryControl: true,
    internationalOption: '🌐 International',
    savedLanguage: 'en', savedCountry: 'WO', search: '', urlLanguage: null, urlCountry: null,
    firstBotAction: 'Email Chief of Staff', rawKeyVisible: false
  });

  await evaluate(client, `(() => {
    localStorage.setItem('sgnw_office_language', 'de');
    localStorage.setItem('sgnw_office_country', 'DE');
  })()`);
  await client.call('Page.navigate', {url: new URL('?country=ZZ&lang=xx', baseUrl).href});
  await delay(800);
  await evaluate(client, waitForOffice);
  assertState('invalid URL fallback', await evaluate(client, snapshot), {
    language: 'de', languageSelect: 'de', countrySelect: 'DE', country: 'Deutschland',
    savedLanguage: 'de', savedCountry: 'DE', urlLanguage: 'de', urlCountry: 'DE',
    firstBotAction: 'E-Mail an Chief of Staff', rawKeyVisible: false
  });

  await client.call('Page.navigate', {url: new URL('?country=BR&lang=pt', baseUrl).href});
  await delay(800);
  await evaluate(client, waitForOffice);
  assertState('legacy Portuguese migration', await evaluate(client, snapshot), {
    language: 'pt-BR', languageSelect: 'pt-BR', countrySelect: 'BR', country: 'Brasil',
    flag: '🇧🇷', savedLanguage: 'pt-BR', savedCountry: 'BR',
    urlLanguage: 'pt-BR', urlCountry: 'BR', firstBotAction: 'Enviar e-mail para Chief of Staff'
  });


  await client.call('Page.navigate', {url: new URL('?lang=en', baseUrl).href});
  await delay(800);
  await evaluate(client, waitForOffice);
  await evaluate(client, "document.querySelector('#account-entry').focus()");
  await client.call('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r'});
  await client.call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13});
  await delay(100);
  const accountSnapshot = `(() => ({
    open: document.querySelector('#account-dialog').open,
    state: document.querySelector('#account-dialog').dataset.accountState,
    closeFocused: document.activeElement.hasAttribute('data-account-close'),
    primaryVisible: !document.querySelector('[data-account-primary]').hidden,
    signoutVisible: !document.querySelector('[data-account-signout]').hidden,
    profile: document.querySelector('[data-account-profile]').textContent,
    allowance: document.querySelector('[data-account-allowance]').textContent,
    previewControls: Boolean(document.querySelector('#account-preview-state')),
    overflow: document.documentElement.scrollWidth > innerWidth,
    passwords: document.querySelectorAll('input[type=password]').length
  }))()`;
  const preview = process.argv.includes('--account-preview');
  assertState('keyboard opens account', await evaluate(client, accountSnapshot), {
    open: true, closeFocused: true, state: preview ? 'signed-out' : 'unavailable',
    previewControls: preview, overflow: false, passwords: 0
  });
  await client.call('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await client.call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
  await delay(100);
  assertState('Escape closes and returns focus', await evaluate(client, `({
    open: document.querySelector('#account-dialog').open,
    entryFocused: document.activeElement.id === 'account-entry'
  })`), {open: false, entryFocused: true});
  await evaluate(client, "document.querySelector('#account-entry').click()");

  if (preview) {
    await evaluate(client, "document.querySelector('[data-account-primary]').click()");
    await delay(1400);
    await evaluate(client, waitForOffice);
    assertState('synthetic callback returns to account', await evaluate(client, accountSnapshot), {
      open: true, state: 'signed-in', profile: 'Sample member',
      allowance: '5 of 5 document grants remaining today.', signoutVisible: true
    });
    await evaluate(client, "for (let i = 0; i < 5; i++) document.querySelector('[data-account-primary]').click()");
    assertState('allowance preview reaches exhaustion', await evaluate(client, accountSnapshot), {
      state: 'exhausted', primaryVisible: false, allowance: '0 of 5 document grants remaining today.'
    });
    for (const state of ['denied', 'disabled', 'expired', 'pending', 'unavailable']) {
      await evaluate(client, `(() => {
        const select = document.querySelector('#account-preview-state');
        select.value = ${JSON.stringify(state)};
        select.dispatchEvent(new Event('change', {bubbles: true}));
      })()`);
      assertState('preview state ' + state, await evaluate(client, accountSnapshot), {
        state, primaryVisible: state === 'expired'
      });
    }
    await evaluate(client, `(() => {
      const select = document.querySelector('#account-preview-state');
      select.value = 'signed-in';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      document.querySelector('[data-account-signout]').click();
    })()`);
    assertState('sign-out clears displayed account', await evaluate(client, accountSnapshot), {
      state: 'signed-out', profile: '', allowance: '', signoutVisible: false
    });
  } else {
    await evaluate(client, `sessionStorage.setItem('office-account-preview-state', JSON.stringify({status: 'signed-in', remaining: 5}))`);
    await client.call('Page.reload', {ignoreCache: true});
    await delay(800);
    await evaluate(client, waitForOffice);
    await evaluate(client, "document.querySelector('#account-entry').click()");
    assertState('production ignores injected sample state', await evaluate(client, accountSnapshot), {
      state: 'unavailable', profile: '', primaryVisible: false, previewControls: false
    });
  }

  await client.call('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  assertState('mobile account fits', await evaluate(client, accountSnapshot), {open: true, overflow: false});
  await evaluate(client, "document.querySelector('[data-account-close]').click()");
  await evaluate(client, `(async () => {
    const language = document.querySelector('#language-select');
    language.value = 'ar'; language.dispatchEvent(new Event('change', {bubbles: true}));
    while (document.documentElement.lang !== 'ar') await new Promise(resolve => setTimeout(resolve, 25));
    document.querySelector('#account-entry').click();
  })()`);
  assertState('Arabic account layout', await evaluate(client, `({
    dir: document.documentElement.dir,
    label: document.querySelector('#account-entry').textContent,
    overflow: document.documentElement.scrollWidth > innerWidth
  })`), {dir: 'rtl', label: 'الحساب', overflow: false});

  await client.call('Page.navigate', {url: new URL('auth/callback/?code=invalid-test-code&state=untrusted', baseUrl).href});
  await delay(700);
  assertState('callback rejects unsolicited parameters', await evaluate(client, `({
    path: location.pathname, search: location.search, hash: location.hash,
    status: document.querySelector('#callback-status')?.textContent,
    profile: document.querySelector('[data-account-profile]')?.textContent || ''
  })`), {
    path: '/auth/callback/', search: '', hash: '', profile: '',
    status: 'Sign-in could not be completed. Return to the Office and try again.'
  });

  client.socket.close();
} finally {
  browser?.kill('SIGTERM');
  await delay(250);
  await rm(profile, {recursive: true, force: true});
}
