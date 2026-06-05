type EditorShareCodec = "plain" | "gzip";
type NodeBufferValue = Uint8Array & {
  toString: (encoding: "base64url") => string;
};
type NodeBufferConstructor = {
  from: (value: string | Uint8Array, encoding?: "base64url") => NodeBufferValue;
};

export type EncodeEditorSharePayloadOptions = {
  maxBytes?: number;
};

export class EditorSharePayloadTooLargeError extends Error {
  byteLength: number;
  maxBytes: number;

  constructor(byteLength: number, maxBytes: number) {
    super(`Editor share payload is ${byteLength} bytes, which exceeds the ${maxBytes} byte limit.`);
    this.name = "EditorSharePayloadTooLargeError";
    this.byteLength = byteLength;
    this.maxBytes = maxBytes;
  }
}

export function editorShareTokenFromUrl(url: string, param = "share"): string | null {
  try {
    return new URL(url, "http://localhost").searchParams.get(param);
  } catch {
    return null;
  }
}

export function editorShareUrl(
  origin: string,
  path: string,
  token: string,
  param = "share",
): string {
  const url = new URL(path, origin);
  url.searchParams.set(param, token);
  return url.toString();
}

export async function encodeEditorSharePayload(
  payload: unknown,
  options: EncodeEditorSharePayloadOptions = {},
): Promise<string> {
  const json = JSON.stringify(payload);
  const jsonBytes = utf8Bytes(json);
  const compressedBytes = await compressBytes(jsonBytes);
  const codec: EditorShareCodec =
    compressedBytes && compressedBytes.byteLength + 24 < jsonBytes.byteLength ? "gzip" : "plain";
  const bytes = codec === "gzip" && compressedBytes ? compressedBytes : jsonBytes;
  if (options.maxBytes !== undefined && bytes.byteLength > options.maxBytes) {
    throw new EditorSharePayloadTooLargeError(bytes.byteLength, options.maxBytes);
  }
  return `${codec}.${bytesToBase64Url(bytes)}`;
}

export async function decodeEditorSharePayload<T = unknown>(token: string): Promise<T> {
  const separator = token.indexOf(".");
  if (separator === -1) {
    throw new Error("Editor share token is invalid");
  }

  const codec = token.slice(0, separator);
  const encoded = token.slice(separator + 1);
  if (codec !== "plain" && codec !== "gzip") {
    throw new Error("Editor share token uses an unknown encoding");
  }

  let bytes: Uint8Array;
  try {
    bytes = base64UrlToBytes(encoded);
  } catch {
    throw new Error("Editor share token is invalid");
  }

  const decodedBytes = codec === "gzip" ? await decompressBytes(bytes) : bytes;
  try {
    return JSON.parse(utf8Text(decodedBytes)) as T;
  } catch {
    throw new Error("Editor share token is invalid");
  }
}

async function compressBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") {
    return null;
  }

  try {
    const stream = new Response(bytesBody(bytes)).body?.pipeThrough(new CompressionStream("gzip"));
    if (!stream) {
      return null;
    }
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function decompressBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This environment cannot open compressed editor share tokens");
  }

  try {
    const stream = new Response(bytesBody(bytes)).body?.pipeThrough(
      new DecompressionStream("gzip"),
    );
    if (!stream) {
      throw new Error("Editor share token is invalid");
    }
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error("Editor share token is invalid");
  }
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function bytesBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const nodeBuffer = getNodeBufferConstructor();
  if (typeof btoa === "undefined" && nodeBuffer) {
    return nodeBuffer.from(bytes).toString("base64url");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const nodeBuffer = getNodeBufferConstructor();
  if (typeof atob === "undefined" && nodeBuffer) {
    return new Uint8Array(nodeBuffer.from(value, "base64url"));
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4 || 4)) % 4)}`;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getNodeBufferConstructor(): NodeBufferConstructor | null {
  const candidate = (globalThis as { Buffer?: unknown }).Buffer;
  if (
    typeof candidate === "function" &&
    "from" in candidate &&
    typeof candidate.from === "function"
  ) {
    return candidate as NodeBufferConstructor;
  }
  return null;
}
