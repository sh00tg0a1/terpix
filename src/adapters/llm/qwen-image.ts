// DashScope multimodal image-generation client (Qwen-Image series). The
// generator pipeline calls this to turn a sprite description into a small PNG
// which is then alpha-keyed and downsampled into a bitmap asset.

export interface QwenImageCfg {
  apiKey: string;
  /** Default qwen-image-2.0-pro. Override with cheaper/faster variants. */
  model?: string;
  /** Override the DashScope host (e.g. for proxies). */
  baseURL?: string;
  /** WxH string per DashScope spec, e.g. "1328*1328" (smallest square). */
  size?: string;
  negativePrompt?: string;
  watermark?: boolean;
  /** When true, lets DashScope expand the prompt. We keep it off for tight
   * sprites — extra words tend to add background and props. */
  promptExtend?: boolean;
  /** Injection point for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_NEGATIVE =
  '低分辨率，模糊，多个主体，多个对象，文字，水印，logo，复杂背景，复杂场景，' +
  '场景，环境，地面阴影，写实照片，过度细节，多视角，分镜，拼图，边框';

interface QwenResp {
  output?: {
    choices?: Array<{
      message?: { content?: Array<{ image?: string; text?: string }> };
    }>;
    results?: Array<{ url?: string }>;
  };
  code?: string;
  message?: string;
}

function extractImage(r: QwenResp): string | undefined {
  for (const c of r.output?.choices ?? []) {
    for (const part of c.message?.content ?? []) {
      if (part.image) return part.image;
    }
  }
  for (const res of r.output?.results ?? []) if (res.url) return res.url;
  return undefined;
}

export async function qwenGenerateImage(prompt: string, cfg: QwenImageCfg): Promise<Buffer> {
  const host = (cfg.baseURL ?? 'https://dashscope.aliyuncs.com').replace(/\/+$/, '');
  const url = `${host}/api/v1/services/aigc/multimodal-generation/generation`;
  const body = {
    model: cfg.model ?? 'qwen-image-2.0-pro',
    input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
    parameters: {
      negative_prompt: cfg.negativePrompt ?? DEFAULT_NEGATIVE,
      prompt_extend: cfg.promptExtend ?? false,
      watermark: cfg.watermark ?? false,
      size: cfg.size ?? '1328*1328',
    },
  };
  const f = cfg.fetchImpl ?? fetch;
  const r = await f(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`qwen-image ${r.status}: ${text.slice(0, 400)}`);
  }
  const data = (await r.json()) as QwenResp;
  const imgRef = extractImage(data);
  if (!imgRef) {
    throw new Error(
      `qwen-image: no image in response (code=${data.code ?? '?'} msg=${data.message ?? ''})`,
    );
  }
  if (imgRef.startsWith('data:')) {
    const b64 = imgRef.split(',', 2)[1] ?? '';
    return Buffer.from(b64, 'base64');
  }
  const imgRes = await f(imgRef);
  if (!imgRes.ok) throw new Error(`qwen-image: fetch image ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}
