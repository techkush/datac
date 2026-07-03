import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DATAC_HOME } from "./paths";

const fsp = fs.promises;

// Write a JSON store atomically (temp file + rename) so a concurrent
// reader never sees a torn/partial file.
export async function writeJsonAtomic(
  file: string,
  value: unknown,
): Promise<void> {
  await fsp.mkdir(DATAC_HOME, { recursive: true });
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${crypto.randomBytes(4).toString("hex")}.tmp`,
  );
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
  await fsp.rename(tmp, file);
}
