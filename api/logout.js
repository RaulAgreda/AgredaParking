const { clearSessionCookie, json, methodNotAllowed } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response);
    return;
  }

  clearSessionCookie(response);
  json(response, 200, { ok: true });
};
