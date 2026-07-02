import type { NodeClipboardContent } from "./canvas/node-context-actions";

export interface ClipboardContentWriterDependencies {
  clipboard?: Pick<Clipboard, "write" | "writeText">;
  fetch?: typeof fetch;
  ClipboardItem?: typeof globalThis.ClipboardItem;
}

export async function writeClipboardContent(
  content: NodeClipboardContent,
  dependencies: ClipboardContentWriterDependencies = {},
) {
  const clipboard = dependencies.clipboard ?? navigator.clipboard;

  if (content.kind === "text") {
    await clipboard.writeText(content.text);
    return;
  }

  const fetchImage = dependencies.fetch ?? fetch;
  const ClipboardItemCtor = dependencies.ClipboardItem ?? (
    typeof ClipboardItem === "undefined" ? undefined : ClipboardItem
  );

  if (!clipboard.write || !ClipboardItemCtor) {
    throw new Error("当前环境不支持复制图片");
  }

  const response = await fetchImage(content.url);

  if (!response.ok) {
    throw new Error("图片读取失败");
  }

  const sourceBlob = await response.blob();
  const imageBlob = sourceBlob.type === "image/png"
    ? sourceBlob
    : await convertImageBlobToPng(sourceBlob);

  await clipboard.write([
    new ClipboardItemCtor({
      "image/png": imageBlob,
    }),
  ]);
}

async function convertImageBlobToPng(blob: Blob): Promise<Blob> {
  const imageBitmap = await createImageBitmap(blob);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("无法创建图片复制画布");
    }

    context.drawImage(imageBitmap, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }

        reject(new Error("图片转换失败"));
      }, "image/png");
    });
  } finally {
    imageBitmap.close();
  }
}
