type Props = {
  scaleCents: number[];
  activeDegree: number | null; // 0..11 or null
};

const SARGAM = ["Sa", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];

// Dots and labels are two grids with the SAME column count, so every label sits
// directly under its dot regardless of how many degrees the scale has.
export function PitchLadder({ scaleCents, activeDegree }: Props) {
  const cols = { gridTemplateColumns: `repeat(${scaleCents.length}, 1fr)` };
  return (
    <div title="Pitch ladder: each column is a scale degree; the lit column is the note sounding now.">
      <div className="ladder" style={cols}>
        {scaleCents.map((_, i) => (
          <div key={i} className="dot-cell">
            <div
              className={"dot" + (i === activeDegree ? " lit" : "")}
              style={{ height: `${30 + i * 6}px` }}
            />
          </div>
        ))}
      </div>
      <div className="ladder-labels" style={cols}>
        {scaleCents.map((_, i) => (
          <div key={i} className="deg-label">
            {SARGAM[i] ?? i}
          </div>
        ))}
      </div>
    </div>
  );
}
