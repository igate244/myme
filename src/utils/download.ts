// src/utils/download.ts

/**
 * JSON をファイルとして保存させる。
 * 以前は a 要素を document に追加せず、URL も即座に解放していたため、
 * ブラウザによってはダウンロードが始まらないことがあった。
 */
export const downloadJson = (fileName: string, data: unknown): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
