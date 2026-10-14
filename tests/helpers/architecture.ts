import path from 'node:path';
import ts from 'typescript';

interface Reference {
  specifier: string;
  target?: string;
}
export type DependencyGraph = Map<string, Reference[]>;
export type Boundary = 'commands' | 'rules' | 'server' | 'client';
const normalize = (file: string) => file.replaceAll('\\', '/');

export function buildDependencyGraph(
  root: string,
  sources: Map<string, string>,
  options: ts.CompilerOptions,
): DependencyGraph {
  const names = new Map([...sources.keys()].map((file) => [path.resolve(root, file), file]));
  const directories = new Set<string>();
  for (const absolute of names.keys()) {
    for (
      let directory = path.dirname(absolute);
      !directories.has(directory);
      directory = path.dirname(directory)
    ) {
      directories.add(directory);
      if (directory === path.dirname(directory)) break;
    }
  }
  const host: ts.ModuleResolutionHost = {
    fileExists: (file) => names.has(path.resolve(file)),
    readFile: (file) => sources.get(names.get(path.resolve(file)) || ''),
    directoryExists: (directory) => directories.has(path.resolve(directory)),
    getCurrentDirectory: () => root,
  };
  const cache = ts.createModuleResolutionCache(root, normalize, options);
  const graph: DependencyGraph = new Map();
  for (const [file, text] of sources) {
    const absolute = path.resolve(root, file);
    const references: Reference[] = [];
    const add = (specifier: string) => {
      const resolved = ts.resolveModuleName(
        specifier,
        absolute,
        options,
        host,
        cache,
      ).resolvedModule;
      references.push({
        specifier,
        target: resolved && names.get(path.resolve(resolved.resolvedFileName)),
      });
    };
    const source = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const onlyTypes =
          clause?.isTypeOnly ||
          (!clause?.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((element) => element.isTypeOnly));
        if (!onlyTypes) add(node.moduleSpecifier.text);
      }
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const clause = node.exportClause;
        const onlyTypes =
          node.isTypeOnly ||
          (clause &&
            ts.isNamedExports(clause) &&
            clause.elements.length > 0 &&
            clause.elements.every((element) => element.isTypeOnly));
        if (!onlyTypes) add(node.moduleSpecifier.text);
      }
      if (
        ts.isImportEqualsDeclaration(node) &&
        !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteral(node.moduleReference.expression)
      )
        add(node.moduleReference.expression.text);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    graph.set(file, references);
  }
  return graph;
}

export function findRuntimeCycles(graph: DependencyGraph) {
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[] = [];
  const visit = (file: string) => {
    const index = stack.indexOf(file);
    if (index >= 0) {
      cycles.push([...stack.slice(index), file].join(' → '));
      return;
    }
    if (visited.has(file)) return;
    stack.push(file);
    graph.get(file)?.forEach((reference) => {
      if (reference.target) visit(reference.target);
    });
    stack.pop();
    visited.add(file);
  };
  graph.forEach((_, file) => visit(file));
  return cycles;
}

const isCommands = (file: string) => /^src\/modules\/[^/]+\/actions\.ts$/.test(file);
const isRules = (file: string) =>
  /^src\/(lib|services)\//.test(file) || file === 'src/modules/center/model.ts';
const isUiFile = (file: string) =>
  file.endsWith('.tsx') || /^src\/(app|components|hooks|context)\//.test(file);
const isUiPackage = (specifier: string) =>
  /^(react(?:-dom)?(?:\/|$)|lucide-react(?:\/|$)|@radix-ui\/react-|motion\/react(?:\/|$))/.test(
    specifier,
  );

export function findBoundaryViolations(graph: DependencyGraph, boundary: Boundary) {
  const origins = [...graph.keys()].filter((file) =>
    boundary === 'commands'
      ? isCommands(file)
      : boundary === 'rules'
        ? isRules(file)
        : boundary === 'server'
          ? /^(api|server)\//.test(file)
          : file.startsWith('src/'),
  );
  const violations: string[] = [];
  for (const origin of origins) {
    const visited = new Set<string>();
    const queue: string[][] = [[origin]];
    if (boundary === 'rules' && origin.endsWith('.tsx'))
      violations.push(`${origin} → UI in rules layer`);
    for (let index = 0; index < queue.length; index += 1) {
      const route = queue[index];
      const file = route.at(-1)!;
      if (visited.has(file)) continue;
      visited.add(file);
      for (const reference of graph.get(file) || []) {
        const target = reference.target;
        const blocked =
          boundary === 'client'
            ? reference.specifier.startsWith('node:') || (target && /^(api|server)\//.test(target))
            : isUiPackage(reference.specifier) ||
              (target &&
                (isUiFile(target) ||
                  target === 'src/modules/center/createCenterActions.ts' ||
                  (boundary !== 'commands' && isCommands(target)) ||
                  (boundary === 'server' &&
                    ['src/lib/supabase.ts', 'src/lib/activeSessions.ts'].includes(target))));
        if (blocked) violations.push([...route, target || reference.specifier].join(' → '));
        else if (target) queue.push([...route, target]);
      }
    }
  }
  return violations;
}
