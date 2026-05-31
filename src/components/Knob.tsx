type Props = {
  label: string;
  lowPole: string;
  highPole: string;
  value: number;
  onChange: (v: number) => void;
  title?: string; // hover tooltip explaining the control
};

export function Knob({ label, lowPole, highPole, value, onChange, title }: Props) {
  return (
    <div className="knob" title={title}>
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
