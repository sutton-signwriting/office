import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkProductionBundle} from './check_account_bundle.mjs';

test('production artifact passes and local preview artifact is rejected', async () => {
  await checkProductionBundle('dist');
  await assert.rejects(checkProductionBundle('dist-preview'), /Only a production/);
});

test('publication gate rejects a substituted provider and embedded fixture data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'office-bundle-check-'));
  const provider = "export {createAccountProvider} from './account-unavailable.js';\n";
  try {
    await mkdir(path.join(directory, 'auth/callback'), {recursive: true});
    for (const name of ['account.js', 'account-callback.js', 'auth/callback/index.html'])
      await writeFile(path.join(directory, name), '');
    await writeFile(path.join(directory, 'account-build.json'), '{"mode":"production"}');
    await writeFile(path.join(directory, 'account-provider.js'), provider);
    await checkProductionBundle(directory);
    await writeFile(path.join(directory, 'account-provider.js'), "export * from './preview/provider.js';");
    await assert.rejects(checkProductionBundle(directory), /Unexpected production account provider/);
    await writeFile(path.join(directory, 'account-provider.js'), provider);
    await writeFile(path.join(directory, 'ordinary.js'), 'const id = "sample-member-001";');
    await assert.rejects(checkProductionBundle(directory), /Fixture content/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
