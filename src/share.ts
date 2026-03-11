import { deflate } from "pako";

const BACKEND_V2_POST = "https://json.excalidraw.com/api/v2/post/";
const ENCRYPTION_KEY_BITS = 128;
const IV_LENGTH_BYTES = 12;

async function generateEncryptionKey(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: ENCRYPTION_KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
  const jwk = await window.crypto.subtle.exportKey("jwk", key);
  return jwk.k!;
}

async function encryptData(
  key: string,
  data: Uint8Array,
): Promise<{ encryptedBuffer: ArrayBuffer; iv: Uint8Array }> {
  const importedKey = await window.crypto.subtle.importKey(
    "jwk",
    { alg: "A128GCM", ext: true, k: key, key_ops: ["encrypt", "decrypt"], kty: "oct" },
    { name: "AES-GCM", length: ENCRYPTION_KEY_BITS },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(new ArrayBuffer(IV_LENGTH_BYTES));
  window.crypto.getRandomValues(iv);
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    importedKey,
    (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength),
  );
  return { encryptedBuffer, iv };
}

const VERSION_DATAVIEW_BYTES = 4;
const NEXT_CHUNK_SIZE_DATAVIEW_BYTES = 4;
const CONCAT_BUFFERS_VERSION = 1;

function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  const totalSize =
    VERSION_DATAVIEW_BYTES +
    NEXT_CHUNK_SIZE_DATAVIEW_BYTES * buffers.length +
    buffers.reduce((acc, b) => acc + b.byteLength, 0);

  const result = new Uint8Array(totalSize);
  const view = new DataView(result.buffer);
  let cursor = 0;

  view.setUint32(cursor, CONCAT_BUFFERS_VERSION);
  cursor += VERSION_DATAVIEW_BYTES;

  for (const buffer of buffers) {
    view.setUint32(cursor, buffer.byteLength);
    cursor += NEXT_CHUNK_SIZE_DATAVIEW_BYTES;
    result.set(buffer, cursor);
    cursor += buffer.byteLength;
  }

  return result;
}

async function compressAndEncrypt(
  dataBuffer: Uint8Array,
  encryptionKey: string,
): Promise<Uint8Array> {
  const fileInfo = { version: 2, compression: "pako@1", encryption: "AES-GCM" };
  const encodingMetadataBuffer = new TextEncoder().encode(JSON.stringify(fileInfo));
  const contentsMetadataBuffer = new TextEncoder().encode(JSON.stringify(null));

  const innerBuffer = concatBuffers(contentsMetadataBuffer, dataBuffer);
  const deflated = deflate(innerBuffer);
  const { encryptedBuffer, iv } = await encryptData(encryptionKey, deflated);

  return concatBuffers(encodingMetadataBuffer, iv, new Uint8Array(encryptedBuffer));
}

export async function shareToExcalidraw(sceneJSON: string): Promise<string> {
  const encryptionKey = await generateEncryptionKey();
  const payload = await compressAndEncrypt(
    new TextEncoder().encode(sceneJSON),
    encryptionKey,
  );

  const response = await fetch(BACKEND_V2_POST, {
    method: "POST",
    body: (payload.buffer as ArrayBuffer).slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  });

  if (!response.ok) {
    throw new Error(`Share failed: ${response.status}`);
  }

  const json = await response.json();
  if (!json.id) {
    throw new Error("No id returned from share backend");
  }

  return `https://excalidraw.com/#json=${json.id},${encryptionKey}`;
}
