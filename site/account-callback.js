// Remove callback parameters before loading any further modules or catalogs.
// Stage 1 never processes real authorization codes, tokens, or provider errors.
const unexpectedParameters = Boolean(location.search || location.hash);
history.replaceState(null, '', location.pathname);
const {createAccountProvider} = await import('./account-provider.js');
let completed = false;
try {
  completed = await createAccountProvider().completeCallback({unexpectedParameters});
} catch { /* An unavailable provider leaves the callback closed. */ }
if (completed) {
  location.replace(new URL('./#account', import.meta.url).href);
} else {
  document.querySelector('#callback-status').textContent = 'Sign-in could not be completed. Return to the Office and try again.';
}
