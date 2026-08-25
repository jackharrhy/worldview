import { describe, expect, it } from 'vitest';

import {
  createStarterDocument,
  createSequentialIdFactory,
  mapSourceFingerprint,
  parseMapSource,
  planMapSave,
  rebaseMapSource,
  serializeMap,
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

const CLASSIC_SOURCE = [
  '// classic source must remain classic',
  '{',
  '  "classname" "worldspawn"',
  '  "message" "before"',
  '  {',
  '    ( 0 0 0 ) ( 0 64 0 ) ( 0 0 64 ) STONE 8 16 0 1 1',
  '  }',
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

  it('blocks deletion when an entity owns opaque source that cannot be reanchored', () => {
    const parsed = parseMapSource(SOURCE);
    const removedOwner: MapDocument = {
      ...parsed.document,
      revision: 1,
      entities: parsed.document.entities.slice(1),
    };

    expect(planMapSave(removedOwner, parsed.source)).toMatchObject({
      status: 'blocked',
      diagnostics: [
        {
          code: 'unsafe-source-edit',
          message: expect.stringMatching(/cannot be reanchored/),
        },
      ],
    });
  });

  it('fingerprints the exact opened bytes', () => {
    expect(mapSourceFingerprint(SOURCE)).toBe(mapSourceFingerprint(SOURCE));
    expect(mapSourceFingerprint(`${SOURCE}\n`)).not.toBe(mapSourceFingerprint(SOURCE));
  });

  it('keeps classic face syntax and CRLF bytes when an unrelated property changes', () => {
    const source = CLASSIC_SOURCE.replaceAll('\n', '\r\n');
    const parsed = parseMapSource(source);
    const edited = replaceEntityProperties(parsed.document, 0, {
      ...parsed.document.entities[0]!.properties,
      message: 'after',
    });
    const plan = planMapSave(edited, parsed.source);

    expect(parsed.document.format).toBe('quake');
    expect(plan.status).toBe('safe');
    if (plan.status !== 'safe') return;
    expect(plan.text).toContain('( 0 0 0 ) ( 0 64 0 ) ( 0 0 64 ) STONE 8 16 0 1 1\r\n');
    expect(plan.text).not.toContain('[ 0 1 0');
    expect(plan.text.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('converts classic faces only after the document format is explicitly changed', () => {
    const parsed = parseMapSource(CLASSIC_SOURCE);
    const converted = { ...parsed.document, revision: 1, format: 'valve-220' as const };
    const plan = planMapSave(converted, parsed.source);

    expect(plan.status).toBe('safe');
    if (plan.status !== 'safe') return;
    expect(plan.text).toContain('STONE [');
  });

  it('patches one changed face without normalizing sibling brushes or comments', () => {
    const starter = createStarterDocument();
    const source = serializeMap(starter).replace(
      '\n{\n"classname" "info_player_start"',
      '\n// untouched entity boundary\n{\n"classname" "info_player_start"',
    );
    const parsed = parseMapSource(source);
    const edited: MapDocument = {
      ...parsed.document,
      revision: 1,
      entities: parsed.document.entities.map((entity, entityIndex) =>
        entityIndex === 0
          ? {
              ...entity,
              brushes: entity.brushes.map((brush, brushIndex) =>
                brushIndex === 0
                  ? {
                      ...brush,
                      revision: brush.revision + 1,
                      faces: brush.faces.map((face, faceIndex) =>
                        faceIndex === 0 ? { ...face, material: 'CHANGED_FACE' } : face,
                      ),
                    }
                  : brush,
              ),
            }
          : entity,
      ),
    };
    const plan = planMapSave(edited, parsed.source);

    expect(plan.status).toBe('safe');
    if (plan.status !== 'safe') return;
    expect(plan.text).toContain('CHANGED_FACE');
    expect(plan.text).toContain('// untouched entity boundary');
    const untouchedFace = serializeMap(starter).split('\n')[10]!;
    expect(plan.text).toContain(untouchedFace);
  });

  it('source-patches inserted and removed nodes but blocks retained brush reordering', () => {
    const parsed = parseMapSource(serializeMap(createStarterDocument()));
    const insertedIds = createSequentialIdFactory('source-insert');
    const worldspawn = parsed.document.entities[0]!;
    const withoutBrush: MapDocument = {
      ...parsed.document,
      revision: 1,
      entities: [
        { ...worldspawn, brushes: worldspawn.brushes.slice(1) },
        ...parsed.document.entities.slice(1),
      ],
    };
    const removed = planMapSave(withoutBrush, parsed.source);
    expect(removed.status).toBe('safe');

    const inserted: MapDocument = {
      ...parsed.document,
      revision: 1,
      entities: [
        ...parsed.document.entities,
        {
          id: insertedIds.entity(),
          properties: { classname: 'info_null', targetname: 'pasted' },
          brushes: [],
        },
      ],
    };
    const added = planMapSave(inserted, parsed.source);
    expect(added.status).toBe('safe');
    if (added.status === 'safe') expect(added.text).toContain('"targetname" "pasted"');

    const reordered: MapDocument = {
      ...parsed.document,
      revision: 1,
      entities: [
        { ...worldspawn, brushes: worldspawn.brushes.toReversed() },
        ...parsed.document.entities.slice(1),
      ],
    };
    expect(planMapSave(reordered, parsed.source)).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'unsafe-source-edit' }],
    });
  });

  it('defaults new documents to Valve 220', () => {
    expect(createStarterDocument().format).toBe('valve-220');
  });
});
