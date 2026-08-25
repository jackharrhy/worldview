import { describe, expect, it } from 'vitest';

import {
  mapSourceFingerprint,
  parseMapSource,
  planMapSave,
  rebaseMapSource,
  type MapDocument,
} from '../src/core/index.js';

const SOURCE = [
  '// retained header',
  '{',
  '"classname" "worldspawn" // retained property comment',
  '"message" "before"',
  'editor_data',
  '{',
  '  "future" "value"',
  '}',
  '}',
  '{',
  '"classname" "light"',
  '"origin" "0 0 32"',
  '}',
  '',
].join('\n');

function replaceEntityProperties(
  document: MapDocument,
  entityIndex: number,
  properties: Readonly<Record<string, string>>,
): MapDocument {
  return {
    ...document,
    revision: document.revision + 1,
    entities: document.entities.map((entity, index) =>
      index === entityIndex ? { ...entity, properties } : entity,
    ),
  };
}

describe('source-backed map saving', () => {
  it('returns unedited source byte-for-byte', () => {
    const parsed = parseMapSource(SOURCE);
    const plan = planMapSave(parsed.document, parsed.source);

    expect(plan).toEqual({ status: 'safe', text: SOURCE, diagnostics: [] });
    expect(parsed.source.diagnostics).toMatchObject([
      { code: 'unsupported-construct', keyword: 'editor_data' },
    ]);
  });

  it('patches changed properties while retaining comments and opaque blocks', () => {
    const parsed = parseMapSource(SOURCE);
    const worldspawn = parsed.document.entities[0]!;
    const edited = replaceEntityProperties(parsed.document, 0, {
      ...worldspawn.properties,
      message: 'after',
      wad: 'base.wad;mod.wad',
    });
    const plan = planMapSave(edited, parsed.source);

    expect(plan.status).toBe('safe');
    if (plan.status !== 'safe') return;
    expect(plan.text).toContain('// retained header');
    expect(plan.text).toContain('// retained property comment');
    expect(plan.text).toContain('editor_data\n{\n  "future" "value"\n}');
    expect(plan.text).toContain('"message" "after"');
    expect(plan.text).toContain('"wad" "base.wad;mod.wad"');

    const rebased = rebaseMapSource(edited, plan.text);
    expect(rebased.originalDocument.entities[0]?.id).toBe(worldspawn.id);
    expect(planMapSave(edited, rebased)).toMatchObject({ status: 'safe', text: plan.text });
  });

  it('blocks reordering existing entities and provides a normalized copy', () => {
    const parsed = parseMapSource(SOURCE);
    const reordered = {
      ...parsed.document,
      revision: 1,
      entities: [parsed.document.entities[1]!, parsed.document.entities[0]!],
    };
    const plan = planMapSave(reordered, parsed.source);

    expect(plan).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'unsafe-source-edit' }],
    });
    if (plan.status === 'blocked') expect(plan.normalizedText).toContain('"classname" "light"');
  });

  it('fingerprints the exact opened bytes', () => {
    expect(mapSourceFingerprint(SOURCE)).toBe(mapSourceFingerprint(SOURCE));
    expect(mapSourceFingerprint(`${SOURCE}\n`)).not.toBe(mapSourceFingerprint(SOURCE));
  });
});
