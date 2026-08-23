/*
 * Surface classification follows noclip.website's Common/IdTech2/Render.ts.
 * See docs/plan.md and THIRD_PARTY_NOTICES.md for the pinned source reference.
 */

import type { MaterialKind } from './types.js';

const toolNames = new Set([
  'trigger',
  'clip',
  'skip',
  'hint',
  'origin',
  'aaatrigger',
  'null',
  'nodraw',
  'invisible',
]);

export function classifyMaterial(
  name: string,
  format: 'quake-bsp29' | 'goldsrc-bsp30',
): MaterialKind {
  const lower = name.toLowerCase();
  if (lower.startsWith('__invalid_') || lower.startsWith('tools/') || toolNames.has(lower))
    return 'tool';
  if (lower.startsWith('sky')) return 'sky';
  if ((lower.startsWith('*') && lower !== '*default') || lower.startsWith('!')) return 'water';
  if (format === 'goldsrc-bsp30' && lower.startsWith('water')) return 'water';
  if (lower.startsWith('{')) return 'alpha-test';
  return 'opaque';
}
