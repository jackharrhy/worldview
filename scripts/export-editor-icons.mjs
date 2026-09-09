import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transformWithOxc } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const output = resolve('apps/editor/public/design/worldview-icons-v2.svg');
if (!process.argv.includes('--replace')) {
  try {
    await readFile(output);
    throw new Error('Sheet exists. Preserve external edits before regenerating with --replace.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const temporary = await mkdtemp(resolve('.icon-export-'));
try {
  for (const [name, extension] of [
    ['geometry-icon', 'tsx'],
    ['icon-registry', 'ts'],
  ]) {
    const source = await readFile(`apps/editor/src/components/ui/${name}.${extension}`, 'utf8');
    const compiled = (
      await transformWithOxc(source, `${name}.${extension}`, { jsx: { runtime: 'automatic' } })
    ).code;
    await writeFile(`${temporary}/${name}.mjs`, compiled);
  }
  const { GeometryIcon, hasGeometryIcon } = await import(
    pathToFileURL(`${temporary}/geometry-icon.mjs`)
  );
  const { ICON_NAMES, ICON_GLYPHS } = await import(pathToFileURL(`${temporary}/icon-registry.mjs`));
  const phosphor = JSON.parse(
    await readFile('node_modules/@phosphor-icons/web/src/regular/selection.json', 'utf8'),
  );
  const license = await readFile('node_modules/@phosphor-icons/web/LICENSE', 'utf8');
  const colors = {
    select: '#ef6461',
    rotate: '#69b5ee',
    shear: '#69b5ee',
    'viewport-3d': '#69b5ee',
    clip: '#8fbb87',
    sweep: '#8fbb87',
    scale: '#8fbb87',
  };
  const columns = 8,
    cellWidth = 144,
    cellHeight = 108;
  const height = 100 + Math.ceil(ICON_NAMES.length / columns) * cellHeight;
  const cells = ICON_NAMES.map((name, index) => {
    let geometry;
    if (hasGeometryIcon(name)) {
      geometry = renderToStaticMarkup(createElement(GeometryIcon, { name }))
        .replace(/<svg[^>]*>/, '')
        .replace('</svg>', '')
        .replaceAll('class="geometry-accent"', `color="${colors[name] ?? '#efb45f'}"`);
      geometry = `<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${geometry}</g>`;
    } else {
      const glyph = phosphor.icons.find((entry) =>
        entry.properties.name.split(', ').includes(ICON_GLYPHS[name]),
      );
      if (!glyph) throw new Error(`No SVG path for ${name}`);
      geometry = `<g fill="currentColor" transform="scale(0.0234375)">${glyph.icon.paths.map((path) => `<path d="${path}"/>`).join('')}</g>`;
    }
    const x = (index % columns) * cellWidth,
      y = 100 + Math.floor(index / columns) * cellHeight;
    return `<g id="icon-${name}" inkscape:groupmode="layer" inkscape:label="${name}" transform="translate(${x} ${y})">
<title>${name}</title>
<g id="${name}-geometry" color="#d4d4d8" transform="translate(48 8) scale(2)">${geometry}</g>
<text x="72" y="80" text-anchor="middle" fill="#a1a1aa" font-family="sans-serif" font-size="11">${name}</text>
</g>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="1152" height="${height}" viewBox="0 0 1152 ${height}">
<title>Worldview icons — V2 working sheet</title>
<metadata>Original Worldview geometry glyphs: MIT. Utility glyphs: Phosphor Icons 2.1.2, MIT.\n${license.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</metadata>
<g id="sheet-background" inkscape:groupmode="layer" inkscape:label="Background and heading"><rect width="1152" height="${height}" fill="#18181b"/><text x="24" y="38" fill="#fafafa" font-family="sans-serif" font-size="20">Worldview / Icons V2</text><text x="24" y="65" fill="#a1a1aa" font-family="sans-serif" font-size="12">24-unit grid · 1.5-unit structure · named, editable groups · geometry shown at 2×</text></g>
${cells.join('\n')}
</svg>\n`;
  await writeFile(output, svg);
  console.log(`Exported ${ICON_NAMES.length} editable icons to ${output}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
