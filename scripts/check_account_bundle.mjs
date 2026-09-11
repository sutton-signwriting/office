import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

export async function checkProductionBundle(directory) {
  const build = JSON.parse(await readFile(path.join(directory, 'account-build.json'), 'utf8'));
  if (build.mode !== 'production') throw new Error('Only a production account build may be published');
  const provider = await readFile(path.join(directory, 'account-provider.js'), 'utf8');
  if (provider !== "export {createAccountProvider} from './account-unavailable.js';\n")
    throw new Error('Unexpected production account provider; review live integration before changing this gate');
  async function inspect(dir) {
    for (const item of await readdir(dir, {withFileTypes: true})) {
      const file = path.join(dir, item.name);
      if (/preview|fixture/i.test(item.name)) throw new Error('Preview artifact in production: ' + file);
      if (item.isDirectory()) await inspect(file);
      else if (/\.(js|json|html|css|map|md)$/i.test(item.name)) {
        const text = await readFile(file, 'utf8');
        if (/OFFICE_ACCOUNT_FIXTURE|office-account-preview|sample-member-001/.test(text))
          throw new Error('Fixture content in production: ' + file);
      }
    }
  }
  await inspect(directory);
  for (const file of ['auth/callback/index.html', 'account-callback.js', 'account.js'])
    await readFile(path.join(directory, file));
}
if (process.argv[1]?.endsWith('check_account_bundle.mjs')) {
  await checkProductionBundle(path.resolve(process.argv[2] || 'dist'));
  console.log('Production account bundle: no preview provider or fixtures');
}
