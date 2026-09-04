import { chmod, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

async function assertNotSymlink(path) {
  try {
    const details = await lstat(path);
    if (details.isSymbolicLink()) throw new Error(`Refusing to use symbolic link: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function ensurePrivateDirectory(path) {
  await assertNotSymlink(path);
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await chmod(path, 0o700);
}

export async function readJson(path, fallback) {
  await assertNotSymlink(path);
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error?.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
}

export async function writeJsonAtomic(path, value) {
  const directory = dirname(path);
  await ensurePrivateDirectory(directory);
  await assertNotSymlink(path);
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (process.platform !== 'win32') await chmod(temporary, 0o600);
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
