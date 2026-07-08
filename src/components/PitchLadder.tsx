type Props = {
  scaleCents: number[];
  activeDegree: number | null; // 0..11 or null
  allowedDegrees?: boolean[] | null; // raga palette — degrees outside it dim
  pulledDegree?: number | null; // conducted target (tapped), outlined
  roles?: (string | null)[] | null; // Sa / vadi / samvadi / pakad per degree
  onSelectDegree?: (i: number) => void; // tap to pull the line toward a degree
};

const SARGAM = ["Sa", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];

// Dots and labels are two grids with the SAME column count, so every label sits
// directly under its dot regardless of how many degrees the scale has.
export function PitchLadder({ scaleCents, activeDegree, allowedDegrees, pulledDegree, roles, onSelectDegree }: Props) {
  const cols = { gridTemplateColumns: `repeat(${scaleCents.length}, 1fr)` };
  const dotClass = (i: number) =>
    "dot" +
    (i === activeDegree ? " lit" : "") +
    (i === pulledDegree ? " pulled" : "") +
    (allowedDegrees && !allowedDegrees[i] ? " off" : "");
  // Accessible name for a column: name — cents — role (so a screen reader and
  // keyboard user get the same degree/cents/role feedback the readout shows).
  const label = (i: number) => {
    const role = roles?.[i];
    return `${SARGAM[i] ?? i} · ${Math.round(scaleCents[i])} cents${role ? ` · ${role}` : ""}` +
      (allowedDegrees && !allowedDegrees[i] ? " · outside raga" : "");
  };
  const activate = (i: number) => onSelectDegree?.(i);
  return (
    <div title="Pitch ladder: each column is a scale degree; the lit column is the note sounding now. Tap a column (or focus it and press Enter/Space) to pull the line toward that degree — again to release.">
      <div className="ladder" style={cols} role={onSelectDegree ? "group" : undefined} aria-label="pitch ladder — conduct by selecting a degree">
        {scaleCents.map((_, i) => (
          <div
            key={i}
            className="dot-cell"
            role={onSelectDegree ? "button" : undefined}
            tabIndex={onSelectDegree ? 0 : undefined}
            aria-label={onSelectDegree ? label(i) : undefined}
            aria-pressed={onSelectDegree ? i === pulledDegree : undefined}
            onClick={onSelectDegree ? () => activate(i) : undefined}
            onKeyDown={
              onSelectDegree
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      activate(i);
                    }
                  }
                : undefined
            }
          >
            <div className={dotClass(i)} style={{ height: `${30 + i * 6}px` }} />
          </div>
        ))}
      </div>
      <div className="ladder-labels" style={cols} aria-hidden="true">
        {scaleCents.map((_, i) => (
          <div
            key={i}
            className={"deg-label" + (i === pulledDegree ? " pulled" : "") + (i === activeDegree ? " lit" : "")}
            onClick={onSelectDegree ? () => activate(i) : undefined}
          >
            {SARGAM[i] ?? i}
          </div>
        ))}
      </div>
    </div>
  );
}
