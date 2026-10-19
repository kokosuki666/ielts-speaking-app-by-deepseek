export interface ExtractedDocument {
  text: string;
  warnings: string[];
}

export const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls'] as const;

/** Sends the file to the local Node service, which does the heavy extraction. */
export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: await file.arrayBuffer(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    warnings?: string[];
    error?: string;
  };

  if (!res.ok || !data.text) {
    throw new Error(data.error || `文档解析失败（HTTP ${res.status}）。请确认本地服务正在运行。`);
  }
  return { text: data.text, warnings: data.warnings ?? [] };
}
