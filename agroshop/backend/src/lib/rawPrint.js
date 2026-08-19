import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "rawPrint.ps1");

export async function sendRawToPrinter(printerName, buffer) {
  if (process.platform !== "win32") {
    throw new Error("Raw thermal printing is only supported on Windows");
  }

  const tempFilePath = path.join(
    os.tmpdir(),
    `agroshop-receipt-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`,
  );
  let commandError = null;

  try {
    await fs.writeFile(tempFilePath, buffer);
    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-PrinterName",
        printerName,
        "-FilePath",
        tempFilePath,
      ],
      { windowsHide: true, timeout: 15000 },
    );

    if (!stdout.includes("OK")) {
      throw new Error([stderr, stdout].filter(Boolean).join("\n") || "Raw print script did not confirm success");
    }
  } catch (err) {
    commandError = err;
    throw err;
  } finally {
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupErr) {
      if (!commandError) {
        throw cleanupErr;
      }
    }
  }
}
