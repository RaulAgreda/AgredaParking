const {
  createId,
  ensureSchema,
  getCurrentUser,
  getSql,
  json,
  mapCar,
  validatePinColor,
} = require("./_lib");

module.exports = async function handler(request, response) {
  try {
    await ensureSchema();
    const user = await getCurrentUser(request);
    if (!user) {
      json(response, 401, { error: "No autenticado." });
      return;
    }

    if (request.method === "GET") {
      await listCars(user, response);
      return;
    }

    if (request.method === "POST") {
      await createCar(user, request, response);
      return;
    }

    if (request.method === "PATCH") {
      await updateCar(user, request, response);
      return;
    }

    if (request.method === "DELETE") {
      await deleteCar(user, request, response);
      return;
    }

    json(response, 405, { error: "Metodo no permitido." });
  } catch (error) {
    json(response, 500, { error: error.message || "No se pudo completar la operacion." });
  }
};

async function listCars(user, response) {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, image, pin_color, spot_lat, spot_lng, accuracy, saved_at
    FROM cars
    WHERE user_id = ${user.id}
    ORDER BY created_at ASC
  `;
  json(response, 200, { cars: rows.map(mapCar) });
}

async function createCar(user, request, response) {
  const sql = getSql();
  const name = cleanName(request.body?.name);
  const image = cleanImage(request.body?.image);
  const pinColor = validatePinColor(request.body?.pinColor);
  const id = createId("car");

  const rows = await sql`
    INSERT INTO cars (id, user_id, name, image, pin_color)
    VALUES (${id}, ${user.id}, ${name}, ${image}, ${pinColor})
    RETURNING id, name, image, pin_color, spot_lat, spot_lng, accuracy, saved_at
  `;
  json(response, 201, { car: mapCar(rows[0]) });
}

async function updateCar(user, request, response) {
  const sql = getSql();
  const id = String(request.body?.id || "");
  const action = request.body?.action || "details";

  if (action === "spot") {
    const spot = request.body?.spot || {};
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    const accuracy = Math.round(Number(spot.accuracy || 20));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      json(response, 400, { error: "Coordenadas invalidas." });
      return;
    }

    const rows = await sql`
      UPDATE cars
      SET spot_lat = ${lat},
          spot_lng = ${lng},
          accuracy = ${accuracy},
          saved_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id, name, image, pin_color, spot_lat, spot_lng, accuracy, saved_at
    `;
    sendUpdatedCar(rows, response);
    return;
  }

  const name = cleanName(request.body?.name);
  const pinColor = validatePinColor(request.body?.pinColor);
  const image = request.body?.image ? cleanImage(request.body.image) : null;
  const rows = image
    ? await sql`
        UPDATE cars
        SET name = ${name}, image = ${image}, pin_color = ${pinColor}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, name, image, pin_color, spot_lat, spot_lng, accuracy, saved_at
      `
    : await sql`
        UPDATE cars
        SET name = ${name}, pin_color = ${pinColor}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id, name, image, pin_color, spot_lat, spot_lng, accuracy, saved_at
      `;

  sendUpdatedCar(rows, response);
}

async function deleteCar(user, request, response) {
  const sql = getSql();
  const id = String(request.query?.id || request.body?.id || "");
  await sql`DELETE FROM cars WHERE id = ${id} AND user_id = ${user.id}`;
  json(response, 200, { ok: true });
}

function sendUpdatedCar(rows, response) {
  if (!rows[0]) {
    json(response, 404, { error: "Coche no encontrado." });
    return;
  }

  json(response, 200, { car: mapCar(rows[0]) });
}

function cleanName(name) {
  const clean = String(name || "").trim().slice(0, 32);
  return clean || "Coche";
}

function cleanImage(image) {
  const clean = String(image || "");
  if (clean.length > 1500000) {
    throw new Error("La imagen es demasiado grande. Usa una imagen mas pequena.");
  }
  return clean;
}
