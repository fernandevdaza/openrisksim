/** Browser download helpers. */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Ask the user for a file (returns null if cancelled). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let done = false;
    input.onchange = () => {
      done = true;
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    // "cancel" event is supported by modern browsers; resolves null so callers don't hang
    input.addEventListener("cancel", () => {
      if (!done) resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function withExtension(name: string, ext: string): string {
  const base = name.replace(/\.(xlsx|xlsm|xls|csv|ods|txt)$/i, "");
  return `${base || "libro"}${ext}`;
}
