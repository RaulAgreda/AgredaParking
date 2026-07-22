const { ensureSchema, getCurrentUser, json, methodNotAllowed } = require("./_lib");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response);
    return;
  }

  try {
    await ensureSchema();
    const user = await getCurrentUser(request);
    if (!user) {
      json(response, 401, { user: null });
      return;
    }

    json(response, 200, { user });
  } catch (error) {
    json(response, 500, { error: error.message || "No se pudo leer la sesion." });
  }
};
