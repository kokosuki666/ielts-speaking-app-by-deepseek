export interface FetchedPage {
  text: string;
  contentType: string;
  finalUrl: string;
  isHtml: boolean;
}

/** Fetches a page through the local server (browsers can't do cross-origin reads). */
export async function fetchPage(url: string): Promise<FetchedPage> {
  const target = url.trim();
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('请填写以 http:// 或 https:// 开头的网址');
  }

  const res = await fetch(`/api/fetch?url=${encodeURIComponent(target)}`);
  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
    contentType?: string;
    finalUrl?: string;
  };

  if (!res.ok || !data.text) {
    throw new Error(data.error || `抓取失败（HTTP ${res.status}）`);
  }

  const contentType = data.contentType ?? '';
  return {
    text: data.text,
    contentType,
    finalUrl: data.finalUrl || target,
    isHtml: /html|xml/i.test(contentType),
  };
}
