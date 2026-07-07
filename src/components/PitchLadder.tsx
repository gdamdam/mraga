type Props = {
  scaleCents: number[];
  activeDegree: number | null; // 0..11 or null
  allowedDegrees?: boolean[] | null; // raga palette — degrees outside it dim
  pulledDegree?: number | null; // conducted target (tapped), outlined
  onSelectDegree?: (i: number) => void; // tap to pull the line toward a degree
};

const SARGAM = ["Sa", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];

// Dots and labels are two grids with the SAME column count, so every label sits
// directly under its dot regardless of how many degrees the scale has.
export function PitchLadder({ scaleCents, activeDegree, allowedDegrees, pulledDegree, onSelectDegree }: Props) {
  const cols = { gridTemplateColumns: `repeat(${scaleCents.length}, 1fr)` };
  const dotClass = (i: number) =>
    "dot" +
    (i === activeDegree ? " lit" : "") +
    (i === pulledDegree ? " pulled" : "") +
    (allowedDegrees && !allowedDegrees[i] ? " off" : "");
  return (
    <div title="Pitch ladder: each column is a scale degree; the lit column is the note sounding now. Tap a column to pull the line toward that degree (tap again to release).">
      <div className="ladder" style={cols}>
        {scaleCents.map((_, i) => (
          <div
            key={i}
            className="dot-cell"
            role={onSelectDegree ? "button" : undefined}
            onClick={onSelectDegree ? () => onSelectDegree(i) : undefined}
          >
            <div className={dotClass(i)} style={{ height: `${30 + i * 6}px` }} />
          </div>
        ))}
      </div>
      <div className="ladder-labels" style={cols}>
        {scaleCents.map((_, i) => (
          <div
            key={i}
            className={"deg-label" + (i === pulledDegree ? " pulled" : "")}
            onClick={onSelectDegree ? () => onSelectDegree(i) : undefined}
          >
            {SARGAM[i] ?? i}
          </div>
        ))}
      </div>
    </div>
  );
}
