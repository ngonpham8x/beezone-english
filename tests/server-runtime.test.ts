import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

// Vite resolves extensionless TS imports; the deployed Node ESM runtime does not.
function compiledServer(run: (directory: string) => void) {
  const base = path.resolve('.vercel');
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'server-runtime-test-'));
  try {
    fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
    for (const file of [
      'api/admin/audit-logs.ts',
      'api/cron/daily-backup.ts',
      'server/admin.ts',
      'server/accountVisibility.ts',
      'server/dailyBackup.ts',
      'server/request.ts',
      'server/rateLimit.ts',
      'src/lib/auditPrivacy.ts',
      'src/lib/accountPrivacy.ts',
      'src/lib/centerData.ts',
      'src/lib/dates.ts',
      'src/lib/schedule.ts',
      'src/lib/sessionBilling.ts',
    ]) {
      const output = path.join(directory, file.replace(/\.ts$/, '.js'));
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(
        output,
        ts.transpileModule(fs.readFileSync(file, 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      );
    }
    run(directory);
  } finally {
    // Never recursively remove a computed path outside this test's temporary directory.
    if (path.dirname(fs.realpathSync(directory)) !== fs.realpathSync(base))
      throw new Error('Unexpected runtime test directory');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const invoke = (directory: string) =>
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
  const {default: handler} = await import(${JSON.stringify(pathToFileURL(path.join(directory, 'api/admin/audit-logs.js')).href)});
  let status;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json() {} };
  await handler({method: 'GET', headers: {}, socket: {remoteAddress: '127.0.0.1'}}, res);
  console.log(status);
`,
    ],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
  );

const invokeCron = (directory: string) =>
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
  const {default: handler} = await import(${JSON.stringify(pathToFileURL(path.join(directory, 'api/cron/daily-backup.js')).href)});
  let status;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json() {} };
  await handler({method: 'GET', headers: {}}, res);
  console.log(status);
`,
    ],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
  );

it('loads the compiled audit API in Node ESM and rejects an anonymous request before database access', () => {
  compiledServer((directory) => expect(invoke(directory).trim()).toBe('401'));
});

it('loads the compiled daily-backup API in Node ESM and protects it before database access', () => {
  compiledServer((directory) => expect(invokeCron(directory).trim()).toBe('401'));
});

it('detects the extensionless shared-rule import that would crash the deployed API', () => {
  compiledServer((directory) => {
    const module = path.join(directory, 'src/lib/auditPrivacy.js');
    fs.writeFileSync(
      module,
      fs
        .readFileSync(module, 'utf8')
        .replace(/(['"])\.\/accountPrivacy\.js\1/g, '$1./accountPrivacy$1'),
    );
    let errorOutput = '';
    try {
      invoke(directory);
    } catch (error) {
      errorOutput = String((error as { stderr?: unknown }).stderr || '');
    }
    expect(errorOutput).toContain('ERR_MODULE_NOT_FOUND');
  });
});
