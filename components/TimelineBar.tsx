"use client";

import { useI18n } from "@/i18n/I18nProvider";

type Props = { currentTime: number; maxTime: number; onChange: (value: number) => void };

export const TimelineBar: React.FC<Props> = ({ currentTime, maxTime, onChange }) => {
  const { t } = useI18n();
  const safeMax = maxTime > 0 ? maxTime : 1;
  const safeValue = Math.min(currentTime, safeMax);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor="battle-timeline" className="sr-only">{t("playback.position")}</label>
      <input
        id="battle-timeline"
        type="range"
        min={0}
        max={safeMax}
        step={0.1}
        value={safeValue}
        aria-valuetext={t("playback.value", { current: safeValue.toFixed(1), max: safeMax.toFixed(1) })}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>0 s</span>
        <span>{safeMax.toFixed(1)} s</span>
      </div>
    </div>
  );
};
