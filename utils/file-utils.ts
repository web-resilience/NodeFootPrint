import fs from "node:fs/promises";
import { constants as F } from 'node:fs';

type AccessResult = | {ok:true} | {ok:false,error:string};

export function reasonFromCode(code:string | undefined) {
  const reason = code || 'UNKNOWN';
  const map:Record<string, string> = {
    EACCES: 'permission_denied',
    EPERM: 'operation_not_permitted',
    ENOENT: 'file_not_found',
    ELOOP:  'symlink_loop',
    ENOTDIR:'not_a_directory'
  };
  return map[reason] || reason.toLowerCase();
}

export function extractErrorCode(error:unknown):string | undefined {
    if (typeof error === 'object' 
      && error !== null && 'code' in error
      && typeof(error as {code:unknown}).code === 'string'
    ) {
      return (error as {code:string}).code;
    }
    return undefined;
}

export async function accessReadable(file:string):Promise<AccessResult> {
  try {
    await fs.access(file,F.R_OK);
    return { ok:true };
  } catch (error) {
      const code = extractErrorCode(error);
      return { ok: false, error: reasonFromCode(code) || reasonFromCode('EACCESS') };
  }
}


export async function listDirectories(path: string): Promise<string[]> {
  const dirents = await fs.readdir(path, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

export async function listFiles(path: string): Promise<string[]> {
  const dirents = await fs.readdir(path, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => dirent.name);
}