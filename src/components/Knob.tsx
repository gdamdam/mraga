type Props = {
  label: string;
  lowPole: string;
  highPole: string;
  value: number;
  onChange: (v: number) => void;
};

export function Knob({ label, lowPole, highPole, value, onChange }: Props) {
  return (
    <div className="knob">
      <div style={{ fontWeight: 600, letterSpacing: 1 }}>{label}</div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="deg-label">{lowPole} ↔ {highPole}</div>
    </div>
  );
}
