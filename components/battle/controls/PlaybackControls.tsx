"use client";

type PlaybackProps = {
  currentTime: number;
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function PlaybackControls({
  currentTime,
  isPlaying,
  onStart,
  onStop,
}: PlaybackProps) {
  return (
    <div className="flex gap-4 items-center">
      <button
        onClick={onStart}
        className="px-4 py-2 rounded-md bg-green-600 text-white"
      >
        START
      </button>

      <button
        onClick={onStop}
        disabled={!isPlaying}
        className="px-4 py-2 rounded-md bg-red-600 disabled:bg-red-900 text-white"
      >
        STOP
      </button>

      <span className="opacity-80 text-sm">
        現在：{currentTime.toFixed(1)} s
      </span>
    </div>
  );
}
