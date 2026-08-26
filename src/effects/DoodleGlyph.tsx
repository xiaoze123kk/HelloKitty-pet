import type { CSSProperties } from "react";
import type { DoodleGlyphId } from "./effectManifest";

interface DoodleGlyphProps {
  glyph: DoodleGlyphId;
  className?: string;
  style?: CSSProperties;
}

function GlyphPaths({ glyph }: { glyph: DoodleGlyphId }) {
  switch (glyph) {
    case "spark":
      return (
        <>
          <path d="M12 2.5c.7 4.9 2.4 7.1 7.4 8.1-4.7 1.2-6.8 3.4-7.5 8.9-.8-5.2-2.8-7.4-7.3-8.6 4.7-1 6.6-3.2 7.4-8.4Z" />
          <path d="M4.3 3.8 5 6.2M19.1 17.5l.8 2.3" />
        </>
      );
    case "heart":
      return (
        <path
          className="doodle-glyph-soft-fill"
          d="M12 20.2C8.1 17 3.8 14.2 3.8 9.2c0-3.8 4.8-5.5 8.2-1.7 3.3-3.8 8.2-2.1 8.2 1.8 0 4.8-4.3 7.8-8.2 10.9Z"
        />
      );
    case "drop":
      return (
        <path
          className="doodle-glyph-soft-fill"
          d="M12.5 3.1c1.9 4.3 5.1 7.2 5.1 11.1 0 3.3-2.5 5.8-5.8 5.8S6 17.7 6 14.4c0-3.7 3.6-7.1 6.5-11.3Z"
        />
      );
    case "anger":
      return (
        <>
          <path d="m5 3 2.2 5.1L2.8 9.5M19.2 3l-2.4 5 4.4 1.6M4.2 20.5l3-4.8-4.3-1.4M19.8 20.4l-3-4.8 4.4-1.5" />
          <path d="M8.1 9.1c2.7 1.2 5.1 1.2 7.8 0M8 14.6c2.8-1 5.4-1 8.1 0" />
        </>
      );
    case "dust":
      return (
        <>
          <path d="M3.1 16.7c-1.1-2.6.5-4.7 3.2-4.5-.5-3 2.5-5.1 5-3.2 1.2-3.3 5.8-2.8 6.3.8 3.4-.5 4.8 3.5 2.4 5.4" />
          <path d="M5.2 17.2c3.7-1.1 9.8-1.1 14-.1M8.8 20c2.3-.5 4.9-.5 7.1 0" />
        </>
      );
    case "impact":
      return (
        <path
          className="doodle-glyph-soft-fill"
          d="m12 2.6 2.1 5.5 5.6-2-3 5.1 4.7 3.5-5.9.7.3 5.9-3.8-4.5-3.8 4.5.4-5.9-5.9-.7 4.7-3.5-3-5.1 5.6 2L12 2.6Z"
        />
      );
    case "question":
      return (
        <>
          <path d="M7.6 7.7c.3-3.3 2.7-5.1 5.6-4.8 3.2.3 5 2.4 4.8 5.1-.2 2.5-1.8 3.6-3.8 4.6-1.8.9-2.4 2-2.4 3.5" />
          <path d="M11.8 20.4h.1" />
        </>
      );
    case "note":
      return (
        <>
          <path d="M10 17.4V5.2l8-1.8v11.8" />
          <path className="doodle-glyph-soft-fill" d="M10 16.8c-2.1-1.2-5.6-.1-5.8 2.1-.2 2 2.8 2.7 4.5 1.3 1-.8 1.3-1.9 1.3-3.4ZM18 14.7c-2.1-1.2-5.6-.1-5.8 2.1-.2 2 2.8 2.7 4.5 1.3 1-.8 1.3-1.9 1.3-3.4Z" />
        </>
      );
    case "moon":
      return (
        <path
          className="doodle-glyph-soft-fill"
          d="M17.8 3.6A8.8 8.8 0 1 0 20 17.8a8 8 0 0 1-8.7-12.6 8 8 0 0 1 6.5-1.6Z"
        />
      );
  }
}

export function DoodleGlyph({ glyph, className, style }: DoodleGlyphProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <g className="doodle-glyph-echo">
        <GlyphPaths glyph={glyph} />
      </g>
      <g>
        <GlyphPaths glyph={glyph} />
      </g>
    </svg>
  );
}
