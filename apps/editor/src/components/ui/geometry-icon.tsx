import type { ReactNode } from 'react';
import type { IconName } from './icon-registry.js';

// Original Worldview geometry glyphs. Neutral structure, colored editable geometry.
const box = <path d="M4 7 15 4 21 9 10 12 4 7v11l6 3 11-4V9M10 12v9" />;
const square = <path d="M5 5h14v14H5z" />;
const handles = (
  <g className="geometry-accent" fill="currentColor" stroke="none">
    {[
      [5, 5],
      [19, 5],
      [19, 19],
      [5, 19],
    ].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" />
    ))}
  </g>
);
const glyphs: Partial<Record<IconName, ReactNode>> = {
  'viewport-3d': (
    <>
      {box}
      <path className="geometry-accent" d="m4 7 6 5 11-3M10 12v9" />
    </>
  ),
  select: (
    <>
      {box}
      <path
        className="geometry-accent"
        fill="currentColor"
        fillOpacity=".2"
        d="m3 3 8 3-4 2-1 4z"
      />
    </>
  ),
  entity: (
    <>
      {box}
      <path className="geometry-accent" d="M13 10v7m-3-3h6" />
    </>
  ),
  hull: (
    <>
      <path d="m4 8 9-4 7 7-5 9-11-3Z" />
      <g className="geometry-accent" fill="currentColor" stroke="none">
        {[
          [4, 8],
          [13, 4],
          [20, 11],
          [15, 20],
          [4, 17],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" />
        ))}
      </g>
    </>
  ),
  vertex: (
    <>
      {square}
      {handles}
    </>
  ),
  edge: (
    <>
      {square}
      <path className="geometry-accent" strokeWidth="2" d="M5 5h14" />
      <g className="geometry-accent" fill="currentColor">
        <circle cx="5" cy="5" r="1.5" />
        <circle cx="19" cy="5" r="1.5" />
      </g>
    </>
  ),
  face: (
    <>
      {box}
      <path
        className="geometry-accent"
        fill="currentColor"
        fillOpacity=".25"
        d="m10 12 11-3v8l-11 4z"
      />
    </>
  ),
  clip: (
    <>
      {box}
      <path className="geometry-accent" strokeWidth="2" d="m14 2-6 20m3-17 3-3 1 4M5 18l3 4 3-3" />
    </>
  ),
  sweep: (
    <>
      <path d="M4 12h9v9H4zM10 3h9v9M13 12l6-9M4 12l6-9" />
      <path className="geometry-accent" d="m15 17 6-6m-5 0h5v5" />
    </>
  ),
  rotate: (
    <>
      <path d="m8 9 8-2 2 8-8 2Z" />
      <path className="geometry-accent" d="M5 17a9 9 0 1 1 15-2m-1-5 1 5 3-3" />
    </>
  ),
  scale: (
    <>
      {square}
      <path className="geometry-accent" d="m8 16 12-12m-5 0h5v5" />
      <path className="geometry-accent" fill="currentColor" d="M3 17h4v4H3z" />
    </>
  ),
  shear: (
    <>
      <path d="M5 5h12v14H5z" strokeDasharray="2 2" />
      <path className="geometry-accent" d="M10 5h11l-7 14H3z" />
    </>
  ),
};

export function GeometryIcon({ name }: { readonly name: IconName }) {
  const glyph = glyphs[name];
  return glyph ? (
    <svg
      className="geometry-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {glyph}
    </svg>
  ) : null;
}
export function hasGeometryIcon(name: IconName) {
  return name in glyphs;
}
