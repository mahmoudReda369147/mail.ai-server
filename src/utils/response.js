// src/utils/response.js
// Unified API response helpers

function ok(res, data = null, message = 'OK', meta = null) {
  return res.status(200).json({
    success: true,
    message,
    data,
    meta,
  });
}

function created(res, data = null, message = 'Created', meta = null) {
  return res.status(201).json({
    success: true,
    message,
    data,
    meta,
  });
}

function fail(res, status = 400, message = 'Bad Request', code = null, details = null, meta = null) {
  return res.status(status).json({
    success: false,
    message,
    code,
    details,
    meta,
  });
}

module.exports = {
  ok,
  created,
  fail,
};
