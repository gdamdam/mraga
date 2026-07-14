import { vibhagStarts, type Taal, type TaalPosition } from "../taal";

type Props = {
  taal: Taal | null; // getTaal(taalId) — null hides the whole meter
  pos: TaalPosition | null; // live cycle position while playing; null = static pattern
};

// Taal position indicator: one pip per matra, grouped into vibhags, with sam,
// tali (clap) and khali (wave) marked. The pip for the current matra glows like
// the lit ladder dot. Purely a read-out of getTaal()/taalPos — no new state.
export function TaalMeter({ taal, pos }: Props) {
  if (!taal) return null;
  const starts = vibhagStarts(taal); // matra index that opens each vibhag
  const groups = taal.vibhags.map((len, gi) => {
    const start = starts[gi];
    return Array.from({ length: len }, (_, k) => start + k);
  });
  const roleOf = (m: number) => {
    // sam wins over tali/khali for its symbol; rupak's sam is also a khali.
    if (m === 0) return "sam";
    if (taal.khaliBeats.includes(m)) return "khali";
    if (taal.taliBeats.includes(m)) return "tali";
    return "beat";
  };
  const cur = pos?.matra ?? null;
  const caption = pos
    ? `${pos.matra + 1}/${taal.matras}${pos.isSam ? " · sam" : pos.isKhali ? " · khali" : pos.isVibhagStart ? " · |" : ""}`
    : `${taal.matras}-beat cycle`;

  return (
    <div className="taal-meter" title="Taal cycle — one pip per matra. ✳ sam (downbeat), ○ khali (wave/empty), | vibhag start. The glowing pip is the current beat.">
      <div className="taal-meter-label">TAAL · {taal.label}</div>
      <div className="taal-strip" role="img" aria-label={`${taal.label}, ${taal.matras} matras, ${caption}`}>
        {groups.map((matras, gi) => (
          <div className="taal-vibhag" key={gi}>
            {matras.map((m) => {
              const role = roleOf(m);
              return (
                <span
                  key={m}
                  className={
                    "taal-pip " + role + (m === cur ? " now" : "")
                  }
                  aria-hidden="true"
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="taal-caption deg-label" aria-live="polite">{caption}</div>
    </div>
  );
}
