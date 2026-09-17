import multer from "multer";
import path from "path";
import fs from "fs";

import { env } from "../../../config/env.js";

// Phase 0.13 — every consumer of this endpoint (vehicle/QC/job/inspection
// photos) only ever uploads images, so the allowlist is scoped to that.
// Both extension AND declared MIME type must match — neither is trusted
// alone, since both are client-controlled and can be spoofed independently;
// the upload controller additionally verifies the actual file bytes after
// multer saves it (Content-Type headers are never sufficient on their own).
// SVG is intentionally excluded: it can carry embedded <script>, and this
// directory is served statically back to the browser, so allowing it would
// reopen a stored-XSS path.
const ALLOWED_MIME_TO_EXT: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

const MAX_FILE_SIZE_BYTES = (Number(process.env.UPLOAD_MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

// Resolved once at module load: uploaded photos live on disk outside the
// repo (UPLOAD_DIR), so a redeploy/git checkout never touches them and they
// never risk getting committed. Falls back to public/uploads for setups
// that haven't configured UPLOAD_DIR yet.
export const UPLOAD_DIR = env.UPLOAD_DIR
  ? path.resolve(env.UPLOAD_DIR)
  : path.join(process.cwd(), "public/uploads");

// The configured directory may not exist yet (e.g. first run against a
// fresh external path) — multer's diskStorage does not create it.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Never derived from the client-supplied original filename beyond its
    // extension — no path-traversal surface, and the extension itself is
    // re-validated against the allowlist below before this even runs.
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())
      ? path.extname(file.originalname).toLowerCase()
      : (ALLOWED_MIME_TO_EXT[file.mimetype]?.[0] || "");
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

function fileFilter(req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowedExts = ALLOWED_MIME_TO_EXT[file.mimetype];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExts || !allowedExts.includes(ext)) {
    const err: any = new Error("Unsupported file type. Only JPEG, PNG, WEBP and GIF images are allowed.");
    err.statusCode = 400;
    return cb(err);
  }
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

export const UPLOAD_ALLOWED_MIME_TYPES = Object.keys(ALLOWED_MIME_TO_EXT);
