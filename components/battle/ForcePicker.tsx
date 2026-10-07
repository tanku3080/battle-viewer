"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { validateForce, type ForceDefinition } from "@/utils/battle/forces";

export default function ForcePicker({ value, forces, loading, loadError, onRetry, onChange, onCreate }: {
  value: string;
  forces: ForceDefinition[];
  loading: boolean;
  loadError: string;
  onRetry: () => void;
  onChange: (name: string) => void;
  onCreate: (force: ForceDefinition) => Promise<ForceDefinition>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef(false);
  const selection = forces.findIndex((force) => force.name === value);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previousFocus?.focus(); };
  }, [open]);

  const showDialog = () => { setCreating(false); setError(""); setOpen(true); };
  const closeDialog = () => { if (!pendingRef.current) setOpen(false); };
  const register = async (event: FormEvent) => {
    event.preventDefault();
    if (pendingRef.current) return;
    const validation = validateForce(name, color, forces);
    if (validation) { setError(validation); return; }
    pendingRef.current = true;
    setSaving(true); setError("");
    try {
      const registered = await onCreate({ name: name.trim(), color });
      onChange(registered.name);
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "登録に失敗しました");
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="mb-3">
      <label className="block text-xs text-gray-400 mb-1" htmlFor="unit-force">force</label>
      {forces.length ? (
        <select id="unit-force" value={selection >= 0 ? String(selection) : value ? "missing" : ""}
          className="w-full rounded border border-gray-600 bg-[#111827] px-3 py-2 text-sm"
          onChange={(event) => {
            if (event.target.value === "new") showDialog();
            else onChange(event.target.value === "" ? "" : forces[Number(event.target.value)]?.name ?? "");
          }}>
          <option value="">選択なし</option>
          {selection < 0 && value && <option value="missing" disabled>{value}（未登録）</option>}
          {forces.map((force, index) => <option key={force.name} value={index}>{force.name}</option>)}
          <option value="new">＋ 新しいforceを作成</option>
        </select>
      ) : (
        <button id="unit-force" type="button" onClick={showDialog} className="w-full rounded border border-gray-600 bg-[#111827] px-3 py-2 text-sm">
          ＋ 新しいforceを作成
        </button>
      )}
      {selection >= 0 && <span className="mt-1 block h-2 w-full rounded" style={{ backgroundColor: forces[selection].color }} />}
      {loading && <p className="mt-1 text-xs text-gray-400" role="status">force一覧を取得中…</p>}
      {loadError && <p className="mt-1 text-xs text-red-400" role="alert">{loadError} <button type="button" onClick={onRetry} className="underline">再取得</button></p>}
      <dialog ref={dialogRef} aria-labelledby="force-dialog-title" onCancel={(event) => { event.preventDefault(); closeDialog(); }}
        className="m-auto w-[min(30rem,90vw)] rounded-lg border border-gray-600 bg-[#0b1020] p-5 text-gray-100 backdrop:bg-black/70">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="force-dialog-title" className="font-semibold">force管理</h2>
          <button type="button" onClick={closeDialog} disabled={saving} aria-label="force管理を閉じる">×</button>
        </div>
        <ul className="mb-4 max-h-48 overflow-auto space-y-2">
          {forces.map((force) => <li key={force.name} className="flex items-center gap-2 text-sm">
            <span className="h-5 w-5 shrink-0 rounded border border-gray-500" style={{ backgroundColor: force.color }} aria-label={force.color} />
            <span className="break-all">{force.name}</span>
          </li>)}
        </ul>
        {!forces.length && <p className="mb-4 text-sm text-gray-400">登録されたforceはありません。</p>}
        {loadError && <p className="mb-4 text-xs text-red-400" role="alert">{loadError} <button type="button" onClick={onRetry} className="underline">再取得</button></p>}
        {!creating ? <button type="button" onClick={() => { setCreating(true); setName(""); setColor("#3b82f6"); setError(""); }} className="rounded bg-blue-600 px-3 py-2">＋ 新規作成</button> : (
          <form onSubmit={register} className="space-y-3">
            <label className="block text-sm">force名
              <input autoFocus required maxLength={64} value={name} disabled={saving} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded border border-gray-600 bg-[#111827] px-3 py-2" />
            </label>
            <label className="flex items-center gap-3 text-sm">カラー
              <input type="color" required value={color} disabled={saving} onChange={(event) => setColor(event.target.value)} className="h-10 w-16 cursor-pointer rounded" />
            </label>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={saving || loading} className="rounded bg-blue-600 px-4 py-2 disabled:opacity-50">{saving ? "登録中…" : "登録する"}</button>
          </form>
        )}
      </dialog>
    </div>
  );
}
