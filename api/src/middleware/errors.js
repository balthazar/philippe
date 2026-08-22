export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status =
    err.status ||
    (err.name === 'ValidationError' ? 400
      : err.name === 'CastError' ? 400
      : err.name === 'MulterError' ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      : err.code === 11000 ? 409
      : 500)
  if (status === 500) console.error(err)
  res.status(status).json({ error: status === 500 ? 'internal error' : err.message })
}
