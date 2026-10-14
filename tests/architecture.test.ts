import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  buildDependencyGraph,
  findBoundaryViolations,
  findRuntimeCycles,
} from './helpers/architecture';

const root = path.resolve('.');
const files = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
const sourceFiles = ['src', 'api', 'server'].flatMap((directory) =>
  files(path.join(root, directory)),
);
const sources = new Map(
  sourceFiles.map((file) => [
    path.relative(root, file).replaceAll('\\', '/'),
    fs.readFileSync(file, 'utf8'),
  ]),
);
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const graph = buildDependencyGraph(root, sources, options);

describe('module boundaries', () => {
  it('has no runtime cycles across client, lazy screens and server modules', () => {
    expect(findRuntimeCycles(graph)).toEqual([]);
  });
  it('keeps domain commands independent of UI and the composition root, including indirect imports', () => {
    expect(findBoundaryViolations(graph, 'commands')).toEqual([]);
  });
  it('keeps rules and Excel services independent of React and feature commands', () => {
    expect(findBoundaryViolations(graph, 'rules')).toEqual([]);
  });
  it('keeps server code independent of browser UI and store workflows', () => {
    expect(findBoundaryViolations(graph, 'server')).toEqual([]);
  });
  it('keeps browser code independent of server handlers and Node-only modules', () => {
    expect(findBoundaryViolations(graph, 'client')).toEqual([]);
  });
});

const fixtureGraph = (entries: Record<string, string>) =>
  buildDependencyGraph(root, new Map(Object.entries(entries)), {
    ...options,
    baseUrl: root,
    paths: { '@/*': ['./*'] },
  });

describe('architecture guard regressions', () => {
  it('detects a cycle through an alias, lazy import and re-export', () => {
    const fixture = fixtureGraph({
      'src/modules/students/actions.ts': "export { load } from '@/src/lib/bridge';",
      'src/lib/bridge.ts': "export const load = () => import('../modules/students/actions');",
    });
    expect(findRuntimeCycles(fixture)).toHaveLength(1);
  });
  it('detects indirect command-to-UI dependencies through a shared helper', () => {
    const fixture = fixtureGraph({
      'src/modules/students/actions.ts':
        "import { load } from '../../lib/bridge'; export const run = load;",
      'src/lib/bridge.ts': "export { load } from '../hooks/useUi';",
      'src/hooks/useUi.ts': "import { useState } from 'react'; export const load = useState;",
    });
    expect(findBoundaryViolations(fixture, 'commands')).toEqual([
      'src/modules/students/actions.ts → src/lib/bridge.ts → src/hooks/useUi.ts',
    ]);
  });
  it('detects React runtime imports in ordinary .ts rules files', () => {
    const fixture = fixtureGraph({
      'src/lib/fees.ts': "import { useState } from 'react'; export const fee = useState;",
    });
    expect(findBoundaryViolations(fixture, 'rules')).toEqual(['src/lib/fees.ts → react']);
  });
  it('ignores type-only imports and re-exports when checking boundaries and cycles', () => {
    const fixture = fixtureGraph({
      'src/lib/data.ts':
        "import type { Props } from '../components/View'; export { type Value } from '../components/View'; export type { Props };",
      'src/components/View.tsx':
        "import type { Props } from '../lib/data'; export interface Value {} export type { Props };",
    });
    expect(findRuntimeCycles(fixture)).toEqual([]);
    expect(findBoundaryViolations(fixture, 'rules')).toEqual([]);
  });
  it('blocks server-to-client action imports through the project alias', () => {
    const fixture = fixtureGraph({
      'api/admin/data.ts':
        "import { save } from '@/src/modules/students/actions'; export default save;",
      'src/modules/students/actions.ts': 'export function save() {}',
    });
    expect(findBoundaryViolations(fixture, 'server')).toEqual([
      'api/admin/data.ts → src/modules/students/actions.ts',
    ]);
  });
  it('follows CommonJS requires instead of missing a command-to-UI dependency', () => {
    const fixture = fixtureGraph({
      'src/modules/tuition/actions.ts':
        "const view = require('../../components/View'); export { view };",
      'src/components/View.tsx': 'export const View = () => null;',
    });
    expect(findBoundaryViolations(fixture, 'commands')).toEqual([
      'src/modules/tuition/actions.ts → src/components/View.tsx',
    ]);
  });
  it('blocks browser code from importing a server handler or Node-only code', () => {
    const fixture = fixtureGraph({
      'src/modules/auth/api.ts':
        "import handler from '../../../api/admin/users'; import fs from 'node:fs'; export { handler, fs };",
      'api/admin/users.ts': 'export default function handler() {}',
    });
    expect(findBoundaryViolations(fixture, 'client')).toEqual([
      'src/modules/auth/api.ts → api/admin/users.ts',
      'src/modules/auth/api.ts → node:fs',
    ]);
  });
  it('blocks a server handler from using the browser Supabase session client', () => {
    const fixture = fixtureGraph({
      'api/admin/users.ts':
        "import { supabase } from '../../src/lib/supabase'; export { supabase };",
      'src/lib/supabase.ts': 'export const supabase = null;',
    });
    expect(findBoundaryViolations(fixture, 'server')).toEqual([
      'api/admin/users.ts → src/lib/supabase.ts',
    ]);
  });
});
