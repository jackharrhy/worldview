import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MAX_PRODUCTION_LINES = 1_000;
const MAX_COMPOSITION_ROOT_LINES = 100;
const MAX_APPLICATION_COMPOSITION_LINES = 350;
const roots = ['apps/editor/src', 'packages/worldview-editor/src'];
const svgOwnershipAllowlist = new Set([
  // React owns the element; the focused UV renderer owns only this SVG's drawing children.
  'apps/editor/src/components/editor-shell/texture-inspector.tsx',
  'apps/editor/src/uv-editor.ts',
]);
const imperativeDomConstructionAllowlist = new Set([
  // Focused renderer boundary: React owns the SVG root and this module owns its drawing children.
  'apps/editor/src/uv-editor.ts',
  // Non-visible CSS/WebGPU color resolution probes.
  'apps/editor/src/render-theme.ts',
  // Ephemeral native download transport; the anchor is never attached to visible UI.
  'apps/editor/src/project-files.ts',
]);
const presenterDomMutationAllowlist = new Set([
  // Native file inputs must be reset after the browser change event is consumed.
  'apps/editor/src/command-events.ts',
  'apps/editor/src/project-presenter.ts',
  'apps/editor/src/tool-events.ts',
  // Document metadata lives outside the React application root.
  'apps/editor/src/theme-presenter.ts',
]);
const focusedStateConsumers = new Set([
  'apps/editor/src/collaboration-session.ts',
  'apps/editor/src/command-events.ts',
  'apps/editor/src/editor-tool-controller-registry.ts',
  'apps/editor/src/keyboard-events.ts',
  'apps/editor/src/tool-events.ts',
  'apps/editor/src/webmcp-document-tools.ts',
  'apps/editor/src/webmcp-state.ts',
]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      if (
        !entry.isFile() ||
        (!target.endsWith('.ts') && !target.endsWith('.tsx') && !target.endsWith('.css'))
      )
        return [];
      if (/\.(?:test|spec)\.tsx?$|\.d\.ts$/.test(target)) return [];
      return [target];
    }),
  );
  return files.flat();
}

function physicalLines(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

const files = (await Promise.all(roots.map(sourceFiles))).flat();
const violations = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const lineCount = physicalLines(source);
  if (lineCount > MAX_PRODUCTION_LINES) {
    violations.push(`${file}: ${lineCount} lines (maximum ${MAX_PRODUCTION_LINES})`);
  }
  if (
    file.endsWith('-presenter.ts') &&
    file !== 'apps/editor/src/editor-application.ts' &&
    /from ['"]\.\/editor-application\.js['"]/.test(source)
  ) {
    violations.push(`${file}: presenters may not depend on the EditorApplication container`);
  }
  if (
    (file.endsWith('-presenter.ts') || focusedStateConsumers.has(file)) &&
    /from ['"]\.\/editor-state\.js['"]/.test(source)
  ) {
    violations.push(
      `${file}: coordinators must declare a focused EditorStatePort instead of accepting EditorState`,
    );
  }
  if (file.endsWith('-presenter.ts') && /from ['"]\.\/[^'"]+-presenter\.js['"]/.test(source)) {
    violations.push(
      `${file}: presenters coordinate through focused command/query ports, not peer presenter types`,
    );
  }
  if (
    /(?:command|keyboard|tool)-events\.ts$/.test(file) &&
    /from ['"]\.\/editor-application\.js['"]/.test(source)
  ) {
    violations.push(
      `${file}: input adapters must receive focused ports instead of the EditorApplication container`,
    );
  }
  if (
    file === 'apps/editor/src/editor-elements.ts' &&
    /\bEditorShellState\b|editor-shell-state/.test(source)
  ) {
    violations.push(
      `${file}: EditorElements is reserved for canvas, focus, measurement, and native-file refs; React ports belong to EditorShellState`,
    );
  }
  if (
    /(?:-presenter|events)\.ts$/.test(file) &&
    file !== 'apps/editor/src/theme-presenter.ts' &&
    /\bdocument\.querySelector(?:All)?\s*(?:<[^>]+>)?\s*\(/.test(source)
  ) {
    violations.push(
      `${file}: presenters and event adapters may not discover visible UI through document queries`,
    );
  }
  if (
    /(?:-presenter|events)\.ts$/.test(file) &&
    !presenterDomMutationAllowlist.has(file) &&
    /\.classList\.(?:add|remove|toggle)\s*\(|\.style\.(?:setProperty|removeProperty)\s*\(|\.replaceChildren\s*\(|\.append(?:Child)?\s*\(|\.setAttribute\s*\(|\.(?:hidden|disabled|checked|value)\s*=(?!=)/.test(
      source,
    )
  ) {
    violations.push(
      `${file}: presenter-visible properties belong to React snapshots; only documented runtime/native boundaries may mutate DOM`,
    );
  }
  if (
    file.startsWith('apps/editor/src/') &&
    /\.(?:ts|tsx)$/.test(file) &&
    /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML\s*\(/.test(source)
  ) {
    violations.push(`${file}: HTML string injection is forbidden; render editor UI with React`);
  }
  if (
    file.startsWith('apps/editor/src/') &&
    file !== 'apps/editor/src/uv-editor.ts' &&
    /\.textContent\b/.test(source)
  ) {
    violations.push(
      `${file}: DOM-shaped textContent mutation is reserved for the focused UV renderer; publish visible text through a snapshot port`,
    );
  }
  if (
    /\.tsx?$/.test(file) &&
    !imperativeDomConstructionAllowlist.has(file) &&
    /\b(?:document|window\.document)\.createElement(?:NS)?\s*\(|\bnew\s+Option\s*\(/.test(source)
  ) {
    violations.push(
      `${file}: visible DOM construction belongs in React; add only non-visible runtime boundaries to the explicit allowlist`,
    );
  }
  if (
    file.startsWith('packages/worldview-editor/src/render/') &&
    /\.closest\s*\([^)]*viewport-pane[^)]*\)\s*\?*\.classList\b/.test(source)
  ) {
    violations.push(
      `${file}: renderer runtimes may mutate their explicit canvas/overlay refs, not React-owned viewport wrappers`,
    );
  }
  if (
    file !== 'apps/editor/src/components/ui/icon.tsx' &&
    file.startsWith('apps/editor/src/') &&
    /\bph ph-[a-z]/.test(source)
  ) {
    violations.push(`${file}: use the shared semantic Icon component instead of raw icon classes`);
  }
  if (
    file.startsWith('apps/editor/src/') &&
    !svgOwnershipAllowlist.has(file) &&
    /<svg\b|createElementNS\s*\(/.test(source)
  ) {
    violations.push(
      `${file}: product action icons use the shared Icon registry; add focused renderer surfaces to the explicit SVG allowlist`,
    );
  }
  if (/\bMapFormat\b/.test(source)) {
    violations.push(
      `${file}: MapFormat conflates document containers with face syntax; use MapDocumentFormat or MapFaceSyntax`,
    );
  }
  if (/\bMapEntity\s*\[\s*['"]brushes['"]\s*\]|\bentity\.brushes\b/.test(source)) {
    violations.push(`${file}: semantic entities own typed primitives, not a brush-only collection`);
  }
  if (/\.primitives\s+as\s+(?:readonly\s+)?MapBrush\[\]/.test(source)) {
    violations.push(`${file}: narrow MapPrimitive by its kind instead of asserting a brush array`);
  }
  if (
    file.startsWith('packages/worldview-editor/src/render/') &&
    /createShaderModule\s*\(|createPipelineLayout\s*\(|createBindGroupLayout\s*\(|(?:\bdevice|this\.device)\.createRenderPipeline(?:Async)?\s*\(|\/\*\s*wgsl\s*\*\//.test(
      source,
    )
  ) {
    violations.push(
      `${file}: editor shaders, layouts, and pipelines must use the TypeGPU renderer boundary`,
    );
  }
}

const compositionRoot = 'apps/editor/src/main.tsx';
const compositionRootLines = physicalLines(await readFile(compositionRoot, 'utf8'));
if (compositionRootLines > MAX_COMPOSITION_ROOT_LINES) {
  violations.push(
    `${compositionRoot}: ${compositionRootLines} lines (composition roots may use at most ${MAX_COMPOSITION_ROOT_LINES})`,
  );
}

const applicationCompositionRoot = 'apps/editor/src/editor-application.ts';
const applicationCompositionLines = physicalLines(
  await readFile(applicationCompositionRoot, 'utf8'),
);
if (applicationCompositionLines > MAX_APPLICATION_COMPOSITION_LINES) {
  violations.push(
    `${applicationCompositionRoot}: ${applicationCompositionLines} lines (application composition may use at most ${MAX_APPLICATION_COMPOSITION_LINES})`,
  );
}

if (violations.length > 0) {
  console.error('Editor architecture limits failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Editor architecture limits passed for ${files.length} production TS/CSS files (maximum ${MAX_PRODUCTION_LINES} lines).`,
  );
}
