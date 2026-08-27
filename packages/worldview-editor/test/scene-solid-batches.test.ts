import { describe, expect, it } from 'vitest';
import { createStarterDocument, findBrush, translateBrush } from '../src/core/index.js';
import { brushSolidSignature } from '../src/render/scene-solid-batches.js';

describe('solid batch cache signatures', () => {
  it('distinguishes transient drag previews that share the same next revision', () => {
    const document = createStarterDocument();
    const brush = findBrush(document, document.entities[0]!.brushes[0]!.id)!;
    const firstPreview = translateBrush(brush, [16, 0, 0]);
    const laterPreview = translateBrush(brush, [32, 0, 0]);

    expect(firstPreview.revision).toBe(laterPreview.revision);
    expect(brushSolidSignature(firstPreview, [0, 0, 0])).not.toBe(
      brushSolidSignature(laterPreview, [0, 0, 0]),
    );
    expect(brushSolidSignature(laterPreview, [0, 0, 0])).toBe(
      brushSolidSignature(laterPreview, [0, 0, 0]),
    );
  });
});
