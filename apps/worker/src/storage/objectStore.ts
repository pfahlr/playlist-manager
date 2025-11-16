import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type WriteObjectParams = {
  body: Buffer;
  contentType: string;
  key: string;
};

export type ObjectStoreWriter = (params: WriteObjectParams) => Promise<string>;

const defaultBaseDir = resolve(process.env.EXPORT_ARTIFACT_DIR ?? './.artifacts');

let customWriter: ObjectStoreWriter | null = null;

export function configureObjectStore(writer: ObjectStoreWriter | null): void {
  customWriter = writer;
}

export async function write(body: Buffer, contentType: string, key: string): Promise<string> {
  const writer = customWriter ?? defaultWriter;
  return writer({ body, contentType, key });
}

async function defaultWriter(params: WriteObjectParams): Promise<string> {
  const targetPath = join(defaultBaseDir, params.key);
  await fs.mkdir(dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, params.body);
  return `file://${targetPath}`;
}
