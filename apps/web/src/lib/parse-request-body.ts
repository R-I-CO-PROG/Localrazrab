import type { NextRequest } from "next/server";

function parseJsonBody<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Пустое тело запроса");
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error("Некорректный JSON в теле запроса");
  }
}

export async function parseRequestBody<T>(
  req: NextRequest,
): Promise<{ payload: T; logo: File | null }> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const payloadRaw = form.get("payload");
    let payloadText: string | null = null;
    if (typeof payloadRaw === "string") {
      payloadText = payloadRaw;
    } else if (payloadRaw instanceof File) {
      payloadText = await payloadRaw.text();
    }
    if (!payloadText) {
      throw new Error("Missing payload in multipart request");
    }
    const logo = form.get("logo");
    return {
      payload: parseJsonBody<T>(payloadText),
      logo: logo instanceof File && logo.size > 0 ? logo : null,
    };
  }

  const text = await req.text();
  return {
    payload: parseJsonBody<T>(text),
    logo: null,
  };
}
