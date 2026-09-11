import {createAccountProvider} from './account-provider.js';

let renderAccount;
export function updateAccount(translate) {
  if (!renderAccount) renderAccount = initializeAccount();
  renderAccount(translate);
}

function initializeAccount() {
  const provider = createAccountProvider();
  const dialog = document.querySelector('#account-dialog');
  const entry = document.querySelector('#account-entry');
  const close = dialog.querySelector('[data-account-close]');
  const primary = dialog.querySelector('[data-account-primary]');
  const signOut = dialog.querySelector('[data-account-signout]');
  const profile = dialog.querySelector('[data-account-profile]');
  const allowance = dialog.querySelector('[data-account-allowance]');
  const statusTitle = dialog.querySelector('[data-account-title]');
  const statusBody = dialog.querySelector('[data-account-body]');
  let t;
  let state = provider.getState();
  let operation = 0;
  const statuses = new Set(['signed-out', 'pending', 'signed-in', 'expired', 'unavailable', 'denied', 'exhausted', 'disabled']);

  function render() {
    if (!t) return;
    const status = statuses.has(state.status) ? state.status : 'unavailable';
    dialog.dataset.accountState = status;
    statusTitle.textContent = t('account.' + status + '.title');
    statusBody.textContent = t('account.' + status + '.body');
    profile.hidden = !state.user;
    profile.textContent = state.user?.displayName || '';
    allowance.hidden = !state.allowance;
    allowance.textContent = state.allowance
      ? t('account.allowance', state.allowance) : '';
    signOut.hidden = !state.user;
    const canSignIn = ['signed-out', 'expired'].includes(status);
    const canRead = status === 'signed-in';
    primary.hidden = !(canSignIn || canRead);
    primary.textContent = t(canRead ? 'account.openDocument' : 'account.signIn');
    primary.dataset.action = canRead ? 'read' : 'signIn';
    // Native disabled states supplement the provider; they do not authorize access.
    primary.disabled = status === 'pending';
    dialog.querySelector('[data-account-status]').setAttribute('aria-busy', String(status === 'pending'));
  }

  async function perform(action) {
    const request = ++operation;
    try { await provider[action](); }
    catch {
      if (request === operation) {
        state = {status: 'unavailable', user: null, allowance: null};
        render();
      }
    }
  }

  function open() {
    if (!dialog.open) dialog.showModal();
    close.focus();
  }
  entry.addEventListener('click', open);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => entry.focus());
  primary.addEventListener('click', () => perform(primary.dataset.action === 'read' ? 'readDocument' : 'signIn'));
  signOut.addEventListener('click', () => perform('signOut'));
  provider.subscribe((next) => { state = next; render(); });
  // This optional hook exists only on the separately built local preview provider.
  provider.mountControls?.(dialog.querySelector('[data-account-controls]'));
  if (location.hash === '#account') open();
  window.addEventListener('hashchange', () => { if (location.hash === '#account') open(); });
  return (translate) => { t = translate; render(); };
}
