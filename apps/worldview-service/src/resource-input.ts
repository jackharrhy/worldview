export const RESOURCE_KINDS = new Set(['wad', 'palette', 'fgd', 'def', 'ent', 'sprite']);

export function resourceName(value: string | null): string | null {
  if (!value || value.length > 256 || value.startsWith('/') || value.includes('\\')) return null;
  if (value.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return value;
}
