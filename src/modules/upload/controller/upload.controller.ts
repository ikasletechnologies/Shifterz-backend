import type { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';

// Phase 0.13 — verifies the file's actual bytes match a known image
// signature, independent of the client-declared Content-Type/extension
// (both already filtered at the multer layer, but neither is trustworthy on
// its own since both are attacker-controlled). No new dependency: these are
// well-known, stable magic-number prefixes for the exact formats we accept.
function matchesKnownImageSignature(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = buf.subarray(0, 4).toString('ascii') === 'GIF8';
  const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isGif || isWebp;
}

export class UploadController {
  handleUpload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const buf = await fs.readFile(req.file.path);
      if (!matchesKnownImageSignature(buf)) {
        // Extension/MIME claimed to be an image but the bytes say otherwise
        // (e.g. an executable or HTML file renamed to .jpg) — delete it and
        // reject rather than serving it back from our own origin.
        await fs.unlink(req.file.path).catch(() => null);
        res.status(400).json({ error: "File content does not match a supported image format" });
        return;
      }

      res.json({ url: `/uploads/${req.file.filename}` });
    } catch (error) {
      next(error);
    }
  };
}
