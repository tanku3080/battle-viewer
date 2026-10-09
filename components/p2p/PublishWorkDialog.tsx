"use client";

import { useEffect, useRef, useState } from "react";
import { loadBattleJson, type RawBattleJson } from "@/utils/battle/loadBattleJson";
import { validatePublishBattle } from "@/utils/battleHub/validatePublish";
import { publishDistributedWork, type DistributedWork } from "@/utils/battleHub/works";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  onPublished: (work: DistributedWork) => void;
};

const MAX_BYTES = 32 * 1024 * 1024;

export function PublishWorkDialog({ open, onClose, onPublished }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<{ name: string; raw: string; title: string } | null>(null);
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState("");
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (pending) return;
    setSelected(null);
    setProblem("");
    setDescription("");
    setDragging(false);
    onClose();
  };

  async function validate(file?: File) {
    if (!file) return;
    setProblem("");
    setSelected(null);
    try {
      if (!file.name.toLowerCase().endsWith(".json")) throw new Error(t("hubPublish.jsonOnly"));
      if (file.size < 1 || file.size > MAX_BYTES) throw new Error(t("p2p.fileTooLarge"));
      const raw = await file.text();
      const parsed: unknown = JSON.parse(raw);
      const { title } = validatePublishBattle(parsed);
      loadBattleJson(parsed as RawBattleJson);
      setSelected({ name: file.name, raw, title });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : t("hubPublish.invalid"));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !author.trim() || pending) return;
    setPending(true);
    setProblem("");
    try {
      const work = await publishDistributedWork(selected.raw, description.trim(), author.trim());
      closeAfterSuccess();
      onPublished(work);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProblem(message.includes("409") ? t("hubPublish.duplicate") : message);
    } finally {
      setPending(false);
    }
  }

  function closeAfterSuccess() {
    setSelected(null);
    setProblem("");
    setDescription("");
    onClose();
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="hub-publish-dialog-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-gray-600 bg-[#111827] p-0 text-gray-100 shadow-2xl backdrop:bg-black/75">
      <form onSubmit={(event) => { void submit(event); }} className="space-y-4 p-5">
        <h2 id="hub-publish-dialog-title" className="text-xl font-semibold">{t("hubPublish.title")}</h2>
        <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void validate(event.dataTransfer.files[0]);
          }} role="group" aria-label={t("hubPublish.drop")}
          className={"rounded-lg border-2 border-dashed p-6 text-center " +
            (dragging ? "border-blue-400 bg-blue-950/40" : "border-gray-500")}>
          <p className="mb-3">{t("hubPublish.drop")}</p>
          <button type="button" disabled={pending} onClick={() => fileRef.current?.click()}
            className="min-h-11 rounded-md bg-gray-700 px-4 py-2 hover:bg-gray-600 disabled:opacity-40">{t("hubPublish.select")}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only"
            onChange={(event) => {
              void validate(event.target.files?.[0]);
              event.target.value = "";
            }} />
        </div>
        {selected && <div role="status" className="rounded border border-emerald-700 p-3 text-sm">
          <p>{t("hubPublish.valid")}</p><p className="break-all text-gray-300">{selected.name}</p>
          <p className="font-semibold">{selected.title}</p>
        </div>}
        <label className="block text-sm">{t("publish.author")}
          <input value={author} onChange={(event) => setAuthor(event.target.value)} required maxLength={60}
            className="mt-1 min-h-11 w-full rounded-md border border-gray-600 bg-[#0b1020] px-3" />
        </label>
        <label className="block text-sm">{t("publish.description")}
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000}
            rows={3} className="mt-1 w-full rounded-md border border-gray-600 bg-[#0b1020] p-3"
            placeholder={t("publish.descriptionPlaceholder")} />
        </label>
        {problem && <p role="alert" className="rounded border border-red-700 p-3 text-sm text-red-300">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={close}
            className="min-h-11 rounded-md bg-gray-700 px-4">{t("publish.close")}</button>
          <button type="submit" disabled={pending || !selected || !author.trim()}
            className="min-h-11 rounded-md bg-blue-600 px-4 disabled:opacity-40">
            {pending ? t("publish.submitting") : t("publish.submit")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
