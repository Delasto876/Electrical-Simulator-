import type { Drawing, Rgb } from "../../reports/drawing";

const PT_TO_MM = 25.4 / 72;
const css = (c: Rgb | undefined, fallback = "currentColor") =>
  c ? `rgb(${c[0]} ${c[1]} ${c[2]})` : fallback;

/** A report Drawing as inline SVG (millimetre viewBox, scales to its container). */
export function DrawingSvg({ drawing, label }: { drawing: Drawing; label: string }) {
  return (
    <svg
      className="drawing-svg"
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      role="img"
      aria-label={label}
      style={{ aspectRatio: `${drawing.width} / ${drawing.height}` }}
    >
      <rect width={drawing.width} height={drawing.height} fill="#fff" />
      {drawing.shapes.map((s, i) => {
        const stroke = "stroke" in s ? css(s.stroke, "#141414") : undefined;
        const sw = "width" in s && typeof s.width === "number" ? s.width : 0.3;
        const dash = "dash" in s && s.dash ? "1.2 0.9" : undefined;
        switch (s.kind) {
          case "line":
            return (
              <line
                key={i}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke={stroke}
                strokeWidth={sw}
                strokeDasharray={dash}
              />
            );
          case "polyline":
            return (
              <polyline
                key={i}
                points={s.points.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={stroke}
                strokeWidth={sw}
                strokeDasharray={dash}
              />
            );
          case "rect":
            return (
              <rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={s.r}
                fill={s.fill ? css(s.fill) : "none"}
                stroke={s.stroke ? stroke : "none"}
                strokeWidth={sw}
                strokeDasharray={dash}
              />
            );
          case "circle":
            return (
              <circle
                key={i}
                cx={s.cx}
                cy={s.cy}
                r={s.r}
                fill={s.fill ? css(s.fill) : "none"}
                stroke={s.stroke ? stroke : "none"}
                strokeWidth={sw}
              />
            );
          case "text":
            return (
              <text
                key={i}
                x={s.x}
                y={s.y}
                fontSize={s.size * PT_TO_MM}
                fontWeight={s.bold ? 700 : 400}
                fontFamily="Helvetica, Arial, sans-serif"
                textAnchor={s.anchor ?? "start"}
                fill={css(s.color, "#141414")}
              >
                {s.text}
              </text>
            );
        }
      })}
    </svg>
  );
}
