const STORAGE_KEY = "agredaParkingUiState";
const DEFAULT_CENTER = [40.4168, -3.7038];
const DEFAULT_PIN_COLOR = "#0f766e";

const loginView = document.querySelector("#loginView");
const dashboardView = document.querySelector("#dashboardView");
const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const signupButton = document.querySelector("#signupButton");
const loginNote = document.querySelector("#loginNote");
const usernameInput = document.querySelector("#usernameInput");
const passwordInput = document.querySelector("#passwordInput");
const sessionUser = document.querySelector("#sessionUser");
const logoutButton = document.querySelector("#logoutButton");
const addCarButton = document.querySelector("#addCarButton");
const editCarButton = document.querySelector("#editCarButton");
const saveSpotButton = document.querySelector("#saveSpotButton");
const saveSpotButtonText = document.querySelector("#saveSpotButtonText");
const findCarButton = document.querySelector("#findCarButton");
const findCarButtonText = document.querySelector("#findCarButtonText");
const carForm = document.querySelector("#carForm");
const carFormTitle = document.querySelector("#carFormTitle");
const carNameInput = document.querySelector("#carNameInput");
const carImageInput = document.querySelector("#carImageInput");
const pinColorInput = document.querySelector("#pinColorInput");
const pinColorValue = document.querySelector("#pinColorValue");
const cancelCarButton = document.querySelector("#cancelCarButton");
const saveCarButton = document.querySelector("#saveCarButton");
const deleteCarButton = document.querySelector("#deleteCarButton");
const carsList = document.querySelector("#carsList");
const carCount = document.querySelector("#carCount");
const statusBar = document.querySelector("#statusBar");
const selectedCarName = document.querySelector("#selectedCarName");
const spotDetails = document.querySelector("#spotDetails");
const carCardTemplate = document.querySelector("#carCardTemplate");

let map;
let spotMarker;
let accuracyCircle;
let editingCarId = null;
let authBusy = false;
let carBusy = false;
let spotBusy = false;

const state = {
  user: null,
  cars: [],
  selectedCarId: loadSelectedCarId(),
};

initSession();

function loadSelectedCarId() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))?.selectedCarId || null;
  } catch {
    return null;
  }
}

function saveUiState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedCarId: state.selectedCarId }));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Error de servidor.");
  }

  return data;
}

async function initSession() {
  try {
    const data = await apiRequest("/api/me");
    state.user = data.user;
    await loadCars();
    showDashboard();
  } catch {
    showLogin();
  }
}

async function loadCars() {
  const data = await apiRequest("/api/cars");
  state.cars = data.cars.map(normalizeCar);
  if (!state.cars.some((car) => car.id === state.selectedCarId)) {
    state.selectedCarId = state.cars[0]?.id || null;
    saveUiState();
  }
}

function normalizeCar(car) {
  return {
    id: car.id,
    name: car.name || "Coche",
    image: car.image || "",
    pinColor: isValidColor(car.pinColor) ? car.pinColor : DEFAULT_PIN_COLOR,
    spot: car.spot || null,
  };
}

function isValidColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "");
}

function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  sessionUser.textContent = state.user?.username || "";
  renderCars();
  requestAnimationFrame(() => {
    initMap();
    refreshMapSize();
  });
}

function showLogin() {
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
  loginNote.textContent = "Tu cuenta guarda coches y ubicaciones en la base de datos.";
  usernameInput.focus();
}

function initMap() {
  if (map) {
    refreshMapSize();
    updateMapForSelectedCar();
    return;
  }

  map = L.map("map", {
    zoomControl: false,
  }).setView(DEFAULT_CENTER, 13);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    subdomains: "abcd",
  }).addTo(map);

  updateMapForSelectedCar();
  map.whenReady(refreshMapSize);
}

function refreshMapSize() {
  if (!map) {
    return;
  }

  map.invalidateSize({ pan: false });
  setTimeout(() => map.invalidateSize({ pan: false }), 150);
}

function renderCars() {
  if (!state.selectedCarId && state.cars.length > 0) {
    state.selectedCarId = state.cars[0].id;
    saveUiState();
  }

  carsList.replaceChildren();
  carCount.textContent = String(state.cars.length);
  editCarButton.disabled = !getSelectedCar();

  if (state.cars.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-cars";
    empty.textContent = "No hay coches. Pulsa + para anadir el primero.";
    carsList.append(empty);
  }

  state.cars.forEach((car) => {
    const node = carCardTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".car-image");
    const fallback = node.querySelector(".fallback-car");
    const name = node.querySelector(".car-name");
    const spot = node.querySelector(".car-spot");
    const swatch = node.querySelector(".pin-swatch");

    node.dataset.carId = car.id;
    node.classList.toggle("active", car.id === state.selectedCarId);
    image.src = car.image || "";
    image.alt = car.image ? `Imagen de ${car.name}` : "";
    fallback.classList.toggle("hidden", Boolean(car.image));
    name.textContent = car.name;
    spot.textContent = car.spot ? formatSpotShort(car.spot) : "Sin spot guardado";
    swatch.style.backgroundColor = car.pinColor || DEFAULT_PIN_COLOR;

    node.addEventListener("click", () => {
      state.selectedCarId = car.id;
      saveUiState();
      renderCars();
      updateMapForSelectedCar();
      setStatus(`Coche seleccionado: ${car.name}.`, "success");
    });

    carsList.append(node);
  });

  updateSelectedInfo();
  updateActionAvailability();
}

function updateSelectedInfo() {
  const car = getSelectedCar();
  selectedCarName.textContent = car?.name || "Sin coche seleccionado";
  spotDetails.textContent = car
    ? car.spot
      ? formatSpotLong(car.spot)
      : "Todavia no hay coordenadas guardadas."
    : "Anade un coche con el boton +.";
}

function updateMapForSelectedCar() {
  if (!map) {
    return;
  }

  const car = getSelectedCar();
  clearMapLayers();

  if (car?.spot) {
    const point = [car.spot.lat, car.spot.lng];
    const pinColor = car.pinColor || DEFAULT_PIN_COLOR;
    spotMarker = L.marker(point, {
      draggable: true,
      icon: createPinIcon(pinColor),
    })
      .addTo(map)
      .bindPopup(`${escapeHtml(car.name)}<br>${formatSpotShort(car.spot)}`);
    spotMarker.on("dragstart", () => {
      setStatus("Mueve el pin y sueltalo para ajustar el spot.");
    });
    spotMarker.on("dragend", async (event) => {
      const position = event.target.getLatLng();
      await saveSpotForCar(car, {
        lat: position.lat,
        lng: position.lng,
        accuracy: car.spot?.accuracy || 20,
      });
    });
    accuracyCircle = L.circle(point, {
      radius: car.spot.accuracy || 20,
      color: pinColor,
      fillColor: pinColor,
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(map);
    map.setView(point, 17);
    spotMarker.openPopup();
  } else {
    map.setView(DEFAULT_CENTER, 13);
  }

  updateSelectedInfo();
}

function clearMapLayers() {
  if (spotMarker) {
    map.removeLayer(spotMarker);
    spotMarker = null;
  }

  if (accuracyCircle) {
    map.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }
}

function getSelectedCar() {
  return state.cars.find((car) => car.id === state.selectedCarId) || null;
}

function setStatus(message, type = "") {
  statusBar.textContent = message;
  statusBar.classList.remove("success", "error");
  if (type) {
    statusBar.classList.add(type);
  }
}

function setButtonBusy(button, isBusy, busyText) {
  if (!button) {
    return;
  }

  if (isBusy) {
    if (!button.dataset.idleHtml) {
      button.dataset.idleHtml = button.innerHTML;
    }
    button.textContent = busyText;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    return;
  }

  button.innerHTML = button.dataset.idleHtml || button.innerHTML;
  delete button.dataset.idleHtml;
  button.disabled = false;
  button.removeAttribute("aria-busy");
}

function updateActionAvailability() {
  const car = getSelectedCar();
  const hasCar = Boolean(car);
  const hasSpot = Boolean(car?.spot);
  saveSpotButton.disabled = spotBusy || !hasCar;
  saveSpotButtonText.textContent = spotBusy ? "Guardando..." : "Guardar spot";
  findCarButton.disabled = spotBusy || !hasSpot;
  findCarButtonText.textContent = spotBusy ? "Guardando..." : hasSpot ? "Encontrar" : "Sin spot";
  editCarButton.disabled = carBusy || !hasCar;
  addCarButton.disabled = carBusy;
}

function formatSpotShort(spot) {
  return `${Number(spot.lat).toFixed(5)}, ${Number(spot.lng).toFixed(5)}`;
}

function formatSpotLong(spot) {
  const savedAt = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(spot.savedAt));
  return `${formatSpotShort(spot)} - guardado ${savedAt}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function createPinIcon(color) {
  const safeColor = isValidColor(color) ? color : DEFAULT_PIN_COLOR;
  return L.divIcon({
    className: "parking-pin",
    html: `<svg viewBox="0 0 36 48" aria-hidden="true"><path fill="${safeColor}" d="M18 47S4 31.5 4 18a14 14 0 1 1 28 0c0 13.5-14 29-14 29Z"/><circle cx="18" cy="18" r="6" fill="#fff"/></svg>`,
    iconSize: [36, 48],
    iconAnchor: [18, 46],
    popupAnchor: [0, -44],
  });
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("No se pudo leer la imagen.")));
    reader.readAsDataURL(file);
  });
}

async function saveCurrentLocation() {
  if (spotBusy) {
    return;
  }

  const car = getSelectedCar();
  if (!car) {
    setStatus("Anade o selecciona un coche antes de guardar el spot.", "error");
    return;
  }

  if (!("geolocation" in navigator)) {
    setStatus("Este navegador no permite obtener la ubicacion GPS.", "error");
    return;
  }

  spotBusy = true;
  updateActionAvailability();
  saveSpotButtonText.textContent = "Localizando...";
  setStatus("Obteniendo ubicacion GPS...");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      await saveSpotForCar(car, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy || 20),
      });
    },
    (error) => {
      const message =
        error.code === error.PERMISSION_DENIED
          ? "Permite el acceso a la ubicacion para guardar el spot."
          : "No se pudo obtener la ubicacion GPS. Intentalo de nuevo.";
      setStatus(message, "error");
      spotBusy = false;
      updateActionAvailability();
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    },
  );
}

async function saveSpotForCar(car, spot) {
  try {
    spotBusy = true;
    updateActionAvailability();
    setStatus("Guardando spot...");
    const data = await apiRequest("/api/cars", {
      method: "PATCH",
      body: JSON.stringify({ id: car.id, action: "spot", spot }),
    });
    replaceCar(data.car);
    renderCars();
    updateMapForSelectedCar();
    setStatus(`Spot guardado para ${data.car.name}.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
    updateMapForSelectedCar();
  } finally {
    spotBusy = false;
    updateActionAvailability();
  }
}

function openSelectedCarInMaps() {
  const car = getSelectedCar();
  if (!car) {
    setStatus("Selecciona un coche antes de buscarlo.", "error");
    return;
  }

  if (!car.spot) {
    setStatus(`Todavia no has guardado un spot para ${car.name}.`, "error");
    return;
  }

  const destination = `${car.spot.lat},${car.spot.lng}`;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  setStatus(`Abriendo Maps para ${car.name}.`, "success");
}

function replaceCar(updatedCar) {
  const car = normalizeCar(updatedCar);
  const index = state.cars.findIndex((item) => item.id === car.id);
  if (index >= 0) {
    state.cars[index] = car;
  } else {
    state.cars.push(car);
  }
  state.selectedCarId = car.id;
  saveUiState();
}

function openCarForm(mode) {
  const car = mode === "edit" ? getSelectedCar() : null;
  editingCarId = car?.id || null;
  carFormTitle.textContent = car ? "Editar coche" : "Anadir coche";
  deleteCarButton.classList.toggle("hidden", !car);
  carNameInput.value = car?.name || "";
  pinColorInput.value = car?.pinColor || DEFAULT_PIN_COLOR;
  pinColorValue.textContent = pinColorInput.value;
  carImageInput.value = "";
  carForm.classList.remove("hidden");
  carNameInput.focus();
}

function closeCarForm() {
  editingCarId = null;
  carForm.reset();
  pinColorInput.value = DEFAULT_PIN_COLOR;
  pinColorValue.textContent = DEFAULT_PIN_COLOR;
  carForm.classList.add("hidden");
  deleteCarButton.classList.add("hidden");
}

async function submitAuth(path) {
  if (authBusy) {
    return;
  }

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    setLoginMessage("Introduce usuario y contrasena.");
    return;
  }

  try {
    authBusy = true;
    const isSignup = path.includes("signup");
    setButtonBusy(loginButton, true, isSignup ? "Esperando..." : "Entrando...");
    setButtonBusy(signupButton, true, isSignup ? "Creando..." : "Esperando...");
    usernameInput.disabled = true;
    passwordInput.disabled = true;
    setLoginMessage(isSignup ? "Creando cuenta..." : "Iniciando sesion...");
    const data = await apiRequest(path, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    state.user = data.user;
    passwordInput.value = "";
    await loadCars();
    showDashboard();
    setStatus(`Sesion iniciada como ${data.user.username}.`, "success");
  } catch (error) {
    setLoginMessage(error.message);
  } finally {
    authBusy = false;
    setButtonBusy(loginButton, false);
    setButtonBusy(signupButton, false);
    usernameInput.disabled = false;
    passwordInput.disabled = false;
  }
}

function setLoginMessage(message) {
  loginNote.textContent = message;
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth("/api/login");
});

signupButton.addEventListener("click", () => {
  submitAuth("/api/signup");
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  logoutButton.setAttribute("aria-busy", "true");
  try {
    await apiRequest("/api/logout", { method: "POST", body: "{}" });
  } catch {
    // La sesion local se limpia igualmente aunque falle la peticion.
  }
  state.user = null;
  state.cars = [];
  state.selectedCarId = null;
  saveUiState();
  passwordInput.value = "";
  logoutButton.disabled = false;
  logoutButton.removeAttribute("aria-busy");
  showLogin();
});

addCarButton.addEventListener("click", () => {
  openCarForm("add");
});

editCarButton.addEventListener("click", () => {
  if (!getSelectedCar()) {
    setStatus("Anade un coche antes de editar.", "error");
    return;
  }
  openCarForm("edit");
});

cancelCarButton.addEventListener("click", () => {
  closeCarForm();
});

carForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (carBusy) {
    return;
  }

  const name = carNameInput.value.trim() || `Coche ${state.cars.length + 1}`;
  const image = await readImageAsDataUrl(carImageInput.files?.[0]);
  const pinColor = isValidColor(pinColorInput.value) ? pinColorInput.value : DEFAULT_PIN_COLOR;
  const body = editingCarId
    ? { id: editingCarId, action: "details", name, image, pinColor }
    : { name, image, pinColor };

  try {
    carBusy = true;
    updateActionAvailability();
    setButtonBusy(saveCarButton, true, "Guardando...");
    setButtonBusy(cancelCarButton, true, "Espera...");
    deleteCarButton.disabled = true;
    setStatus("Guardando coche...");
    const data = await apiRequest("/api/cars", {
      method: editingCarId ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    replaceCar(data.car);
    closeCarForm();
    renderCars();
    updateMapForSelectedCar();
    setStatus(`${data.car.name} guardado.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    carBusy = false;
    setButtonBusy(saveCarButton, false);
    setButtonBusy(cancelCarButton, false);
    deleteCarButton.disabled = false;
    updateActionAvailability();
  }
});

deleteCarButton.addEventListener("click", async () => {
  if (carBusy) {
    return;
  }

  const car = editingCarId ? state.cars.find((item) => item.id === editingCarId) : null;
  if (!car) {
    return;
  }

  const shouldDelete = window.confirm(`Borrar ${car.name}?`);
  if (!shouldDelete) {
    return;
  }

  try {
    carBusy = true;
    updateActionAvailability();
    setButtonBusy(deleteCarButton, true, "Borrando...");
    setButtonBusy(saveCarButton, true, "Espera...");
    setButtonBusy(cancelCarButton, true, "Espera...");
    setStatus("Borrando coche...");
    await apiRequest(`/api/cars?id=${encodeURIComponent(car.id)}`, {
      method: "DELETE",
      body: "{}",
    });
    state.cars = state.cars.filter((item) => item.id !== car.id);
    state.selectedCarId = state.cars[0]?.id || null;
    saveUiState();
    closeCarForm();
    renderCars();
    updateMapForSelectedCar();
    setStatus(`${car.name} borrado.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    carBusy = false;
    setButtonBusy(deleteCarButton, false);
    setButtonBusy(saveCarButton, false);
    setButtonBusy(cancelCarButton, false);
    updateActionAvailability();
  }
});

pinColorInput.addEventListener("input", () => {
  pinColorValue.textContent = pinColorInput.value;
});

saveSpotButton.addEventListener("click", saveCurrentLocation);
findCarButton.addEventListener("click", openSelectedCarInMaps);
