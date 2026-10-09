import type { MessageKey } from "@/i18n/I18nProvider";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Do not display Rust/English validation failures as UI copy. */
export function explainPublishError(error: unknown, t: Translate): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/\b409\b|already.*publish|duplicate.*hash/i.test(raw)) return t("hubPublish.duplicate");
  if (/too large|size limit|32 mib|32 mb|File too large/i.test(raw)) return t("p2p.fileTooLarge");
  if (/\bx\b|\by\b|coordinate|finite|position|timeline/i.test(raw)) return t("hubPublish.invalidCoordinates");
  if (/image|icon|base64|raster/i.test(raw)) return t("hubPublish.invalidImage");
  if (/creator|parent|hierarchy|identity|duplicate id|unknown unit/i.test(raw)) return t("hubPublish.invalidCreator");
  if (/title/i.test(raw)) return t("hubPublish.titleRequired");
  if (/not signed in|unauthori[sz]ed|401/i.test(raw)) return t("hubPublish.loginRequired");
  if (/network|dial|connect|unreachable|timeout|timed out/i.test(raw)) return t("hubPublish.networkFailed");
  return t("hubPublish.invalid");
}
