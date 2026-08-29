/**
 * Public compatibility barrel for document mutations. Implementations are grouped by ownership so
 * callers can continue importing the established API without a single cross-domain mutation file.
 */
export * from './document-structure.js';
export * from './brush-transforms.js';
export * from './brush-csg.js';
export * from './texture-editing.js';
export * from './surface-editing.js';
