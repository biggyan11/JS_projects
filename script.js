/* =========================================================
   Weatherly — Live Weather Intelligence
   ========================================================= */

// 🔑 PUT YOUR OPENWEATHERMAP API KEY HERE
const API_KEY = "df50ac4c42f71b819671bd88844859f4";

const BASE_URL = "https://api.openweathermap.org/data/2.5";

// ---- State ----
let currentUnit = "C"; // "C" or "F"
let lastData = null; // { current, forecast } in metric, cached for unit conversion

// ---- DOM references ----
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const locationBtn = document.getElementById("locationBtn");
const errorMessage = document.getElementById("errorMessage");
const loader = document.getElementById("loader");
const content = document.getElementById("content");
const emptyState = document.getElementById("emptyState");
const unitToggle = document.getElementById("unitToggle");
const bgLayer = document.getElementById("bgLayer");

// =========================================================
// Core fetch functions
// =========================================================

async function getWeather(city) {
  if (!city || !city.trim()) return;

  showLoader();
  hideError();

  try {
    const currentUrl = `${BASE_URL}/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
    const currentRes = await fetch(currentUrl);

    if (!currentRes.ok) {
      if (currentRes.status === 404) {
        throw new Error("City not found. Please check the spelling and try again.");
      }
      if (currentRes.status === 401) {
        throw new Error("Invalid API key. Add your OpenWeatherMap key in script.js.");
      }
      throw new Error("Unable to fetch weather data right now. Please try again.");
    }

    const currentData = await currentRes.json();

    const forecastUrl = `${BASE_URL}/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
    const forecastRes = await fetch(forecastUrl);
    if (!forecastRes.ok) throw new Error("Unable to fetch forecast data right now.");
    const forecastData = await forecastRes.json();

    lastData = { current: currentData, forecast: forecastData };
    localStorage.setItem("weatherly-last-city", currentData.name);

    displayWeather(currentData);
    displayForecast(forecastData);
    updateBackground(currentData);
    showContent();
  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
    hideContent();
  } finally {
    hideLoader();
  }
}

async function getWeatherByCoords(lat, lon) {
  showLoader();
  hideError();

  try {
    const currentUrl = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
    const currentRes = await fetch(currentUrl);
    if (!currentRes.ok) throw new Error("Unable to fetch weather for your location.");
    const currentData = await currentRes.json();

    const forecastUrl = `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
    const forecastRes = await fetch(forecastUrl);
    if (!forecastRes.ok) throw new Error("Unable to fetch forecast for your location.");
    const forecastData = await forecastRes.json();

    lastData = { current: currentData, forecast: forecastData };
    localStorage.setItem("weatherly-last-city", currentData.name);
    cityInput.value = currentData.name;

    displayWeather(currentData);
    displayForecast(forecastData);
    updateBackground(currentData);
    showContent();
  } catch (err) {
    showError(err.message || "Could not retrieve your location's weather.");
    hideContent();
  } finally {
    hideLoader();
  }
}

function getCurrentLocation() {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser.");
    return;
  }

  hideError();
  locationBtn.classList.add("loading");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      getWeatherByCoords(latitude, longitude);
      locationBtn.classList.remove("loading");
    },
    () => {
      showError("Unable to retrieve your location. Please allow location access.");
      locationBtn.classList.remove("loading");
    }
  );
}

// =========================================================
// Rendering
// =========================================================

function displayWeather(data) {
  document.getElementById("cityName").textContent = `${data.name}, ${data.sys.country}`;
  document.getElementById("dateTime").textContent = formatDateTime(data.dt, data.timezone);

  const condition = data.weather[0];
  document.getElementById("conditionText").textContent = condition.description;
  document.getElementById("weatherIcon").src = `https://openweathermap.org/img/wn/${condition.icon}@2x.png`;
  document.getElementById("weatherIcon").alt = condition.description;

  renderTemperature(data.main.temp, data.main.feels_like);

  document.getElementById("humidityValue").textContent = `${data.main.humidity}%`;
  document.getElementById("windValue").textContent = `${Math.round(data.wind.speed * 3.6)} km/h`;
  document.getElementById("pressureValue").textContent = `${data.main.pressure} hPa`;
  document.getElementById("visibilityValue").textContent = `${(data.visibility / 1000).toFixed(1)} km`;
  document.getElementById("sunriseValue").textContent = formatTime(data.sys.sunrise, data.timezone);
  document.getElementById("sunsetValue").textContent = formatTime(data.sys.sunset, data.timezone);

  const card = document.getElementById("currentCard");
  card.classList.remove("pulse");
  void card.offsetWidth;
  card.classList.add("pulse");
}

function renderTemperature(tempC, feelsLikeC) {
  const temp = convertTemperature(tempC);
  const feels = convertTemperature(feelsLikeC);
  document.getElementById("mainTemp").textContent = Math.round(temp);
  document.getElementById("mainTempUnit").textContent = `°${currentUnit}`;
  document.getElementById("feelsLikeInline").textContent = `${Math.round(feels)}°${currentUnit}`;
  document.getElementById("feelsLikeValue").textContent = `${Math.round(feels)}°${currentUnit}`;
}

function displayForecast(forecastData) {
  const dailyMap = {};

  forecastData.list.forEach((entry) => {
    const date = new Date(entry.dt * 1000);
    const dayKey = date.toISOString().split("T")[0];

    if (!dailyMap[dayKey]) {
      dailyMap[dayKey] = { temps: [], icons: {}, date };
    }

    dailyMap[dayKey].temps.push(entry.main.temp);
    const icon = entry.weather[0].icon.replace("n", "d");
    const desc = entry.weather[0].description;
    dailyMap[dayKey].icons[icon] = (dailyMap[dayKey].icons[icon] || 0) + 1;
    dailyMap[dayKey].description = desc;
  });

  const today = new Date().toISOString().split("T")[0];
  const days = Object.keys(dailyMap)
    .filter((key) => key !== today)
    .slice(0, 5);

  const grid = document.getElementById("forecastGrid");
  grid.innerHTML = "";

  days.forEach((key) => {
    const day = dailyMap[key];
    const high = convertTemperature(Math.max(...day.temps));
    const low = convertTemperature(Math.min(...day.temps));
    const topIcon = Object.entries(day.icons).sort((a, b) => b[1] - a[1])[0][0];

    const card = document.createElement("div");
    card.className = "forecast-card";
    card.innerHTML = `
      <p class="forecast-day">${day.date.toLocaleDateString("en-US", { weekday: "short" })}</p>
      <img src="https://openweathermap.org/img/wn/${topIcon}@2x.png" alt="${day.description}" />
      <p class="forecast-condition">${day.description}</p>
      <div class="forecast-temps">
        <span class="forecast-high">${Math.round(high)}°</span>
        <span class="forecast-low">${Math.round(low)}°</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

// =========================================================
// Dynamic background
// =========================================================

function updateBackground(data) {
  const main = data.weather[0].main.toLowerCase();
  const isNight = !isDayTime(data.dt, data.sys.sunrise, data.sys.sunset);

  bgLayer.className = "bg-layer";

  if (isNight) {
    bgLayer.classList.add("bg-night");
    return;
  }

  if (main.includes("clear")) bgLayer.classList.add("bg-clear");
  else if (main.includes("cloud")) bgLayer.classList.add("bg-clouds");
  else if (main.includes("rain") || main.includes("drizzle")) bgLayer.classList.add("bg-rain");
  else if (main.includes("thunderstorm")) bgLayer.classList.add("bg-thunderstorm");
  else if (main.includes("snow")) bgLayer.classList.add("bg-snow");
  else bgLayer.classList.add("bg-clouds");
}

function isDayTime(current, sunrise, sunset) {
  return current >= sunrise && current <= sunset;
}

// =========================================================
// Unit conversion
// =========================================================

function convertTemperature(celsius) {
  if (currentUnit === "F") {
    return celsius * 9 / 5 + 32;
  }
  return celsius;
}

function setUnit(unit) {
  if (unit === currentUnit) return;
  currentUnit = unit;

  document.querySelectorAll(".unit-option").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.unit === unit);
  });

  if (lastData) {
    renderTemperature(lastData.current.main.temp, lastData.current.main.feels_like);
    displayForecast(lastData.forecast);
  }
}

// =========================================================
// UI helpers
// =========================================================

function showLoader() {
  loader.classList.add("show");
}
function hideLoader() {
  loader.classList.remove("show");
}
function showContent() {
  emptyState.style.display = "none";
  content.classList.add("show");
}
function hideContent() {
  content.classList.remove("show");
  emptyState.style.display = "flex";
}
function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.add("show");
}
function hideError() {
  errorMessage.textContent = "";
  errorMessage.classList.remove("show");
}

function formatDateTime(unixUtc, tzOffsetSeconds) {
  const localMs = (unixUtc + tzOffsetSeconds) * 1000;
  const date = new Date(localMs);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatTime(unixUtc, tzOffsetSeconds) {
  const localMs = (unixUtc + tzOffsetSeconds) * 1000;
  const date = new Date(localMs);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

// =========================================================
// Event listeners
// =========================================================

searchBtn.addEventListener("click", () => getWeather(cityInput.value));

cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") getWeather(cityInput.value);
});

locationBtn.addEventListener("click", getCurrentLocation);

unitToggle.addEventListener("click", (e) => {
  const opt = e.target.closest(".unit-option");
  if (opt) setUnit(opt.dataset.unit);
});

// =========================================================
// Init — restore last searched city
// =========================================================

window.addEventListener("DOMContentLoaded", () => {
  const savedCity = localStorage.getItem("weatherly-last-city");
  if (savedCity) {
    cityInput.value = savedCity;
    getWeather(savedCity);
  }
});
