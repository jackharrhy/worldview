import { parseSync, Visitor } from 'oxc-parser';

function parseSource(filename, source) {
  const parsed = parseSync(filename, source);
  const syntaxError = parsed.errors.find(({ severity }) => severity === 'Error');
  if (syntaxError) throw new SyntaxError(`${filename}: ${syntaxError.message}`);
  return parsed;
}

/** Extracts parser-backed ESM references without confusing type-only edges for runtime cycles. */
export function moduleReferences(filename, source) {
  const parsed = parseSource(filename, source);
  const references = [];
  const add = (specifier, runtime, dynamic = false) => {
    const existing = references.find(
      (candidate) => candidate.specifier === specifier && candidate.dynamic === dynamic,
    );
    if (existing) existing.runtime ||= runtime;
    else references.push({ specifier, runtime, dynamic });
  };

  for (const imported of parsed.module.staticImports) {
    add(
      imported.moduleRequest.value,
      imported.entries.length === 0 || imported.entries.some(({ isType }) => !isType),
    );
  }
  for (const exported of parsed.module.staticExports) {
    for (const entry of exported.entries) {
      if (entry.moduleRequest) add(entry.moduleRequest.value, !entry.isType);
    }
  }
  new Visitor({
    ImportExpression(node) {
      if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
        add(node.source.value, true, true);
      }
    },
  }).visit(parsed.program);
  return references;
}

/** Returns the explicit properties of a named TypeScript interface, or null when it is absent. */
export function interfacePropertyNames(filename, source, interfaceName) {
  const parsed = parseSource(filename, source);
  const properties = [];
  let found = false;
  let supported = true;
  new Visitor({
    TSInterfaceDeclaration(node) {
      if (node.id.name !== interfaceName) return;
      found = true;
      for (const member of node.body.body) {
        if (
          member.type !== 'TSPropertySignature' ||
          member.computed ||
          member.key.type !== 'Identifier'
        ) {
          supported = false;
          continue;
        }
        properties.push(member.key.name);
      }
    },
  }).visit(parsed.program);
  return found && supported ? properties : null;
}
