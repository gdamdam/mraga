type Props = {
  scaleCents: number[];
  activeDegree: number | null; // 0..11 or null
};

const SARGAM = ["Sa", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];

export function PitchLadder({ scaleCents, activeDegree }: Props) {
  return (
    <div>
      <div className="ladder">
        {scaleCents.map((_, i) => (
          <div
            key={i}
            className={"dot" + (i === activeDegree ? " lit" : "")}
            style={{ height: `${30 + i * 6}px` }}
          />
        ))}
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        {scaleCents.map((_, i) => (
          <div key={i} className="deg-label" style={{ flex: 1 }}>
            {SARGAM[i] ?? i}
          </div>
        ))}
      </div>
    </div>
  );
}
