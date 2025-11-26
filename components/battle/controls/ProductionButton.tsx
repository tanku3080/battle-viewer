"use client";

type Props = {
  disabled?: boolean;
  onStart: () => void;
};

export function ProductionButton({ disabled, onStart }: Props) {
  return (
    <button
      className="ml-4 px-4 py-2 rounded-md bg-purple-600 text-white disabled:bg-purple-900"
      disabled={disabled}
      onClick={onStart}
    >
      本番開始
    </button>
  );
}
