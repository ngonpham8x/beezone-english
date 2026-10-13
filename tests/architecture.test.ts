import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.resolve('src');
const files = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
const sourceFiles = files(root);
const sourceSet = new Set(sourceFiles);
const relative = (file: string) => path.relative(root, file).replaceAll('\\', '/');
const graph = new Map<string, string[]>();

for (const file of sourceFiles) {
  const dependencies: string[] = [];
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const add = (specifier: string) => {
    if (!specifier.startsWith('.')) return;
    const target = path.resolve(path.dirname(file), specifier);
    const resolved = [target, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')].find(
      (candidate) => sourceSet.has(candidate),
    );
    if (resolved) dependencies.push(resolved);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyTypes =
        clause?.isTypeOnly ||
        (!clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.every((element) => element.isTypeOnly));
      if (!onlyTypes) add(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      add(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  graph.set(file, dependencies);
}

describe('module boundaries', () => {
  it('has no runtime dependency cycles, including lazy screens', () => {
    const visited = new Set<string>();
    const stack: string[] = [];
    const cycles: string[] = [];
    const visit = (file: string) => {
      const index = stack.indexOf(file);
      if (index >= 0) {
        cycles.push([...stack.slice(index), file].map(relative).join(' → '));
        return;
      }
      if (visited.has(file)) return;
      stack.push(file);
      graph.get(file)?.forEach(visit);
      stack.pop();
      visited.add(file);
    };
    sourceFiles.forEach(visit);
    expect(cycles).toEqual([]);
  });

  it('keeps feature commands independent of screens, the shell and the composition root', () => {
    const violations: string[] = [];
    for (const [file, dependencies] of graph) {
      if (!/^modules\/[^/]+\/actions\.ts$/.test(relative(file))) continue;
      for (const dependency of dependencies) {
        const target = relative(dependency);
        if (
          target.endsWith('.tsx') ||
          target.startsWith('app/') ||
          target === 'modules/center/createCenterActions.ts'
        )
          violations.push(`${relative(file)} → ${target}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps pure shared rules and Excel services independent of the React application', () => {
    const violations: string[] = [];
    for (const [file, dependencies] of graph) {
      if (
        !relative(file).startsWith('lib/') &&
        !relative(file).startsWith('services/') &&
        relative(file) !== 'modules/center/model.ts'
      )
        continue;
      for (const dependency of dependencies) {
        if (relative(dependency).endsWith('.tsx') || relative(dependency).startsWith('app/'))
          violations.push(`${relative(file)} → ${relative(dependency)}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
