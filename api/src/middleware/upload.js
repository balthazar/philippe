import multer from 'multer'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff'])

// Memory storage, because every file is re-encoded by sharp before it touches
// disk. Nothing the client sent is ever written verbatim.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new UploadTypeError('unsupported file type')),
})

export class UploadTypeError extends Error {
  constructor(message) { super(message); this.status = 400 }
}
