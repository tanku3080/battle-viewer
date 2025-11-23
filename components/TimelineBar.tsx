// components/TimelineBar.tsx
"use client";

type Props = {
  currentTime: number;
  maxTime: number;
  onChange: (value: number) => void;
};

export const TimelineBar: React.FC<Props> = ({
  currentTime,
  maxTime,
  onChange,
}) => {
  const safeMax = maxTime > 0 ? maxTime : 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="range"
        min={0}
        max={safeMax}
        step={0.1}
        value={Math.min(currentTime, safeMax)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>0 s</span>
        <span>{safeMax.toFixed(1)} s</span>
      </div>
    </div>
  );
};
