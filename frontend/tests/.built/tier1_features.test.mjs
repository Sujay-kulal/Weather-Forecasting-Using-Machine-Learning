// frontend/tests/tier1_features.test.tsx
import { describe, it } from "node:test";
import assert2 from "node:assert/strict";

// frontend/tests/mocks/testUtils.tsx
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
function renderComponent(element) {
  return renderToStaticMarkup(element);
}
function assertContains(html, expected, message) {
  assert.ok(
    html.includes(expected),
    message || `Expected HTML to contain: "${expected}"
Actual snippet: ${html.slice(0, 300)}...`
  );
}

// frontend/src/components/IndiaMap.tsx
import { useEffect, useMemo, useRef, useState } from "react";

// frontend/tests/mocks/leafletMock.tsx
import { jsx } from "react/jsx-runtime";
function MapContainer(props) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-testid": "map-container",
      className: `leaflet-container ${props.className ?? ""}`,
      style: props.style,
      children: props.children
    }
  );
}
function GeoJSON(props) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-testid": "geojson-layer",
      "data-has-data": props.data ? "true" : "false"
    }
  );
}
function TileLayer(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "tile-layer", "data-url": props.url });
}
function LayersControl(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "layers-control", children: props.children });
}
LayersControl.BaseLayer = function BaseLayer(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "base-layer", "data-name": props.name, "data-checked": props.checked ? "true" : "false", children: props.children });
};
LayersControl.Overlay = function Overlay(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "overlay-layer", "data-name": props.name, "data-checked": props.checked ? "true" : "false", children: props.children });
};
function ZoomControl(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "zoom-control", "data-position": props.position });
}
function AttributionControl(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "attribution-control" });
}
function Marker(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "marker", "data-position": JSON.stringify(props.position), children: props.children });
}
function Popup(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "popup", className: "leaflet-popup", children: props.children });
}
function FeatureGroup(props) {
  return /* @__PURE__ */ jsx("div", { "data-testid": "feature-group", children: props.children });
}
function useMap() {
  return {
    flyTo: () => {
    },
    setView: () => {
    },
    getZoom: () => 5,
    on: () => {
    },
    off: () => {
    }
  };
}
var L = {
  divIcon: (opts) => ({
    options: opts,
    _isMockDivIcon: true
  }),
  latLng: (lat, lng) => ({ lat, lng }),
  geoJSON: () => ({
    setStyle: () => {
    },
    resetStyle: () => {
    }
  })
};
var leafletMock_default = L;

// frontend/src/services/api.ts
var BASE_URL = "http://127.0.0.1:8000";
var ApiError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
async function request(path, init) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new ApiError(0, "Cannot reach the backend server. Is the FastAPI server running?");
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    let parsedBody = false;
    try {
      const body = await response.json();
      parsedBody = true;
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
    }
    if (response.status >= 500 && BASE_URL.startsWith("/") && !parsedBody) {
      detail = "The backend is unavailable or returned an invalid response. Check that FastAPI is running.";
    }
    throw new ApiError(response.status, detail);
  }
  return response.json();
}
function getStates() {
  return request("/states");
}
function getDistricts(state) {
  return request(`/districts/${encodeURIComponent(state)}`);
}
function getLocations(state, district) {
  return request(
    `/locations/${encodeURIComponent(state)}/${encodeURIComponent(district)}`
  );
}
function getWeatherHistory(state, limit = 100, offset = 0, district, location) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (district && location) {
    return request(
      `/weather/${encodeURIComponent(state)}/${encodeURIComponent(district)}/${encodeURIComponent(location)}?${params}`
    );
  }
  return request(`/weather/${encodeURIComponent(state)}?${params}`);
}
function getRecentWeather(state, days = 30, district, location) {
  if (district && location) {
    return request(
      `/weather/${encodeURIComponent(state)}/${encodeURIComponent(district)}/${encodeURIComponent(location)}/recent?days=${days}`
    );
  }
  return request(
    `/weather/${encodeURIComponent(state)}/recent?days=${days}`
  );
}
function getPredictions(limit = 50, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request(`/predictions?${params}`);
}
function getModelInfo() {
  return request("/model-info", { cache: "no-store" });
}
function getForecastAll(date) {
  const query = date != null ? `?date=${encodeURIComponent(String(date))}` : "";
  return request(`/forecast/all${query}`);
}

// frontend/src/services/cityWeather.ts
var INDIAN_CITIES = [
  // ─── METROS ────────────────────────────────────────────────
  { name: "Mumbai", state: "Maharashtra", lat: 19.076, lng: 72.8777 },
  { name: "Delhi", state: "Delhi", lat: 28.6139, lng: 77.209 },
  { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { name: "Hyderabad", state: "Telangana", lat: 17.385, lng: 78.4867 },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  { name: "Kolkata", state: "West Bengal", lat: 22.5726, lng: 88.3639 },
  { name: "Ahmedabad", state: "Gujarat", lat: 23.0225, lng: 72.5714 },
  { name: "Pune", state: "Maharashtra", lat: 18.5204, lng: 73.8567 },
  // ─── ANDHRA PRADESH ────────────────────────────────────────
  { name: "Amaravati", state: "Andhra Pradesh", lat: 16.5131, lng: 80.5167 },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.6868, lng: 83.2185 },
  { name: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lng: 80.648 },
  { name: "Tirupati", state: "Andhra Pradesh", lat: 13.6288, lng: 79.4192 },
  { name: "Guntur", state: "Andhra Pradesh", lat: 16.3067, lng: 80.4365 },
  { name: "Nellore", state: "Andhra Pradesh", lat: 14.4426, lng: 79.9865 },
  { name: "Kurnool", state: "Andhra Pradesh", lat: 15.8281, lng: 78.0373 },
  { name: "Rajahmundry", state: "Andhra Pradesh", lat: 17.0005, lng: 81.804 },
  { name: "Kakinada", state: "Andhra Pradesh", lat: 16.9891, lng: 82.2475 },
  { name: "Anantapur", state: "Andhra Pradesh", lat: 14.6819, lng: 77.6006 },
  // ─── ARUNACHAL PRADESH ─────────────────────────────────────
  { name: "Itanagar", state: "Arunachal Pradesh", lat: 27.0844, lng: 93.6053 },
  { name: "Tawang", state: "Arunachal Pradesh", lat: 27.586, lng: 91.8596 },
  // ─── ASSAM ─────────────────────────────────────────────────
  { name: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362 },
  { name: "Dibrugarh", state: "Assam", lat: 27.4728, lng: 94.912 },
  { name: "Silchar", state: "Assam", lat: 24.8333, lng: 92.7789 },
  { name: "Jorhat", state: "Assam", lat: 26.7509, lng: 94.2037 },
  { name: "Tezpur", state: "Assam", lat: 26.6338, lng: 92.7926 },
  // ─── BIHAR ─────────────────────────────────────────────────
  { name: "Patna", state: "Bihar", lat: 25.6093, lng: 85.1376 },
  { name: "Gaya", state: "Bihar", lat: 24.7914, lng: 84.9994 },
  { name: "Bhagalpur", state: "Bihar", lat: 25.2425, lng: 86.9842 },
  { name: "Muzaffarpur", state: "Bihar", lat: 26.1209, lng: 85.3647 },
  { name: "Darbhanga", state: "Bihar", lat: 26.1542, lng: 85.8918 },
  { name: "Purnia", state: "Bihar", lat: 25.7771, lng: 87.4753 },
  // ─── CHHATTISGARH ──────────────────────────────────────────
  { name: "Raipur", state: "Chhattisgarh", lat: 21.2514, lng: 81.6296 },
  { name: "Bilaspur", state: "Chhattisgarh", lat: 22.0797, lng: 82.1409 },
  { name: "Durg", state: "Chhattisgarh", lat: 21.19, lng: 81.2849 },
  { name: "Korba", state: "Chhattisgarh", lat: 22.3595, lng: 82.7501 },
  // ─── GOA ───────────────────────────────────────────────────
  { name: "Panaji", state: "Goa", lat: 15.4909, lng: 73.8278 },
  { name: "Margao", state: "Goa", lat: 15.2832, lng: 73.9862 },
  // ─── GUJARAT ───────────────────────────────────────────────
  { name: "Gandhinagar", state: "Gujarat", lat: 23.2156, lng: 72.6369 },
  { name: "Surat", state: "Gujarat", lat: 21.1702, lng: 72.8311 },
  { name: "Vadodara", state: "Gujarat", lat: 22.3072, lng: 73.1812 },
  { name: "Rajkot", state: "Gujarat", lat: 22.3039, lng: 70.8022 },
  { name: "Bhavnagar", state: "Gujarat", lat: 21.7645, lng: 72.1519 },
  { name: "Jamnagar", state: "Gujarat", lat: 22.4707, lng: 70.0577 },
  { name: "Junagadh", state: "Gujarat", lat: 21.5222, lng: 70.4579 },
  { name: "Bhuj", state: "Gujarat", lat: 23.242, lng: 69.6669 },
  // ─── HARYANA ───────────────────────────────────────────────
  { name: "Chandigarh", state: "Chandigarh", lat: 30.7333, lng: 76.7794 },
  { name: "Gurugram", state: "Haryana", lat: 28.4595, lng: 77.0266 },
  { name: "Faridabad", state: "Haryana", lat: 28.4089, lng: 77.3178 },
  { name: "Ambala", state: "Haryana", lat: 30.3782, lng: 76.7767 },
  { name: "Hisar", state: "Haryana", lat: 29.1492, lng: 75.7217 },
  { name: "Karnal", state: "Haryana", lat: 29.6857, lng: 76.9905 },
  { name: "Panipat", state: "Haryana", lat: 29.3909, lng: 76.9635 },
  { name: "Rohtak", state: "Haryana", lat: 28.8955, lng: 76.5796 },
  // ─── HIMACHAL PRADESH ──────────────────────────────────────
  { name: "Shimla", state: "Himachal Pradesh", lat: 31.1048, lng: 77.1734 },
  { name: "Manali", state: "Himachal Pradesh", lat: 32.2396, lng: 77.1887 },
  { name: "Dharamshala", state: "Himachal Pradesh", lat: 32.219, lng: 76.3234 },
  { name: "Mandi", state: "Himachal Pradesh", lat: 31.7066, lng: 76.9317 },
  // ─── JHARKHAND ─────────────────────────────────────────────
  { name: "Ranchi", state: "Jharkhand", lat: 23.3441, lng: 85.3096 },
  { name: "Jamshedpur", state: "Jharkhand", lat: 22.8046, lng: 86.2029 },
  { name: "Dhanbad", state: "Jharkhand", lat: 23.7957, lng: 86.4304 },
  { name: "Bokaro", state: "Jharkhand", lat: 23.6693, lng: 86.1511 },
  // ─── JAMMU & KASHMIR / LADAKH ──────────────────────────────
  { name: "Srinagar", state: "Jammu And Kashmir", lat: 34.0837, lng: 74.7973 },
  { name: "Jammu", state: "Jammu And Kashmir", lat: 32.7266, lng: 74.857 },
  { name: "Anantnag", state: "Jammu And Kashmir", lat: 33.7311, lng: 75.1487 },
  { name: "Leh", state: "Ladakh", lat: 34.1526, lng: 77.5771 },
  { name: "Kargil", state: "Ladakh", lat: 34.5539, lng: 76.1349 },
  // ─── KARNATAKA ─────────────────────────────────────────────
  { name: "Mysuru", state: "Karnataka", lat: 12.2958, lng: 76.6394 },
  { name: "Mangaluru", state: "Karnataka", lat: 12.9141, lng: 74.856 },
  { name: "Hubli", state: "Karnataka", lat: 15.3647, lng: 75.124 },
  { name: "Belagavi", state: "Karnataka", lat: 15.8497, lng: 74.4977 },
  { name: "Davangere", state: "Karnataka", lat: 14.4644, lng: 75.9218 },
  { name: "Gulbarga", state: "Karnataka", lat: 17.3297, lng: 76.8343 },
  { name: "Shimoga", state: "Karnataka", lat: 13.9299, lng: 75.5681 },
  { name: "Udupi", state: "Karnataka", lat: 13.3409, lng: 74.7421 },
  // ─── KERALA ────────────────────────────────────────────────
  { name: "Thiruvananthapuram", state: "Kerala", lat: 8.5241, lng: 76.9366 },
  { name: "Kochi", state: "Kerala", lat: 9.9312, lng: 76.2673 },
  { name: "Kozhikode", state: "Kerala", lat: 11.2588, lng: 75.7804 },
  { name: "Thrissur", state: "Kerala", lat: 10.5276, lng: 76.2144 },
  { name: "Kannur", state: "Kerala", lat: 11.8745, lng: 75.3704 },
  { name: "Kollam", state: "Kerala", lat: 8.8932, lng: 76.6141 },
  // ─── MADHYA PRADESH ────────────────────────────────────────
  { name: "Bhopal", state: "Madhya Pradesh", lat: 23.2599, lng: 77.4126 },
  { name: "Indore", state: "Madhya Pradesh", lat: 22.7196, lng: 75.8577 },
  { name: "Jabalpur", state: "Madhya Pradesh", lat: 23.1815, lng: 79.9864 },
  { name: "Gwalior", state: "Madhya Pradesh", lat: 26.2183, lng: 78.1828 },
  { name: "Ujjain", state: "Madhya Pradesh", lat: 23.1765, lng: 75.7885 },
  { name: "Sagar", state: "Madhya Pradesh", lat: 23.8388, lng: 78.7378 },
  // ─── MAHARASHTRA ───────────────────────────────────────────
  { name: "Nagpur", state: "Maharashtra", lat: 21.1458, lng: 79.0882 },
  { name: "Nashik", state: "Maharashtra", lat: 19.9975, lng: 73.7898 },
  { name: "Aurangabad", state: "Maharashtra", lat: 19.8762, lng: 75.3433 },
  { name: "Solapur", state: "Maharashtra", lat: 17.6599, lng: 75.9064 },
  { name: "Kolhapur", state: "Maharashtra", lat: 16.705, lng: 74.2433 },
  { name: "Thane", state: "Maharashtra", lat: 19.2183, lng: 72.9781 },
  { name: "Navi Mumbai", state: "Maharashtra", lat: 19.033, lng: 73.0297 },
  { name: "Amravati", state: "Maharashtra", lat: 20.9374, lng: 77.7796 },
  // ─── MANIPUR ───────────────────────────────────────────────
  { name: "Imphal", state: "Manipur", lat: 24.817, lng: 93.9368 },
  // ─── MEGHALAYA ─────────────────────────────────────────────
  { name: "Shillong", state: "Meghalaya", lat: 25.5788, lng: 91.8933 },
  { name: "Tura", state: "Meghalaya", lat: 25.5144, lng: 90.2114 },
  // ─── MIZORAM ───────────────────────────────────────────────
  { name: "Aizawl", state: "Mizoram", lat: 23.7271, lng: 92.7176 },
  // ─── NAGALAND ──────────────────────────────────────────────
  { name: "Kohima", state: "Nagaland", lat: 25.6751, lng: 94.1086 },
  { name: "Dimapur", state: "Nagaland", lat: 25.9065, lng: 93.7272 },
  // ─── ODISHA ────────────────────────────────────────────────
  { name: "Bhubaneswar", state: "Odisha", lat: 20.2961, lng: 85.8245 },
  { name: "Cuttack", state: "Odisha", lat: 20.4625, lng: 85.883 },
  { name: "Rourkela", state: "Odisha", lat: 22.2604, lng: 84.8536 },
  { name: "Berhampur", state: "Odisha", lat: 19.315, lng: 84.7941 },
  { name: "Sambalpur", state: "Odisha", lat: 21.4669, lng: 83.9812 },
  { name: "Puri", state: "Odisha", lat: 19.7983, lng: 85.8312 },
  // ─── PUNJAB ────────────────────────────────────────────────
  { name: "Ludhiana", state: "Punjab", lat: 30.901, lng: 75.8573 },
  { name: "Amritsar", state: "Punjab", lat: 31.634, lng: 74.8723 },
  { name: "Jalandhar", state: "Punjab", lat: 31.326, lng: 75.5762 },
  { name: "Patiala", state: "Punjab", lat: 30.3398, lng: 76.3869 },
  { name: "Bathinda", state: "Punjab", lat: 30.211, lng: 74.9455 },
  // ─── RAJASTHAN ─────────────────────────────────────────────
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { name: "Jodhpur", state: "Rajasthan", lat: 26.2389, lng: 73.0243 },
  { name: "Udaipur", state: "Rajasthan", lat: 24.5854, lng: 73.7125 },
  { name: "Kota", state: "Rajasthan", lat: 25.2138, lng: 75.8648 },
  { name: "Ajmer", state: "Rajasthan", lat: 26.4499, lng: 74.6399 },
  { name: "Bikaner", state: "Rajasthan", lat: 28.0229, lng: 73.3119 },
  { name: "Jaisalmer", state: "Rajasthan", lat: 26.9157, lng: 70.9083 },
  { name: "Alwar", state: "Rajasthan", lat: 27.553, lng: 76.6346 },
  { name: "Bharatpur", state: "Rajasthan", lat: 27.2152, lng: 77.489 },
  // ─── SIKKIM ────────────────────────────────────────────────
  { name: "Gangtok", state: "Sikkim", lat: 27.3389, lng: 88.6065 },
  // ─── TAMIL NADU ────────────────────────────────────────────
  { name: "Madurai", state: "Tamil Nadu", lat: 9.9252, lng: 78.1198 },
  { name: "Coimbatore", state: "Tamil Nadu", lat: 11.0168, lng: 76.9558 },
  { name: "Tiruchirappalli", state: "Tamil Nadu", lat: 10.7905, lng: 78.7047 },
  { name: "Salem", state: "Tamil Nadu", lat: 11.6643, lng: 78.146 },
  { name: "Tirunelveli", state: "Tamil Nadu", lat: 8.7139, lng: 77.7567 },
  { name: "Erode", state: "Tamil Nadu", lat: 11.341, lng: 77.7172 },
  { name: "Vellore", state: "Tamil Nadu", lat: 12.9165, lng: 79.1325 },
  { name: "Thoothukudi", state: "Tamil Nadu", lat: 8.7642, lng: 78.1348 },
  { name: "Thanjavur", state: "Tamil Nadu", lat: 10.787, lng: 79.1378 },
  { name: "Ooty", state: "Tamil Nadu", lat: 11.4102, lng: 76.695 },
  // ─── TELANGANA ─────────────────────────────────────────────
  { name: "Warangal", state: "Telangana", lat: 17.9784, lng: 79.5941 },
  { name: "Nizamabad", state: "Telangana", lat: 18.6725, lng: 78.0941 },
  { name: "Karimnagar", state: "Telangana", lat: 18.4386, lng: 79.1288 },
  { name: "Khammam", state: "Telangana", lat: 17.2473, lng: 80.1514 },
  // ─── TRIPURA ───────────────────────────────────────────────
  { name: "Agartala", state: "Tripura", lat: 23.8315, lng: 91.2868 },
  // ─── UTTAR PRADESH ─────────────────────────────────────────
  { name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
  { name: "Kanpur", state: "Uttar Pradesh", lat: 26.4499, lng: 80.3319 },
  { name: "Agra", state: "Uttar Pradesh", lat: 27.1767, lng: 78.0081 },
  { name: "Varanasi", state: "Uttar Pradesh", lat: 25.3176, lng: 82.9739 },
  { name: "Prayagraj", state: "Uttar Pradesh", lat: 25.4358, lng: 81.8463 },
  { name: "Meerut", state: "Uttar Pradesh", lat: 28.9845, lng: 77.7064 },
  { name: "Noida", state: "Uttar Pradesh", lat: 28.5355, lng: 77.391 },
  { name: "Ghaziabad", state: "Uttar Pradesh", lat: 28.6692, lng: 77.4538 },
  { name: "Bareilly", state: "Uttar Pradesh", lat: 28.367, lng: 79.4304 },
  { name: "Aligarh", state: "Uttar Pradesh", lat: 27.8974, lng: 78.088 },
  { name: "Moradabad", state: "Uttar Pradesh", lat: 28.8386, lng: 78.7733 },
  { name: "Gorakhpur", state: "Uttar Pradesh", lat: 26.7606, lng: 83.3732 },
  { name: "Jhansi", state: "Uttar Pradesh", lat: 25.4484, lng: 78.5685 },
  { name: "Mathura", state: "Uttar Pradesh", lat: 27.4924, lng: 77.6737 },
  { name: "Ayodhya", state: "Uttar Pradesh", lat: 26.7922, lng: 82.1998 },
  // ─── UTTARAKHAND ───────────────────────────────────────────
  { name: "Dehradun", state: "Uttarakhand", lat: 30.3165, lng: 78.0322 },
  { name: "Haridwar", state: "Uttarakhand", lat: 29.9457, lng: 78.1642 },
  { name: "Rishikesh", state: "Uttarakhand", lat: 30.0869, lng: 78.2676 },
  { name: "Nainital", state: "Uttarakhand", lat: 29.3803, lng: 79.4636 },
  { name: "Haldwani", state: "Uttarakhand", lat: 29.2183, lng: 79.513 },
  // ─── WEST BENGAL ───────────────────────────────────────────
  { name: "Howrah", state: "West Bengal", lat: 22.5958, lng: 88.2636 },
  { name: "Durgapur", state: "West Bengal", lat: 23.5204, lng: 87.3119 },
  { name: "Asansol", state: "West Bengal", lat: 23.6889, lng: 86.9661 },
  { name: "Siliguri", state: "West Bengal", lat: 26.7271, lng: 88.3953 },
  { name: "Darjeeling", state: "West Bengal", lat: 27.036, lng: 88.2627 },
  { name: "Malda", state: "West Bengal", lat: 25.0108, lng: 88.141 },
  { name: "Kharagpur", state: "West Bengal", lat: 22.346, lng: 87.232 },
  // ─── UNION TERRITORIES ─────────────────────────────────────
  { name: "Port Blair", state: "Andaman And Nicobar", lat: 11.6234, lng: 92.7265 },
  { name: "Puducherry", state: "Puducherry", lat: 11.9416, lng: 79.8083 },
  { name: "Daman", state: "Dadra And Nagar Haveli And Daman And Diu", lat: 20.3974, lng: 72.8328 },
  { name: "Silvassa", state: "Dadra And Nagar Haveli And Daman And Diu", lat: 20.2766, lng: 73.0091 },
  { name: "Kavaratti", state: "Lakshadweep", lat: 10.5626, lng: 72.6369 }
];
function wmoWeatherCode(code) {
  const map = {
    0: { description: "Clear sky", emoji: "\u2600\uFE0F" },
    1: { description: "Mainly clear", emoji: "\u{1F324}" },
    2: { description: "Partly cloudy", emoji: "\u26C5" },
    3: { description: "Overcast", emoji: "\u2601\uFE0F" },
    45: { description: "Foggy", emoji: "\u{1F32B}\uFE0F" },
    48: { description: "Rime fog", emoji: "\u{1F32B}\uFE0F" },
    51: { description: "Light drizzle", emoji: "\u{1F326}" },
    53: { description: "Moderate drizzle", emoji: "\u{1F326}" },
    55: { description: "Dense drizzle", emoji: "\u{1F327}" },
    56: { description: "Freezing drizzle", emoji: "\u{1F327}" },
    57: { description: "Heavy freezing drizzle", emoji: "\u{1F327}" },
    61: { description: "Slight rain", emoji: "\u{1F326}" },
    63: { description: "Moderate rain", emoji: "\u{1F327}" },
    65: { description: "Heavy rain", emoji: "\u{1F327}" },
    66: { description: "Freezing rain", emoji: "\u{1F327}" },
    67: { description: "Heavy freezing rain", emoji: "\u{1F327}" },
    71: { description: "Slight snow", emoji: "\u{1F328}" },
    73: { description: "Moderate snow", emoji: "\u{1F328}" },
    75: { description: "Heavy snow", emoji: "\u2744\uFE0F" },
    77: { description: "Snow grains", emoji: "\u2744\uFE0F" },
    80: { description: "Slight showers", emoji: "\u{1F326}" },
    81: { description: "Moderate showers", emoji: "\u{1F327}" },
    82: { description: "Violent showers", emoji: "\u26C8" },
    85: { description: "Slight snow showers", emoji: "\u{1F328}" },
    86: { description: "Heavy snow showers", emoji: "\u2744\uFE0F" },
    95: { description: "Thunderstorm", emoji: "\u26C8" },
    96: { description: "Thunderstorm + hail", emoji: "\u26C8" },
    99: { description: "Severe thunderstorm", emoji: "\u26C8" }
  };
  return map[code] ?? { description: "Unknown", emoji: "\u{1F321}\uFE0F" };
}
function toCityWeather(city, current) {
  const weatherCode = current.weather_code ?? 0;
  const weather = wmoWeatherCode(weatherCode);
  return {
    city,
    temperature: current.temperature_2m ?? 0,
    humidity: current.relative_humidity_2m ?? 0,
    windSpeed: current.wind_speed_10m ?? 0,
    weatherCode,
    description: weather.description,
    emoji: weather.emoji,
    isDay: (current.is_day ?? 1) === 1
  };
}
async function searchIndianCityWeather(query) {
  const name = query.trim();
  if (!name) return [];
  const geocodeResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`
  );
  if (!geocodeResponse.ok) throw new Error("City search is temporarily unavailable");
  const geocodeData = await geocodeResponse.json();
  const places = (geocodeData.results ?? []).filter((place) => place.country_code === "IN");
  if (places.length === 0) return [];
  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${places.map((place) => place.latitude).join(",")}&longitude=${places.map((place) => place.longitude).join(",")}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=Asia%2FKolkata`
  );
  if (!weatherResponse.ok) throw new Error("Live weather is temporarily unavailable");
  const weatherData = await weatherResponse.json();
  const forecasts = Array.isArray(weatherData) ? weatherData : [weatherData];
  return places.flatMap((place, index) => {
    const current = forecasts[index]?.current;
    if (!current) return [];
    return [toCityWeather({
      name: place.name,
      state: place.admin1 ?? place.admin2 ?? "India",
      district: place.admin2,
      location: place.name,
      lat: place.latitude,
      lng: place.longitude
    }, current)];
  });
}
async function fetchAllCityWeather() {
  const CHUNK_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < INDIAN_CITIES.length; i += CHUNK_SIZE) {
    chunks.push(INDIAN_CITIES.slice(i, i + CHUNK_SIZE));
  }
  const allResults = [];
  const chunkPromises = chunks.map(async (chunk) => {
    const lats = chunk.map((c) => c.lat).join(",");
    const lngs = chunk.map((c) => c.lng).join(",");
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=Asia/Kolkata`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch city weather data");
    const data = await response.json();
    const results = Array.isArray(data) ? data : [data];
    return results.map((r, i) => {
      const city = chunk[i];
      return toCityWeather(city, r.current ?? {});
    });
  });
  const chunkResults = await Promise.allSettled(chunkPromises);
  let failedChunks = 0;
  for (const result of chunkResults) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value);
    } else {
      failedChunks += 1;
    }
  }
  if (allResults.length === 0) {
    throw new Error("Live city weather is temporarily unavailable from Open-Meteo.");
  }
  return { cities: allResults, failedChunks, totalChunks: chunks.length };
}

// frontend/src/components/icons.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function base(props) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props
  };
}
function CloudSunIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M12 2v2" }),
    /* @__PURE__ */ jsx2("path", { d: "m4.9 4.9 1.4 1.4" }),
    /* @__PURE__ */ jsx2("path", { d: "M20 12h2" }),
    /* @__PURE__ */ jsx2("path", { d: "m19.1 4.9-1.4 1.4" }),
    /* @__PURE__ */ jsx2("path", { d: "M15.9 12a4 4 0 0 0-7.8-1.3" }),
    /* @__PURE__ */ jsx2("path", { d: "M2 16h.01" }),
    /* @__PURE__ */ jsx2("path", { d: "M21.5 16.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z" }),
    /* @__PURE__ */ jsx2("path", { d: "M13.5 21a2.5 2.5 0 1 1 .5-4.96 4 4 0 0 1 6.9 1.46 2.5 2.5 0 0 1-1.4 3.5" }),
    /* @__PURE__ */ jsx2("path", { d: "M13.5 21H7" })
  ] });
}
function ThermometerIcon(props) {
  return /* @__PURE__ */ jsx2("svg", { ...base(props), children: /* @__PURE__ */ jsx2("path", { d: "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" }) });
}
function DropletIcon(props) {
  return /* @__PURE__ */ jsx2("svg", { ...base(props), children: /* @__PURE__ */ jsx2("path", { d: "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z" }) });
}
function RainIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" }),
    /* @__PURE__ */ jsx2("path", { d: "M16 14v6" }),
    /* @__PURE__ */ jsx2("path", { d: "M8 14v6" }),
    /* @__PURE__ */ jsx2("path", { d: "M12 16v6" })
  ] });
}
function CalendarIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M8 2v4" }),
    /* @__PURE__ */ jsx2("path", { d: "M16 2v4" }),
    /* @__PURE__ */ jsx2("rect", { width: "18", height: "18", x: "3", y: "4", rx: "2" }),
    /* @__PURE__ */ jsx2("path", { d: "M3 10h18" })
  ] });
}
function ClockIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "10" }),
    /* @__PURE__ */ jsx2("path", { d: "M12 6v6l4 2" })
  ] });
}
function DatabaseIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("ellipse", { cx: "12", cy: "5", rx: "9", ry: "3" }),
    /* @__PURE__ */ jsx2("path", { d: "M3 5v14a9 3 0 0 0 18 0V5" }),
    /* @__PURE__ */ jsx2("path", { d: "M3 12a9 3 0 0 0 18 0" })
  ] });
}
function ChipIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }),
    /* @__PURE__ */ jsx2("path", { d: "M7 7h10v10H7Z" }),
    /* @__PURE__ */ jsx2("path", { d: "M9 2v1" }),
    /* @__PURE__ */ jsx2("path", { d: "M15 2v1" }),
    /* @__PURE__ */ jsx2("path", { d: "M9 21v1" }),
    /* @__PURE__ */ jsx2("path", { d: "M15 21v1" }),
    /* @__PURE__ */ jsx2("path", { d: "M2 9h1" }),
    /* @__PURE__ */ jsx2("path", { d: "M2 15h1" }),
    /* @__PURE__ */ jsx2("path", { d: "M21 9h1" }),
    /* @__PURE__ */ jsx2("path", { d: "M21 15h1" })
  ] });
}
function ListIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M8 6h13" }),
    /* @__PURE__ */ jsx2("path", { d: "M8 12h13" }),
    /* @__PURE__ */ jsx2("path", { d: "M8 18h13" }),
    /* @__PURE__ */ jsx2("path", { d: "M3 6h.01" }),
    /* @__PURE__ */ jsx2("path", { d: "M3 12h.01" }),
    /* @__PURE__ */ jsx2("path", { d: "M3 18h.01" })
  ] });
}
function ChartIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M3 3v16a2 2 0 0 0 2 2h16" }),
    /* @__PURE__ */ jsx2("path", { d: "m7 14 4-4 4 4 5-5" })
  ] });
}
function SlidersIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M4 21v-7" }),
    /* @__PURE__ */ jsx2("path", { d: "M4 10V3" }),
    /* @__PURE__ */ jsx2("path", { d: "M12 21v-9" }),
    /* @__PURE__ */ jsx2("path", { d: "M12 8V3" }),
    /* @__PURE__ */ jsx2("path", { d: "M20 21v-5" }),
    /* @__PURE__ */ jsx2("path", { d: "M20 12V3" }),
    /* @__PURE__ */ jsx2("path", { d: "M2 14h4" }),
    /* @__PURE__ */ jsx2("path", { d: "M10 8h4" }),
    /* @__PURE__ */ jsx2("path", { d: "M18 16h4" })
  ] });
}
function AlertIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "m21.7 18-8-13.9a2 2 0 0 0-3.4 0L2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3Z" }),
    /* @__PURE__ */ jsx2("path", { d: "M12 9v4" }),
    /* @__PURE__ */ jsx2("path", { d: "M12 17h.01" })
  ] });
}
function InboxIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M22 12h-6l-2 3h-4l-2-3H2" }),
    /* @__PURE__ */ jsx2("path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" })
  ] });
}
function ArrowUpIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M12 19V5" }),
    /* @__PURE__ */ jsx2("path", { d: "m5 12 7-7 7 7" })
  ] });
}
function RefreshIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M21 12a9 9 0 1 1-2.64-6.36" }),
    /* @__PURE__ */ jsx2("path", { d: "M21 3v6h-6" })
  ] });
}
function TargetIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "9" }),
    /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "5" }),
    /* @__PURE__ */ jsx2("circle", { cx: "12", cy: "12", r: "1" })
  ] });
}
function MapIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("polygon", { points: "3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" }),
    /* @__PURE__ */ jsx2("line", { x1: "9", x2: "9", y1: "3", y2: "18" }),
    /* @__PURE__ */ jsx2("line", { x1: "15", x2: "15", y1: "6", y2: "21" })
  ] });
}
function ChevronLeftIcon(props) {
  return /* @__PURE__ */ jsx2("svg", { ...base(props), children: /* @__PURE__ */ jsx2("path", { d: "m15 18-6-6 6-6" }) });
}
function ChevronRightIcon(props) {
  return /* @__PURE__ */ jsx2("svg", { ...base(props), children: /* @__PURE__ */ jsx2("path", { d: "m9 18 6-6-6-6" }) });
}
function CheckIcon(props) {
  return /* @__PURE__ */ jsx2("svg", { ...base(props), children: /* @__PURE__ */ jsx2("polyline", { points: "20 6 9 17 4 12" }) });
}
function XIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("path", { d: "M18 6 6 18" }),
    /* @__PURE__ */ jsx2("path", { d: "m6 6 12 12" })
  ] });
}
function SearchIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("circle", { cx: "11", cy: "11", r: "8" }),
    /* @__PURE__ */ jsx2("path", { d: "m21 21-4.3-4.3" })
  ] });
}
function FilterIcon(props) {
  return /* @__PURE__ */ jsx2("svg", { ...base(props), children: /* @__PURE__ */ jsx2("polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" }) });
}

// frontend/src/components/ui.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
function Card({ title, subtitle, icon, action, children, className }) {
  return /* @__PURE__ */ jsxs2("section", { className: `panel ${className ?? ""}`, children: [
    (title || action) && /* @__PURE__ */ jsxs2("div", { className: "panel-header", children: [
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsxs2("h3", { className: "panel-title", children: [
          icon,
          title
        ] }),
        subtitle && /* @__PURE__ */ jsx3("p", { className: "panel-subtitle", children: subtitle })
      ] }),
      action && /* @__PURE__ */ jsx3("div", { className: "panel-action", children: action })
    ] }),
    children
  ] });
}
function PageHead({ title, desc, badge, children }) {
  return /* @__PURE__ */ jsxs2("div", { className: "page-head", children: [
    /* @__PURE__ */ jsxs2("div", { children: [
      /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx3("h2", { className: "page-title", children: title }),
        badge
      ] }),
      desc && /* @__PURE__ */ jsx3("p", { className: "page-desc", children: desc })
    ] }),
    children && /* @__PURE__ */ jsx3("div", { className: "page-actions", children })
  ] });
}
function StatChip({ icon, label, value, sub }) {
  return /* @__PURE__ */ jsxs2("div", { className: "stat-chip", children: [
    icon && /* @__PURE__ */ jsx3("span", { className: "stat-icon", children: icon }),
    /* @__PURE__ */ jsxs2("span", { className: "stat-body", children: [
      /* @__PURE__ */ jsx3("span", { className: "stat-value", children: value }),
      /* @__PURE__ */ jsx3("span", { className: "stat-label", children: label }),
      sub && /* @__PURE__ */ jsx3("span", { style: { fontSize: "11px", color: "var(--text-faint)", marginTop: 2 }, children: sub })
    ] })
  ] });
}
function Badge({ children, variant, neutral }) {
  const finalVariant = variant ?? (neutral ? "neutral" : "default");
  return /* @__PURE__ */ jsx3("span", { className: `badge ${finalVariant}`, children });
}
function Spinner(props) {
  return /* @__PURE__ */ jsxs2("div", { className: "spinner-row", role: "status", children: [
    /* @__PURE__ */ jsx3("span", { className: "spinner", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx3("span", { children: props.label })
  ] });
}
function Skeleton(props) {
  const count = props.rows ?? 3;
  return /* @__PURE__ */ jsx3("div", { className: "skeleton-box", "aria-hidden": "true", children: Array.from({ length: count }).map((_, i) => /* @__PURE__ */ jsx3(
    "div",
    {
      className: "skeleton-line",
      style: { width: i === 0 ? "85%" : i === count - 1 ? "60%" : "100%" }
    },
    i
  )) });
}
function ErrorBanner(props) {
  return /* @__PURE__ */ jsxs2("div", { className: "error-banner", role: "alert", children: [
    /* @__PURE__ */ jsxs2("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
      /* @__PURE__ */ jsx3(AlertIcon, { style: { width: 18, height: 18, flexShrink: 0, color: "var(--danger)" } }),
      /* @__PURE__ */ jsxs2("div", { children: [
        /* @__PURE__ */ jsx3("strong", { children: "System Alert" }),
        /* @__PURE__ */ jsx3("span", { children: props.message })
      ] })
    ] }),
    props.onRetry && /* @__PURE__ */ jsx3(
      "button",
      {
        type: "button",
        className: "btn-outline",
        onClick: props.onRetry,
        style: { flexShrink: 0, borderColor: "var(--danger-border)", color: "var(--danger)" },
        children: "Retry"
      }
    )
  ] });
}
function EmptyNote(props) {
  return /* @__PURE__ */ jsxs2("div", { className: "empty-state", children: [
    /* @__PURE__ */ jsx3(InboxIcon, {}),
    /* @__PURE__ */ jsx3("span", { className: "empty-title", children: props.title ?? "No Records Available" }),
    (props.hint ?? props.text) && /* @__PURE__ */ jsx3("span", { className: "empty-hint", children: props.hint ?? props.text }),
    props.action && /* @__PURE__ */ jsx3("div", { style: { marginTop: 12 }, children: props.action })
  ] });
}

// frontend/src/components/IndiaMap.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
function normalizeStateName(raw) {
  const s = raw.trim();
  if (s === "Dadra & Nagar Haveli" || s === "Daman & Diu") {
    return "Dadra And Nagar Haveli And Daman And Diu";
  }
  if (s === "Jammu & Kashmir") return "Jammu And Kashmir";
  if (s === "Andaman & Nicobar") return "Andaman And Nicobar";
  return s.replace("&", "And");
}
function getTempColor(temp) {
  if (temp === void 0) return "#94a3b8";
  if (temp < 15) return "#3b82f6";
  if (temp < 20) return "#06b6d4";
  if (temp < 25) return "#10b981";
  if (temp < 30) return "#f59e0b";
  if (temp < 35) return "#f97316";
  return "#ef4444";
}
function getHumidityColor(humidity) {
  if (humidity === void 0) return "#94a3b8";
  if (humidity < 40) return "#f59e0b";
  if (humidity < 60) return "#10b981";
  if (humidity < 75) return "#06b6d4";
  if (humidity < 85) return "#3b82f6";
  return "#6366f1";
}
function getRainfallEstimate(weatherCode) {
  if ([51, 53].includes(weatherCode)) return 1.2;
  if ([55, 56, 57].includes(weatherCode)) return 3.5;
  if ([61, 80].includes(weatherCode)) return 4;
  if ([63, 81].includes(weatherCode)) return 9.5;
  if ([65, 82].includes(weatherCode)) return 18;
  if ([95, 96, 99].includes(weatherCode)) return 28;
  return 0;
}
function getRainfallColor(rainfall) {
  if (rainfall === void 0 || rainfall === 0) return "#94a3b8";
  if (rainfall <= 2.5) return "#38bdf8";
  if (rainfall <= 10) return "#0284c7";
  if (rainfall <= 25) return "#2563eb";
  return "#7c3aed";
}
function getWindColor(windSpeed) {
  if (windSpeed === void 0) return "#94a3b8";
  if (windSpeed < 10) return "#10b981";
  if (windSpeed < 20) return "#06b6d4";
  if (windSpeed < 35) return "#f59e0b";
  if (windSpeed < 50) return "#f97316";
  return "#ef4444";
}
var TILE_LAYERS = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
    maxZoom: 18
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    maxZoom: 17
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20
  }
};
var METRIC_CONFIGS = {
  temperature: {
    label: "Temperature",
    unit: "\xB0C",
    icon: "\u{1F321}\uFE0F",
    bands: [
      { color: "#3b82f6", label: "< 15\xB0C" },
      { color: "#06b6d4", label: "15\u201320\xB0C" },
      { color: "#10b981", label: "20\u201325\xB0C" },
      { color: "#f59e0b", label: "25\u201330\xB0C" },
      { color: "#f97316", label: "30\u201335\xB0C" },
      { color: "#ef4444", label: "> 35\xB0C" }
    ]
  },
  humidity: {
    label: "Relative Humidity",
    unit: "%",
    icon: "\u{1F4A7}",
    bands: [
      { color: "#f59e0b", label: "< 40%" },
      { color: "#10b981", label: "40\u201360%" },
      { color: "#06b6d4", label: "60\u201375%" },
      { color: "#3b82f6", label: "75\u201385%" },
      { color: "#6366f1", label: "> 85%" }
    ]
  },
  rainfall: {
    label: "Rainfall",
    unit: "mm",
    icon: "\u{1F327}\uFE0F",
    bands: [
      { color: "#94a3b8", label: "0 mm" },
      { color: "#38bdf8", label: "0.1\u20132.5 mm" },
      { color: "#0284c7", label: "2.5\u201310 mm" },
      { color: "#2563eb", label: "10\u201325 mm" },
      { color: "#7c3aed", label: "> 25 mm" }
    ]
  },
  wind: {
    label: "Wind Speed",
    unit: "km/h",
    icon: "\u{1F4A8}",
    bands: [
      { color: "#10b981", label: "< 10 km/h" },
      { color: "#06b6d4", label: "10\u201320 km/h" },
      { color: "#f59e0b", label: "20\u201335 km/h" },
      { color: "#f97316", label: "35\u201350 km/h" },
      { color: "#ef4444", label: "> 50 km/h" }
    ]
  }
};
function createCityIcon(weather, metric) {
  let displayVal = `${weather.temperature.toFixed(0)}\xB0C`;
  let metricColor = getTempColor(weather.temperature);
  if (metric === "humidity") {
    displayVal = `${weather.humidity.toFixed(0)}%`;
    metricColor = getHumidityColor(weather.humidity);
  } else if (metric === "rainfall") {
    const rain = getRainfallEstimate(weather.weatherCode);
    displayVal = `${rain.toFixed(1)}mm`;
    metricColor = getRainfallColor(rain);
  } else if (metric === "wind") {
    displayVal = `${weather.windSpeed.toFixed(0)}km/h`;
    metricColor = getWindColor(weather.windSpeed);
  }
  return leafletMock_default.divIcon({
    className: "city-weather-marker",
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
        pointer-events: auto;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
      ">
        <div style="
          background: #ffffff;
          border: 2px solid ${metricColor};
          border-radius: 10px;
          padding: 3px 7px;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
          <span style="font-size: 13px;">${weather.emoji}</span>
          <span style="
            font-size: 11.5px;
            font-weight: 800;
            color: ${metricColor};
            line-height: 1;
            font-variant-numeric: tabular-nums;
          ">${displayVal}</span>
        </div>
        <div style="
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid ${metricColor};
          margin-top: -1px;
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -36]
  });
}
function MapFlyToController({ flyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (flyTarget) {
      map.flyTo(flyTarget, 8, { duration: 1.2 });
    }
  }, [flyTarget, map]);
  return null;
}
function IndiaMap({
  onSelectState,
  selectedState,
  overlayMetric = "temperature",
  onOverlayMetricChange,
  forecastDay = 1,
  onForecastDayChange,
  height
}) {
  const [geoData, setGeoData] = useState(null);
  const [forecasts, setForecasts] = useState({});
  const [cityWeather, setCityWeather] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityLoading, setCityLoading] = useState(true);
  const [cityLoadMessage, setCityLoadMessage] = useState(null);
  const [cityQuery, setCityQuery] = useState("");
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [citySearchMessage, setCitySearchMessage] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [flyTarget, setFlyTarget] = useState(null);
  const geoJsonRef = useRef(null);
  useEffect(() => {
    fetch("/india_states.geojson").then((res) => {
      if (!res.ok) throw new Error("Failed to load India boundaries GeoJSON");
      return res.json();
    }).then((data) => setGeoData(data)).catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function loadForecasts() {
      try {
        const BASE_URL2 = "http://127.0.0.1:8000";
        const res = await fetch(`${BASE_URL2}/forecast/all?day=${forecastDay}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setForecasts(data);
            setError(null);
          }
          return;
        }
      } catch {
      }
      try {
        const fallbackData = await getForecastAll(forecastDay);
        if (!cancelled) {
          setForecasts(fallbackData);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load forecast data for map:", err);
          setError("Failed to load all-state forecasts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadForecasts();
    return () => {
      cancelled = true;
    };
  }, [forecastDay]);
  useEffect(() => {
    setCityLoading(true);
    fetchAllCityWeather().then(({ cities, failedChunks, totalChunks }) => {
      setCityWeather(cities);
      setCityLoadMessage(
        failedChunks > 0 ? `Live weather unavailable for ${failedChunks} of ${totalChunks} city batches; showing ${cities.length} cities.` : null
      );
      setLastUpdated((/* @__PURE__ */ new Date()).toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit" }));
    }).catch((err) => {
      setCityWeather([]);
      setCityLoadMessage(
        err instanceof Error ? err.message : "Live city weather is temporarily unavailable from Open-Meteo."
      );
    }).finally(() => setCityLoading(false));
  }, []);
  const stateAverages = useMemo(() => {
    const map = {};
    for (const cw of cityWeather) {
      const stateName = normalizeStateName(cw.city.state);
      if (!map[stateName]) {
        map[stateName] = { humidity: 0, rainfall: 0, wind: 0, count: 0 };
      }
      map[stateName].humidity += cw.humidity;
      map[stateName].rainfall += getRainfallEstimate(cw.weatherCode);
      map[stateName].wind += cw.windSpeed;
      map[stateName].count += 1;
    }
    const result = {};
    for (const [st, agg] of Object.entries(map)) {
      if (agg.count > 0) {
        result[st] = {
          humidity: agg.humidity / agg.count,
          rainfall: agg.rainfall / agg.count,
          wind: agg.wind / agg.count
        };
      }
    }
    return result;
  }, [cityWeather]);
  async function searchCity(event) {
    event.preventDefault();
    const query = cityQuery.trim().toLowerCase();
    if (!query) return;
    setCitySearchLoading(true);
    setCitySearchMessage(null);
    const localMatch = cityWeather.find(
      (c) => c.city.name.toLowerCase() === query || c.city.name.toLowerCase().includes(query)
    );
    if (localMatch) {
      setFlyTarget([localMatch.city.lat, localMatch.city.lng]);
      if (onSelectState) onSelectState(localMatch.city.state);
      setCitySearchMessage(`Centered on ${localMatch.city.name}, ${localMatch.city.state}`);
      setCitySearchLoading(false);
      return;
    }
    try {
      const matches = await searchIndianCityWeather(cityQuery);
      if (matches.length === 0) {
        setCitySearchMessage("No Indian city found for that search query.");
        return;
      }
      setCityWeather((existing) => {
        const byLocation = new Map(existing.map((item) => [`${item.city.name}|${item.city.state}`, item]));
        matches.forEach((item) => byLocation.set(`${item.city.name}|${item.city.state}`, item));
        return [...byLocation.values()];
      });
      const first = matches[0];
      setFlyTarget([first.city.lat, first.city.lng]);
      if (onSelectState) onSelectState(first.city.state);
      setCitySearchMessage(`Found ${first.city.name}, ${first.city.state} \u2014 centered on map.`);
    } catch (searchError) {
      setCitySearchMessage(searchError instanceof Error ? searchError.message : "City search failed. Please try again.");
    } finally {
      setCitySearchLoading(false);
    }
  }
  function getFeatureMetricDetails(stateName) {
    if (overlayMetric === "temperature") {
      const temp = forecasts[stateName];
      return {
        valueDisplay: temp !== void 0 ? `${temp.toFixed(1)} \xB0C` : "No data",
        color: getTempColor(temp),
        label: `Day ${forecastDay} Forecast`
      };
    }
    if (overlayMetric === "humidity") {
      const hum = stateAverages[stateName]?.humidity;
      return {
        valueDisplay: hum !== void 0 ? `${hum.toFixed(0)} %` : "No data",
        color: getHumidityColor(hum),
        label: "Regional Avg Humidity"
      };
    }
    if (overlayMetric === "rainfall") {
      const rain = stateAverages[stateName]?.rainfall;
      return {
        valueDisplay: rain !== void 0 ? `${rain.toFixed(1)} mm` : "No data",
        color: getRainfallColor(rain),
        label: "Regional Avg Rainfall"
      };
    }
    const wind = stateAverages[stateName]?.wind;
    return {
      valueDisplay: wind !== void 0 ? `${wind.toFixed(0)} km/h` : "No data",
      color: getWindColor(wind),
      label: "Regional Avg Wind Speed"
    };
  }
  function styleFeature(feature) {
    if (!feature) return {};
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const details = getFeatureMetricDetails(stateName);
    const isSelected = selectedState && selectedState.toLowerCase() === stateName.toLowerCase();
    return {
      fillColor: details.color,
      weight: isSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected ? "#2563eb" : "rgba(255,255,255,0.85)",
      fillOpacity: isSelected ? 0.75 : 0.45
    };
  }
  function onEachFeature(feature, layer) {
    const rawName = feature.properties?.STNAME_SH || feature.properties?.STNAME || "";
    const stateName = normalizeStateName(rawName);
    const details = getFeatureMetricDetails(stateName);
    layer.bindTooltip(
      `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.5; min-width: 150px;">
        <div style="font-weight: 800; color: #0f172a; font-size: 14px; margin-bottom: 2px;">${stateName}</div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">${details.label}</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: 800; font-size: 16px; color: ${details.color};">${details.valueDisplay}</span>
        </div>
        <div style="font-size: 11px; color: #2563eb; margin-top: 4px; font-weight: 600;">Click to inspect state telemetry \u2192</div>
      </div>`,
      { sticky: true, direction: "auto", className: "map-tooltip" }
    );
    layer.on({
      mouseover: (e) => {
        const target = e.target;
        target.setStyle({
          weight: 3,
          color: "#3b82f6",
          fillOpacity: 0.72
        });
        target.bringToFront();
      },
      mouseout: (e) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.resetStyle(e.target);
        }
      },
      click: () => {
        if (onSelectState && stateName) {
          onSelectState(stateName);
        }
      }
    });
  }
  const activeMetricConfig = METRIC_CONFIGS[overlayMetric];
  return /* @__PURE__ */ jsxs3("div", { className: "map-shell-container", style: { position: "relative", width: "100%" }, children: [
    (loading || cityLoading) && /* @__PURE__ */ jsxs3(
      "div",
      {
        style: {
          position: "absolute",
          zIndex: 1e3,
          top: 60,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(15, 23, 42, 0.94)",
          borderRadius: 8,
          padding: "8px 16px",
          boxShadow: "var(--shadow-md)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#ffffff",
          fontSize: 12.5,
          fontWeight: 600
        },
        children: [
          /* @__PURE__ */ jsx4("span", { className: "spinner", style: { borderTopColor: "#38bdf8", width: 14, height: 14 } }),
          cityLoading ? "Syncing live city telemetry\u2026" : `Loading Day ${forecastDay} state forecasts\u2026`
        ]
      }
    ),
    error && /* @__PURE__ */ jsx4(ErrorBanner, { message: error }),
    /* @__PURE__ */ jsxs3("div", { className: "map-toolbar-bar", children: [
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx4("span", { style: { fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }, children: "Overlay:" }),
        ["temperature", "humidity", "rainfall", "wind"].map((m) => {
          const conf = METRIC_CONFIGS[m];
          const isActive = overlayMetric === m;
          return /* @__PURE__ */ jsxs3(
            "button",
            {
              type: "button",
              className: isActive ? "btn-primary" : "btn-secondary",
              onClick: () => onOverlayMetricChange?.(m),
              style: { padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 },
              children: [
                /* @__PURE__ */ jsx4("span", { children: conf.icon }),
                /* @__PURE__ */ jsx4("span", { children: conf.label }),
                /* @__PURE__ */ jsxs3("span", { style: { opacity: 0.75, fontSize: 11 }, children: [
                  "(",
                  conf.unit,
                  ")"
                ] })
              ]
            },
            m
          );
        })
      ] }),
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsx4("span", { style: { fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }, children: "Horizon:" }),
        [1, 2, 3, 4, 5, 6, 7].map((d) => {
          const isActive = forecastDay === d;
          return /* @__PURE__ */ jsxs3(
            "button",
            {
              type: "button",
              className: isActive ? "btn-primary" : "btn-secondary",
              onClick: () => onForecastDayChange?.(d),
              style: {
                padding: "4px 8px",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                minWidth: 32,
                textAlign: "center"
              },
              title: `Forecast Day ${d}`,
              children: [
                "D",
                d
              ]
            },
            d
          );
        })
      ] }),
      /* @__PURE__ */ jsxs3("form", { onSubmit: searchCity, className: "field inline", style: { margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }, children: [
        /* @__PURE__ */ jsx4(
          "input",
          {
            type: "search",
            value: cityQuery,
            onChange: (e) => setCityQuery(e.target.value),
            placeholder: "Search city (e.g. Pune)...",
            style: {
              padding: "5px 10px",
              fontSize: 12,
              width: 175,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-strong)"
            }
          }
        ),
        /* @__PURE__ */ jsx4(
          "button",
          {
            type: "submit",
            className: "btn-secondary",
            disabled: citySearchLoading || !cityQuery.trim(),
            style: { padding: "5px 10px", fontSize: 12 },
            children: citySearchLoading ? "..." : "Find"
          }
        )
      ] })
    ] }),
    citySearchMessage && /* @__PURE__ */ jsx4(
      "div",
      {
        role: "status",
        style: {
          padding: "4px 14px",
          fontSize: 11.5,
          background: "var(--accent-subtle)",
          color: "var(--accent)",
          borderBottom: "1px solid var(--border-subtle)"
        },
        children: citySearchMessage
      }
    ),
    geoData && /* @__PURE__ */ jsxs3(
      MapContainer,
      {
        center: [22.5, 82],
        zoom: 5,
        minZoom: 4,
        maxZoom: 14,
        maxBounds: [
          [4, 65],
          [38, 100]
        ],
        scrollWheelZoom: true,
        zoomControl: false,
        attributionControl: false,
        style: {
          height: height || "640px",
          width: "100%",
          background: "#0c1322"
        },
        children: [
          /* @__PURE__ */ jsx4(MapFlyToController, { flyTarget }),
          /* @__PURE__ */ jsx4(ZoomControl, { position: "topright" }),
          /* @__PURE__ */ jsx4(AttributionControl, { position: "bottomright" }),
          /* @__PURE__ */ jsxs3(LayersControl, { position: "topright", children: [
            /* @__PURE__ */ jsx4(LayersControl.BaseLayer, { checked: true, name: "\u{1F5FA}\uFE0F Street Map", children: /* @__PURE__ */ jsx4(
              TileLayer,
              {
                url: TILE_LAYERS.street.url,
                attribution: TILE_LAYERS.street.attribution,
                maxZoom: TILE_LAYERS.street.maxZoom
              }
            ) }),
            /* @__PURE__ */ jsx4(LayersControl.BaseLayer, { name: "\u{1F6F0}\uFE0F Satellite", children: /* @__PURE__ */ jsx4(
              TileLayer,
              {
                url: TILE_LAYERS.satellite.url,
                attribution: TILE_LAYERS.satellite.attribution,
                maxZoom: TILE_LAYERS.satellite.maxZoom
              }
            ) }),
            /* @__PURE__ */ jsx4(LayersControl.BaseLayer, { name: "\u{1F3D4}\uFE0F Terrain", children: /* @__PURE__ */ jsx4(
              TileLayer,
              {
                url: TILE_LAYERS.terrain.url,
                attribution: TILE_LAYERS.terrain.attribution,
                maxZoom: TILE_LAYERS.terrain.maxZoom
              }
            ) }),
            /* @__PURE__ */ jsx4(LayersControl.BaseLayer, { name: "\u{1F319} Dark Mode", children: /* @__PURE__ */ jsx4(
              TileLayer,
              {
                url: TILE_LAYERS.dark.url,
                attribution: TILE_LAYERS.dark.attribution,
                maxZoom: TILE_LAYERS.dark.maxZoom
              }
            ) }),
            /* @__PURE__ */ jsx4(LayersControl.Overlay, { checked: true, name: "\u{1F5FA}\uFE0F State Boundary Choropleth", children: /* @__PURE__ */ jsx4(
              GeoJSON,
              {
                ref: geoJsonRef,
                data: geoData,
                style: styleFeature,
                onEachFeature
              },
              `${overlayMetric}-${forecastDay}-${JSON.stringify(forecasts).length}-${selectedState || ""}`
            ) }),
            /* @__PURE__ */ jsx4(LayersControl.Overlay, { checked: true, name: "\u{1F3D9}\uFE0F Live City Telemetry Markers", children: /* @__PURE__ */ jsx4(
              CityMarkers,
              {
                cities: cityWeather,
                metric: overlayMetric,
                onSelectState
              }
            ) })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs3("div", { className: "map-legend-bar", children: [
      /* @__PURE__ */ jsxs3("span", { style: { fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11 }, children: [
        activeMetricConfig.label,
        " Legend (",
        activeMetricConfig.unit,
        "):"
      ] }),
      activeMetricConfig.bands.map((band) => /* @__PURE__ */ jsxs3("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 }, children: [
        /* @__PURE__ */ jsx4("span", { className: "legend-swatch", style: { background: band.color, boxShadow: "0 0 0 1px rgba(0,0,0,0.12)" } }),
        /* @__PURE__ */ jsx4("span", { children: band.label })
      ] }, band.label)),
      /* @__PURE__ */ jsxs3("div", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, color: "var(--text-muted)", fontSize: 11.5 }, children: [
        lastUpdated && /* @__PURE__ */ jsxs3("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 }, children: [
          "\u{1F534} Live Sync \xB7 ",
          lastUpdated
        ] }),
        /* @__PURE__ */ jsxs3("span", { children: [
          cityLoadMessage ?? `${cityWeather.length} Monitored Cities`,
          " \xB7",
          " ",
          overlayMetric === "temperature" ? `Choropleth: Day ${forecastDay} LightGBM Multi-Output Forecast` : "Choropleth: Regional Aggregated Observations"
        ] })
      ] })
    ] })
  ] });
}
function CityMarkers({
  cities,
  metric,
  onSelectState
}) {
  if (cities.length === 0) return null;
  return /* @__PURE__ */ jsx4(FeatureGroup, { children: cities.map((cw) => {
    const rainEst = getRainfallEstimate(cw.weatherCode);
    return /* @__PURE__ */ jsx4(
      Marker,
      {
        position: [cw.city.lat, cw.city.lng],
        icon: createCityIcon(cw, metric),
        children: /* @__PURE__ */ jsx4(Popup, { children: /* @__PURE__ */ jsxs3(
          "div",
          {
            style: {
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              minWidth: 230,
              padding: "4px 2px"
            },
            children: [
              /* @__PURE__ */ jsxs3("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }, children: [
                /* @__PURE__ */ jsxs3("div", { children: [
                  /* @__PURE__ */ jsx4("div", { style: { fontWeight: 800, fontSize: 15, color: "#0f172a", lineHeight: 1.2 }, children: cw.city.name }),
                  /* @__PURE__ */ jsx4("div", { style: { fontSize: 11, color: "#64748b", fontWeight: 600 }, children: cw.city.state })
                ] }),
                /* @__PURE__ */ jsx4("div", { style: { fontSize: 28, lineHeight: 1 }, children: cw.emoji })
              ] }),
              /* @__PURE__ */ jsxs3(
                "div",
                {
                  style: {
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    color: "#ffffff",
                    marginBottom: 8
                  },
                  children: [
                    /* @__PURE__ */ jsx4("div", { style: { fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }, children: metric === "temperature" ? `${cw.temperature.toFixed(1)}\xB0C` : metric === "humidity" ? `${cw.humidity.toFixed(0)}%` : metric === "rainfall" ? `${rainEst.toFixed(1)} mm` : `${cw.windSpeed.toFixed(0)} km/h` }),
                    /* @__PURE__ */ jsx4("div", { style: { fontSize: 11.5, color: "#38bdf8", fontWeight: 600, marginTop: 4 }, children: cw.description })
                  ]
                }
              ),
              /* @__PURE__ */ jsxs3("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }, children: [
                /* @__PURE__ */ jsxs3("div", { style: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }, children: [
                  /* @__PURE__ */ jsx4("div", { style: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }, children: "Temp" }),
                  /* @__PURE__ */ jsxs3("div", { style: { fontSize: 13, fontWeight: 700, color: "#0f172a" }, children: [
                    cw.temperature.toFixed(1),
                    "\xB0C"
                  ] })
                ] }),
                /* @__PURE__ */ jsxs3("div", { style: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }, children: [
                  /* @__PURE__ */ jsx4("div", { style: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }, children: "Humidity" }),
                  /* @__PURE__ */ jsxs3("div", { style: { fontSize: 13, fontWeight: 700, color: "#0f172a" }, children: [
                    cw.humidity,
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsxs3("div", { style: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }, children: [
                  /* @__PURE__ */ jsx4("div", { style: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }, children: "Wind" }),
                  /* @__PURE__ */ jsxs3("div", { style: { fontSize: 13, fontWeight: 700, color: "#0f172a" }, children: [
                    cw.windSpeed.toFixed(0),
                    " km/h"
                  ] })
                ] }),
                /* @__PURE__ */ jsxs3("div", { style: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 7px" }, children: [
                  /* @__PURE__ */ jsx4("div", { style: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }, children: "Rain Est." }),
                  /* @__PURE__ */ jsxs3("div", { style: { fontSize: 13, fontWeight: 700, color: "#0f172a" }, children: [
                    rainEst.toFixed(1),
                    " mm"
                  ] })
                ] })
              ] }),
              onSelectState && /* @__PURE__ */ jsxs3(
                "button",
                {
                  type: "button",
                  className: "btn-secondary",
                  onClick: () => onSelectState(cw.city.state),
                  style: { width: "100%", padding: "5px 8px", fontSize: 11.5, fontWeight: 600 },
                  children: [
                    "Select ",
                    cw.city.state,
                    " Telemetry \u2192"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs3("div", { style: { marginTop: 6, fontSize: 10, color: "#94a3b8", textAlign: "center" }, children: [
                "Live Open-Meteo observation \xB7 ",
                cw.isDay ? "\u2600\uFE0F Daytime" : "\u{1F319} Nighttime"
              ] })
            ]
          }
        ) })
      },
      `${cw.city.name}|${cw.city.state}`
    );
  }) });
}

// frontend/src/pages/IndiaMapPage.tsx
import { useEffect as useEffect2, useState as useState2 } from "react";
import { Fragment, jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var KEY_STATES = [
  "Maharashtra",
  "Delhi",
  "Karnataka",
  "Tamil Nadu",
  "Uttar Pradesh",
  "Gujarat"
];
function IndiaMapPage({
  selectedState: externalSelectedState,
  onSelectState: externalOnSelectState,
  onNavigateTab
}) {
  const [internalSelectedState, setInternalSelectedState] = useState2("");
  const selectedState = externalSelectedState !== void 0 ? externalSelectedState : internalSelectedState;
  const [overlayMetric, setOverlayMetric] = useState2("temperature");
  const [forecastDay, setForecastDay] = useState2(1);
  const [recentRecords, setRecentRecords] = useState2([]);
  const [forecastTemp, setForecastTemp] = useState2(null);
  const [telemetryLoading, setTelemetryLoading] = useState2(false);
  const [telemetryError, setTelemetryError] = useState2(null);
  function handleSelectState(state) {
    if (externalOnSelectState) {
      externalOnSelectState(state);
    } else {
      setInternalSelectedState(state);
    }
  }
  useEffect2(() => {
    if (!selectedState) {
      setRecentRecords([]);
      setForecastTemp(null);
      setTelemetryError(null);
      setTelemetryLoading(false);
      return;
    }
    let cancelled = false;
    setTelemetryLoading(true);
    setTelemetryError(null);
    const normState = normalizeStateName(selectedState);
    async function loadTelemetry() {
      try {
        const recentRes = await getRecentWeather(normState, 7);
        if (!cancelled) {
          setRecentRecords(recentRes.records ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Could not load recent records for state:", normState, err);
          try {
            const fallbackRecent = await getRecentWeather(selectedState, 7);
            if (!cancelled) setRecentRecords(fallbackRecent.records ?? []);
          } catch {
            if (!cancelled) setRecentRecords([]);
          }
        }
      }
      try {
        const BASE_URL2 = "http://127.0.0.1:8000";
        const forecastRes = await fetch(`${BASE_URL2}/forecast/all?day=${forecastDay}`);
        if (forecastRes.ok) {
          const allForecasts = await forecastRes.json();
          if (!cancelled) {
            const val = allForecasts[normState] ?? allForecasts[selectedState];
            setForecastTemp(val !== void 0 ? val : null);
          }
        } else {
          throw new Error("Failed to load forecast");
        }
      } catch {
        try {
          const fallbackForecasts = await getForecastAll(forecastDay);
          if (!cancelled) {
            const val = fallbackForecasts[normState] ?? fallbackForecasts[selectedState];
            setForecastTemp(val !== void 0 ? val : null);
          }
        } catch {
          if (!cancelled) setForecastTemp(null);
        }
      } finally {
        if (!cancelled) {
          setTelemetryLoading(false);
        }
      }
    }
    void loadTelemetry();
    return () => {
      cancelled = true;
    };
  }, [selectedState, forecastDay]);
  const latestRecord = recentRecords.length > 0 ? recentRecords[recentRecords.length - 1] : null;
  const activeMetricConf = METRIC_CONFIGS[overlayMetric];
  return /* @__PURE__ */ jsxs4("div", { className: "page", style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
    /* @__PURE__ */ jsx5(
      PageHead,
      {
        title: "India Meteorological Intelligence Map",
        desc: "Interactive geospatial weather analytics, state-level LightGBM multi-output forecasts, and live city observations across India.",
        badge: /* @__PURE__ */ jsx5(Badge, { variant: "info", children: "36 States & UTs Monitored" })
      }
    ),
    /* @__PURE__ */ jsxs4("div", { className: "stat-chips", children: [
      /* @__PURE__ */ jsx5(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx5(MapIcon, {}),
          label: "Monitored Regions",
          value: "36 States / UTs",
          sub: "Full national coverage"
        }
      ),
      /* @__PURE__ */ jsx5(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx5(CloudSunIcon, {}),
          label: "Live Feeds",
          value: "150+ Cities",
          sub: "Open-Meteo telemetry"
        }
      ),
      /* @__PURE__ */ jsx5(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx5(SlidersIcon, {}),
          label: "Active Overlay",
          value: `${activeMetricConf.label} (${activeMetricConf.unit})`,
          sub: `Forecast Horizon: Day ${forecastDay}`
        }
      ),
      /* @__PURE__ */ jsx5(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx5(ChipIcon, {}),
          label: "Inference Engine",
          value: "LightGBM Multi-Output",
          sub: "Horizon Day 1 to 7"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "map-layout-grid", children: [
      /* @__PURE__ */ jsx5("div", { children: /* @__PURE__ */ jsx5(
        IndiaMap,
        {
          selectedState,
          onSelectState: handleSelectState,
          overlayMetric,
          onOverlayMetricChange: setOverlayMetric,
          forecastDay,
          onForecastDayChange: setForecastDay,
          height: "650px"
        }
      ) }),
      /* @__PURE__ */ jsx5("div", { children: !selectedState ? /* @__PURE__ */ jsxs4(
        Card,
        {
          title: "State Telemetry",
          subtitle: "Regional intelligence inspector",
          icon: /* @__PURE__ */ jsx5(MapIcon, { style: { width: 16, height: 16, color: "var(--accent)" } }),
          children: [
            /* @__PURE__ */ jsx5(
              EmptyNote,
              {
                title: "No State Selected",
                hint: "Select any state polygon or city marker on the map to inspect regional observations and multi-output forecasts."
              }
            ),
            /* @__PURE__ */ jsxs4("div", { style: { marginTop: 20, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }, children: [
              /* @__PURE__ */ jsx5(
                "div",
                {
                  style: {
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em"
                  },
                  children: "Quick Select Key States:"
                }
              ),
              /* @__PURE__ */ jsx5("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 }, children: KEY_STATES.map((state) => /* @__PURE__ */ jsx5(
                "button",
                {
                  type: "button",
                  className: "btn-secondary",
                  onClick: () => handleSelectState(state),
                  style: { padding: "6px 12px", fontSize: 12 },
                  children: state
                },
                state
              )) })
            ] })
          ]
        }
      ) : /* @__PURE__ */ jsxs4(
        Card,
        {
          title: selectedState,
          subtitle: "Regional Telemetry & Forecast",
          icon: /* @__PURE__ */ jsx5(MapIcon, { style: { width: 16, height: 16, color: "var(--accent)" } }),
          action: /* @__PURE__ */ jsx5(
            "button",
            {
              type: "button",
              className: "btn-outline",
              onClick: () => handleSelectState(""),
              style: { padding: "4px 8px", fontSize: 11.5 },
              children: "Clear Selection"
            }
          ),
          children: [
            /* @__PURE__ */ jsxs4("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, children: [
              /* @__PURE__ */ jsx5(Badge, { variant: "info", children: "Monitored Region" }),
              /* @__PURE__ */ jsx5("span", { style: { fontSize: 11, color: "var(--text-muted)" }, children: "PostgreSQL + LightGBM" })
            ] }),
            telemetryLoading ? /* @__PURE__ */ jsx5(Skeleton, { rows: 5 }) : telemetryError ? /* @__PURE__ */ jsx5(ErrorBanner, { message: telemetryError }) : /* @__PURE__ */ jsxs4(Fragment, { children: [
              /* @__PURE__ */ jsxs4("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }, children: [
                /* @__PURE__ */ jsxs4("div", { className: "stat-chip", style: { padding: "10px 12px" }, children: [
                  /* @__PURE__ */ jsx5("span", { className: "stat-icon", style: { width: 30, height: 30 }, children: /* @__PURE__ */ jsx5(ThermometerIcon, { style: { width: 16, height: 16 } }) }),
                  /* @__PURE__ */ jsxs4("span", { className: "stat-body", children: [
                    /* @__PURE__ */ jsx5("span", { className: "stat-value", style: { fontSize: 16 }, children: forecastTemp !== null ? `${forecastTemp.toFixed(1)}\xB0C` : "\u2014" }),
                    /* @__PURE__ */ jsxs4("span", { className: "stat-label", children: [
                      "Day ",
                      forecastDay,
                      " Forecast"
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "stat-chip", style: { padding: "10px 12px" }, children: [
                  /* @__PURE__ */ jsx5("span", { className: "stat-icon", style: { width: 30, height: 30 }, children: /* @__PURE__ */ jsx5(ThermometerIcon, { style: { width: 16, height: 16 } }) }),
                  /* @__PURE__ */ jsxs4("span", { className: "stat-body", children: [
                    /* @__PURE__ */ jsx5("span", { className: "stat-value", style: { fontSize: 16 }, children: latestRecord ? `${latestRecord.temp_avg.toFixed(1)}\xB0C` : "\u2014" }),
                    /* @__PURE__ */ jsx5("span", { className: "stat-label", children: "Recent Avg Temp" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "stat-chip", style: { padding: "10px 12px" }, children: [
                  /* @__PURE__ */ jsx5("span", { className: "stat-icon", style: { width: 30, height: 30 }, children: /* @__PURE__ */ jsx5(DropletIcon, { style: { width: 16, height: 16 } }) }),
                  /* @__PURE__ */ jsxs4("span", { className: "stat-body", children: [
                    /* @__PURE__ */ jsx5("span", { className: "stat-value", style: { fontSize: 16 }, children: latestRecord ? `${latestRecord.humidity.toFixed(0)}%` : "\u2014" }),
                    /* @__PURE__ */ jsx5("span", { className: "stat-label", children: "Humidity" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs4("div", { className: "stat-chip", style: { padding: "10px 12px" }, children: [
                  /* @__PURE__ */ jsx5("span", { className: "stat-icon", style: { width: 30, height: 30 }, children: /* @__PURE__ */ jsx5(RainIcon, { style: { width: 16, height: 16 } }) }),
                  /* @__PURE__ */ jsxs4("span", { className: "stat-body", children: [
                    /* @__PURE__ */ jsx5("span", { className: "stat-value", style: { fontSize: 16 }, children: latestRecord ? `${latestRecord.rainfall.toFixed(1)} mm` : "\u2014" }),
                    /* @__PURE__ */ jsx5("span", { className: "stat-label", children: "Rainfall" })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxs4(
                "div",
                {
                  style: {
                    borderTop: "1px solid var(--border-subtle)",
                    paddingTop: 12,
                    marginTop: 12
                  },
                  children: [
                    /* @__PURE__ */ jsxs4(
                      "div",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 10
                        },
                        children: [
                          /* @__PURE__ */ jsx5(
                            "span",
                            {
                              style: {
                                fontSize: 11.5,
                                fontWeight: 700,
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em"
                              },
                              children: "7-Day Historical Trend"
                            }
                          ),
                          /* @__PURE__ */ jsx5("span", { style: { fontSize: 11, color: "var(--text-muted)" }, children: "Observed Temp_Avg" })
                        ]
                      }
                    ),
                    recentRecords.length === 0 ? /* @__PURE__ */ jsx5("div", { style: { fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }, children: "Historical trend records loading from database\u2026" }) : /* @__PURE__ */ jsx5(
                      "div",
                      {
                        style: {
                          display: "grid",
                          gridTemplateColumns: `repeat(${recentRecords.length}, 1fr)`,
                          gap: 4,
                          alignItems: "end",
                          height: 70,
                          padding: "4px 0"
                        },
                        children: recentRecords.map((r, i) => {
                          const barHeight = Math.max(16, Math.min(50, (r.temp_avg - 10) / 30 * 50));
                          const color = getTempColor(r.temp_avg);
                          const dateParts = r.date.split("-");
                          const dayLabel = dateParts.length === 3 ? `${dateParts[1]}/${dateParts[2]}` : `D${i + 1}`;
                          return /* @__PURE__ */ jsxs4(
                            "div",
                            {
                              style: {
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 3
                              },
                              title: `${r.date}: Avg ${r.temp_avg.toFixed(1)}\xB0C (Max ${r.temp_max.toFixed(1)}\xB0C, Min ${r.temp_min.toFixed(1)}\xB0C)`,
                              children: [
                                /* @__PURE__ */ jsxs4("span", { style: { fontSize: 9.5, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }, children: [
                                  r.temp_avg.toFixed(0),
                                  "\xB0"
                                ] }),
                                /* @__PURE__ */ jsx5(
                                  "div",
                                  {
                                    style: {
                                      width: "100%",
                                      maxWidth: 16,
                                      height: `${barHeight}px`,
                                      background: color,
                                      borderRadius: 2
                                    }
                                  }
                                ),
                                /* @__PURE__ */ jsx5("span", { style: { fontSize: 9, color: "var(--text-muted)" }, children: dayLabel })
                              ]
                            },
                            r.date
                          );
                        })
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ jsx5(
                "button",
                {
                  type: "button",
                  className: "btn-primary",
                  onClick: () => {
                    if (onNavigateTab) {
                      onNavigateTab("forecast");
                    }
                  },
                  style: {
                    width: "100%",
                    marginTop: 18,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600
                  },
                  children: /* @__PURE__ */ jsx5("span", { children: "Open Full Forecast Details \u2192" })
                }
              )
            ] })
          ]
        }
      ) })
    ] })
  ] });
}

// frontend/tests/mocks/apiFixtures.ts
var SAMPLE_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi"
];
function getMockStates() {
  return { states: SAMPLE_STATES };
}
function getMockDistricts(state) {
  if (state === "Maharashtra") {
    return { districts: ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane"] };
  }
  if (state === "Karnataka") {
    return { districts: ["Bengaluru Urban", "Mysuru", "Hubballi-Dharwad", "Mangaluru", "Belagavi"] };
  }
  return { districts: [`${state} Central`, `${state} North`, `${state} South`] };
}
function getMockLocations(state, district) {
  return {
    locations: [
      `${district} Observatory`,
      `${district} Airport AWS`,
      `${district} Downtown Station`
    ]
  };
}
function getMockModelInfo() {
  return {
    model_name: "LightGBM",
    target: "next 7 days Temp_Avg (deg C)",
    features: [
      "lag1_temp_avg",
      "lag2_temp_avg",
      "lag3_temp_avg",
      "lag1_temp_max",
      "lag1_temp_min",
      "lag1_humidity",
      "lag1_rainfall",
      "lag2_humidity",
      "lag2_rainfall",
      "roll3_temp_avg",
      "roll7_temp_avg",
      "rainfall_roll3",
      "rainfall_roll7",
      "temp_range",
      "month_sin",
      "month_cos",
      "day_of_year_sin",
      "day_of_year_cos",
      "Season",
      "State"
    ],
    train_period: ["2015-01-08", "2025-07-11"],
    test_period: ["2025-10-19", "2026-10-18"],
    trained_through: "2025-07-11",
    q: 1.45,
    coverage_90: 91.2,
    metrics_status: "artifact_evaluated_training_overlap",
    interval_status: "not_calibrated_for_current_artifact",
    evaluation_note: "Historical metrics evaluated on held-out test horizon with temporal embargo.",
    metrics: {
      LightGBM: { MAE: 1.164, RMSE: 1.573, R2: 0.97 },
      Climatology: { MAE: 1.395, RMSE: 1.852, R2: 0.958 },
      Persistence: { MAE: 1.439, RMSE: 1.984, R2: 0.952 },
      RandomForest: { MAE: 1.282, RMSE: 1.714, R2: 0.964 },
      LinearRegression: { MAE: 1.41, RMSE: 1.895, R2: 0.956 }
    }
  };
}
function getMockForecastAll(day = 1) {
  const result = {};
  for (const s of SAMPLE_STATES) {
    result[s] = 24.5 + s.length % 8 + day * 0.4;
  }
  return result;
}
function getMockWeatherRecords(count = 30) {
  const records = [];
  const baseDate = /* @__PURE__ */ new Date("2026-10-30T00:00:00Z");
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const avg = 26.5 + Math.sin(i * 0.3) * 4;
    records.push({
      date: dateStr,
      state: "Maharashtra",
      district: "Mumbai",
      location: "Mumbai Observatory",
      temp_max: Number((avg + 4.2).toFixed(1)),
      temp_avg: Number(avg.toFixed(1)),
      temp_min: Number((avg - 4.1).toFixed(1)),
      humidity: Math.round(65 + Math.cos(i * 0.4) * 15),
      rainfall: Number(Math.max(0, Math.sin(i * 0.5) * 8).toFixed(1))
    });
  }
  return records;
}
function getMockWeatherHistory(count = 30) {
  const records = getMockWeatherRecords(count);
  return {
    state: "Maharashtra",
    district: "Mumbai",
    location: "Mumbai Observatory",
    count: records.length,
    records
  };
}
function getMockPredictions(count = 20) {
  const predictions = [];
  const baseDate = /* @__PURE__ */ new Date("2026-10-30T12:00:00Z");
  for (let i = 1; i <= count; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() - i);
    predictions.push({
      id: 1e3 + i,
      state: SAMPLE_STATES[i % SAMPLE_STATES.length],
      district: "Capital District",
      location: "Primary Observatory",
      forecast_date: d.toISOString().slice(0, 10),
      predicted_temp_avg: [25.4, 26.1, 26.8, 27.2, 26.5, 25.9, 25.1],
      created_at: d.toISOString()
    });
  }
  return {
    count: predictions.length,
    predictions
  };
}

// frontend/tests/mocks/useFetchMock.ts
var globalOverride = null;
function useFetch(fn, deps) {
  if (globalOverride !== null) {
    if (typeof globalOverride === "function") {
      return globalOverride(fn, deps);
    }
    return globalOverride;
  }
  const fnStr = fn.toString();
  if (fnStr.includes("getModelInfo")) {
    return { data: getMockModelInfo(), loading: false, error: null, retry: () => {
    } };
  }
  if (fnStr.includes("getStates")) {
    return { data: getMockStates(), loading: false, error: null, retry: () => {
    } };
  }
  if (fnStr.includes("getDistricts")) {
    return { data: getMockDistricts("Maharashtra"), loading: false, error: null, retry: () => {
    } };
  }
  if (fnStr.includes("getLocations")) {
    return { data: getMockLocations("Maharashtra", "Mumbai"), loading: false, error: null, retry: () => {
    } };
  }
  if (fnStr.includes("getPredictions")) {
    return { data: getMockPredictions(), loading: false, error: null, retry: () => {
    } };
  }
  if (fnStr.includes("getForecastAll")) {
    return { data: getMockForecastAll(), loading: false, error: null, retry: () => {
    } };
  }
  if (fnStr.includes("getWeatherHistory")) {
    return { data: getMockWeatherHistory(), loading: false, error: null, retry: () => {
    } };
  }
  return { data: null, loading: false, error: null, retry: () => {
  } };
}

// frontend/src/pages/MLDashboardPage.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var FEATURE_TAXONOMY = [
  {
    category: "Temperature Lags",
    count: 5,
    features: ["lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg", "lag1_temp_max", "lag1_temp_min"],
    rationale: "Yesterday's and recent days' observed temperatures provide the strongest single autocorrelation signal. Multi-day lags capture immediate thermal momentum and short-term cooling/warming rates across synoptic scales."
  },
  {
    category: "Atmospheric Lags",
    count: 4,
    features: ["lag1_humidity", "lag1_rainfall", "lag2_humidity", "lag2_rainfall"],
    rationale: "Moisture content and precipitation induce evaporative cooling and cloud radiation feedback loops, directly modulating subsequent ambient day-night temperature swings."
  },
  {
    category: "Derived Trends",
    count: 5,
    features: ["roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7", "temp_range"],
    rationale: "Rolling 3-day and 7-day window aggregations smooth high-frequency sensor noise to isolate multi-day synoptic weather systems, while diurnal temperature range (max \u2212 min) reflects boundary layer stability."
  },
  {
    category: "Cyclical Temporal Embeddings",
    count: 4,
    features: ["month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos"],
    rationale: "Trigonometric sine and cosine projections preserve seasonal continuity, mapping transition points such as December 31 and January 1 to proximate coordinates in euclidean feature space."
  },
  {
    category: "Geographic Categoricals",
    count: 2,
    features: ["Season", "State"],
    rationale: "Categorical state indicators (36 monitored Indian regions) and India Meteorological Department (IMD) calendar seasons enable the model to calibrate distinct agro-climatic baseline offsets."
  }
];
var TECH_STACK = [
  "Python 3.11",
  "LightGBM",
  "scikit-learn",
  "FastAPI",
  "PostgreSQL",
  "React 18",
  "TypeScript",
  "Vite",
  "Recharts",
  "Leaflet"
];
var SAFEGUARDS = [
  {
    title: "Strict Temporal Cutoff (date < asof)",
    detail: "Every lag and rolling aggregate is computed exclusively from historical records strictly preceding the forecast reference date (date < asof). SQL ingestion queries and feature transformers enforce hard temporal boundaries, eliminating any lookahead contamination."
  },
  {
    title: "8-Day Target Window Embargo",
    detail: "Because the multi-output architecture forecasts a 7-day horizon, observations within 7 days of partition boundaries contain future target measurements. An 8-day temporal embargo window is strictly enforced between train, calibration, and test splits to guarantee zero label leakage."
  },
  {
    title: "Per-State Rolling Calculation Isolation",
    detail: "Rolling window statistics (roll3_temp_avg, roll7_temp_avg, rainfall_roll7, etc.) are computed grouped strictly by geographic state entity. Aggregations never leak across state borders or across disconnected observation runs."
  },
  {
    title: "Runtime Staleness Enforcers (MAX_STALENESS_DAYS = 2)",
    detail: "Production inference endpoints reject predictions if the latest available observation for a given state exceeds MAX_STALENESS_DAYS = 2 or contains fewer than 7 consecutive historical records (REQUIRED_HISTORY = 7), preventing degraded inference on outdated baselines."
  },
  {
    title: "Conformal Interval Calibration Gate",
    detail: "Prediction uncertainty intervals are held behind an explicit calibration gate. Unless model metadata certifies empirical residual calibration for the exact active artifact hash (interval_status === 'calibrated'), interval bounds are omitted from responses to prevent false precision claims."
  }
];
var API_ENDPOINTS = [
  {
    method: "GET",
    path: "/forecast/all",
    params: "day: int (1..7, def: 1), date: YYYY-MM-DD (opt)",
    returnType: "Record<string, number>",
    description: "Returns nationwide predicted temperatures across all 36 states and union territories for a selected horizon day."
  },
  {
    method: "POST",
    path: "/predict",
    params: "{ state, forecast_date, district?, location? }",
    returnType: "PredictionResponse",
    description: "Generates full 7-day multi-output temperature trajectory, diurnal range, meteorological summary, and calibrated uncertainty bounds."
  },
  {
    method: "GET",
    path: "/model-info",
    params: "None",
    returnType: "ModelInfoResponse",
    description: "Exposes active model metadata, 20 engineered feature names, multi-horizon evaluation metrics, and temporal split boundaries."
  },
  {
    method: "GET",
    path: "/weather/{state}/recent",
    params: "state: str, days: int (def: 30), district?, location?",
    returnType: "WeatherResponse",
    description: "Fetches recent historical daily ground truth observations (max, avg, min, humidity, rainfall) from PostgreSQL storage."
  },
  {
    method: "GET",
    path: "/weather/history",
    params: "state: str, limit: int, offset: int, district?, location?",
    returnType: "WeatherResponse",
    description: "Queries historical weather time-series records supporting chronological pagination, location filtering, and statistical analysis."
  },
  {
    method: "GET",
    path: "/health",
    params: "None",
    returnType: "HealthResponse",
    description: "Liveness and readiness probe reporting PostgreSQL database connection state and LightGBM model artifact memory status."
  }
];
function MLDashboardPage() {
  const info = useFetch(getModelInfo, []);
  if (info.loading) {
    return /* @__PURE__ */ jsx6(Spinner, { label: "Loading machine learning architecture overview\u2026" });
  }
  if (info.error) {
    return /* @__PURE__ */ jsx6(ErrorBanner, { message: info.error.message });
  }
  const modelData = info.data;
  const modelName = modelData?.model_name || "LightGBM";
  const features = modelData?.features || [];
  const selected = modelData?.metrics?.[modelName] || modelData?.metrics?.LightGBM;
  const evalObj = modelData?.evaluation;
  const trainPeriod = modelData?.train_period || ["2015-01-08", "2025-07-11"];
  const testPeriod = modelData?.test_period || ["2025-10-19", "2026-10-18"];
  const evaluationNote = modelData?.evaluation_note;
  const metricsStatus = modelData?.metrics_status;
  return /* @__PURE__ */ jsxs5("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
    /* @__PURE__ */ jsx6(
      PageHead,
      {
        title: "Machine Learning System Architecture",
        desc: "Technical specification of the multi-output LightGBM weather forecasting pipeline, feature taxonomy, anti-leakage safeguards, and REST deployment architecture.",
        badge: /* @__PURE__ */ jsx6(Badge, { variant: "neutral", children: "LightGBM v3" })
      }
    ),
    metricsStatus && /* @__PURE__ */ jsxs5("div", { className: "advisory-callout", children: [
      /* @__PURE__ */ jsx6("strong", { children: "Evaluation Status: " }),
      metricsStatus === "validated_for_current_artifact" ? "Evaluation metrics are strictly validated for the active production model artifact." : evaluationNote ?? "Reported metrics reflect out-of-time evaluation across 12,045 holdout test records with an 8-day target embargo."
    ] }),
    /* @__PURE__ */ jsxs5("div", { className: "stat-chips", children: [
      /* @__PURE__ */ jsx6(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx6(ChipIcon, {}),
          label: "Model Engine",
          value: `${modelName} v3`,
          sub: "Multi-Output Regressor"
        }
      ),
      /* @__PURE__ */ jsx6(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx6(TargetIcon, {}),
          label: "Test-Set MAE",
          value: selected?.MAE !== void 0 ? `\xB1${selected.MAE.toFixed(2)}\xB0C` : "\xB11.16\xB0C",
          sub: "7-day horizon mean"
        }
      ),
      /* @__PURE__ */ jsx6(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx6(ChartIcon, {}),
          label: "Test-Set R\xB2",
          value: selected?.R2 !== void 0 ? selected.R2.toFixed(4) : "0.9697",
          sub: "Variance explained"
        }
      ),
      /* @__PURE__ */ jsx6(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx6(SlidersIcon, {}),
          label: "Features",
          value: features.length || 20,
          sub: "Engineered predictors"
        }
      ),
      /* @__PURE__ */ jsx6(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx6(DatabaseIcon, {}),
          label: "Training History",
          value: evalObj?.row_counts?.train ? `${evalObj.row_counts.train.toLocaleString()} records` : "126,654 records",
          sub: `${trainPeriod[0]} to ${trainPeriod[1]}`
        }
      ),
      /* @__PURE__ */ jsx6(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx6(CalendarIcon, {}),
          label: "Embargo Period",
          value: evalObj?.embargo_origin_days ? `${evalObj.embargo_origin_days} days` : "8 days",
          sub: "Anti-leakage boundary"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs5(
      Card,
      {
        title: "System Architecture",
        icon: /* @__PURE__ */ jsx6(DatabaseIcon, {}),
        subtitle: "End-to-end data lineage from historical meteorological ingestion to real-time client inference.",
        children: [
          /* @__PURE__ */ jsxs5("div", { className: "arch-flow", children: [
            /* @__PURE__ */ jsxs5("span", { className: "arch-node", children: [
              /* @__PURE__ */ jsx6(DatabaseIcon, {}),
              /* @__PURE__ */ jsx6("span", { children: "Raw Data (PostgreSQL)" })
            ] }),
            /* @__PURE__ */ jsx6("span", { className: "arch-arrow", children: "\u2192" }),
            /* @__PURE__ */ jsxs5("span", { className: "arch-node", children: [
              /* @__PURE__ */ jsx6(SlidersIcon, {}),
              /* @__PURE__ */ jsx6("span", { children: "Feature Pipeline (20 features)" })
            ] }),
            /* @__PURE__ */ jsx6("span", { className: "arch-arrow", children: "\u2192" }),
            /* @__PURE__ */ jsxs5("span", { className: "arch-node", children: [
              /* @__PURE__ */ jsx6(ChipIcon, {}),
              /* @__PURE__ */ jsx6("span", { children: "LightGBM Multi-Output (7 horizons)" })
            ] }),
            /* @__PURE__ */ jsx6("span", { className: "arch-arrow", children: "\u2192" }),
            /* @__PURE__ */ jsxs5("span", { className: "arch-node", children: [
              /* @__PURE__ */ jsx6(CloudSunIcon, {}),
              /* @__PURE__ */ jsx6("span", { children: "FastAPI Inference Service" })
            ] }),
            /* @__PURE__ */ jsx6("span", { className: "arch-arrow", children: "\u2192" }),
            /* @__PURE__ */ jsxs5("span", { className: "arch-node", children: [
              /* @__PURE__ */ jsx6(ChartIcon, {}),
              /* @__PURE__ */ jsx6("span", { children: "React 18 Enterprise UI" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs5("div", { style: { marginTop: 14 }, children: [
            /* @__PURE__ */ jsx6(
              "div",
              {
                style: {
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-faint)",
                  marginBottom: 8
                },
                children: "Technology Stack"
              }
            ),
            /* @__PURE__ */ jsx6("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: TECH_STACK.map((tech) => /* @__PURE__ */ jsx6(Badge, { variant: "neutral", children: tech }, tech)) })
          ] }),
          /* @__PURE__ */ jsxs5("p", { style: { marginTop: 16, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }, children: [
            "Data flows unidirectionally from left to right: raw meteorological observations across 36 Indian states and union territories are ingested and durably stored in ",
            /* @__PURE__ */ jsx6("strong", { children: "PostgreSQL" }),
            ". The feature pipeline constructs 20 lag, trend, and calendar embeddings strictly prior to prediction time. The",
            " ",
            /* @__PURE__ */ jsx6("strong", { children: "LightGBM" }),
            " regressor generates 7 simultaneous day horizons, which are exposed via",
            " ",
            /* @__PURE__ */ jsx6("strong", { children: "FastAPI" }),
            " REST endpoints and visualized in this ",
            /* @__PURE__ */ jsx6("strong", { children: "React 18" }),
            " enterprise platform."
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx6(
      Card,
      {
        title: "Feature Taxonomy",
        icon: /* @__PURE__ */ jsx6(SlidersIcon, {}),
        subtitle: "20 engineered predictors constructed exclusively from historical weather observations and calendar embeddings.",
        children: /* @__PURE__ */ jsx6("div", { className: "feature-groups-grid", children: FEATURE_TAXONOMY.map((group) => {
          const matchedItems = features && features.length > 0 ? group.features.filter((f) => features.includes(f)) : group.features;
          const count = matchedItems.length || group.count;
          return /* @__PURE__ */ jsxs5("div", { className: "feature-card", children: [
            /* @__PURE__ */ jsxs5("div", { className: "feature-card-header", children: [
              /* @__PURE__ */ jsx6("span", { className: "feature-card-title", children: group.category }),
              /* @__PURE__ */ jsxs5(Badge, { variant: "neutral", children: [
                count,
                " ",
                count === 1 ? "feature" : "features"
              ] })
            ] }),
            /* @__PURE__ */ jsx6("div", { className: "feature-tag-list", children: group.features.map((feature) => /* @__PURE__ */ jsx6("span", { className: "feature-tag", children: feature }, feature)) }),
            /* @__PURE__ */ jsx6("p", { className: "feature-card-desc", children: group.rationale })
          ] }, group.category);
        }) })
      }
    ),
    /* @__PURE__ */ jsxs5(
      Card,
      {
        title: "Training Pipeline & Anti-Leakage Safeguards",
        icon: /* @__PURE__ */ jsx6(ChipIcon, {}),
        subtitle: "Multi-horizon temporal validation partitions and strict data-leakage elimination protocols.",
        children: [
          /* @__PURE__ */ jsxs5("dl", { className: "result-meta-strip", style: { marginTop: 0, marginBottom: 16 }, children: [
            /* @__PURE__ */ jsxs5("div", { className: "meta-block", children: [
              /* @__PURE__ */ jsx6("dt", { children: "Model Architecture" }),
              /* @__PURE__ */ jsx6("dd", { children: "LightGBM Multi-Output Regressor" })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "meta-block", children: [
              /* @__PURE__ */ jsx6("dt", { children: "Target Horizons" }),
              /* @__PURE__ */ jsx6("dd", { children: "7 Simultaneous Outputs (Temp_Avg)" })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "meta-block", children: [
              /* @__PURE__ */ jsx6("dt", { children: "Pipeline Preprocessor" }),
              /* @__PURE__ */ jsx6("dd", { children: "StandardScaler + OneHotEncoder" })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "meta-block", children: [
              /* @__PURE__ */ jsx6("dt", { children: "Optimization Objective" }),
              /* @__PURE__ */ jsx6("dd", { children: "Mean Squared Error (Regression L2)" })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "meta-block", children: [
              /* @__PURE__ */ jsx6("dt", { children: "Evaluation Error" }),
              /* @__PURE__ */ jsxs5("dd", { children: [
                "MAE \xB1",
                selected?.MAE !== void 0 ? selected.MAE.toFixed(2) : "1.16",
                "\xB0C"
              ] })
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "meta-block", children: [
              /* @__PURE__ */ jsx6("dt", { children: "Random State" }),
              /* @__PURE__ */ jsx6("dd", { children: "42 (Deterministic Seed)" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs5("div", { style: { marginBottom: 18 }, children: [
            /* @__PURE__ */ jsx6(
              "div",
              {
                style: {
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-secondary)",
                  marginBottom: 8
                },
                children: "Temporal Split Specification & Embargo Protocol"
              }
            ),
            /* @__PURE__ */ jsx6("div", { className: "table-wrap", children: /* @__PURE__ */ jsxs5("table", { children: [
              /* @__PURE__ */ jsx6("thead", { children: /* @__PURE__ */ jsxs5("tr", { children: [
                /* @__PURE__ */ jsx6("th", { children: "Partition Stage" }),
                /* @__PURE__ */ jsx6("th", { children: "Date Range" }),
                /* @__PURE__ */ jsx6("th", { children: "Span / Duration" }),
                /* @__PURE__ */ jsx6("th", { className: "num", children: "Records" }),
                /* @__PURE__ */ jsx6("th", { children: "Pipeline Role & Leakage Barrier" })
              ] }) }),
              /* @__PURE__ */ jsxs5("tbody", { children: [
                /* @__PURE__ */ jsxs5("tr", { children: [
                  /* @__PURE__ */ jsx6("td", { className: "strong", children: /* @__PURE__ */ jsxs5("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx6(Badge, { variant: "default", children: "Training" }),
                    "Historical Train Partition"
                  ] }) }),
                  /* @__PURE__ */ jsxs5("td", { children: [
                    /* @__PURE__ */ jsx6("code", { children: trainPeriod[0] }),
                    " \u2192 ",
                    /* @__PURE__ */ jsx6("code", { children: trainPeriod[1] })
                  ] }),
                  /* @__PURE__ */ jsx6("td", { children: "10.5 Years" }),
                  /* @__PURE__ */ jsx6("td", { className: "num", children: evalObj?.row_counts?.train ? evalObj.row_counts.train.toLocaleString() : "126,654" }),
                  /* @__PURE__ */ jsx6("td", { children: "Fits gradient boosted trees on lagged meteorological features across 36 states/UTs" })
                ] }),
                /* @__PURE__ */ jsxs5("tr", { style: { background: "var(--bg-surface-subtle)" }, children: [
                  /* @__PURE__ */ jsx6("td", { className: "strong", children: /* @__PURE__ */ jsxs5("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx6(Badge, { variant: "warning", children: "Embargo" }),
                    "Target Window Buffer"
                  ] }) }),
                  /* @__PURE__ */ jsxs5("td", { children: [
                    /* @__PURE__ */ jsx6("code", { children: "2025-07-12" }),
                    " \u2192 ",
                    /* @__PURE__ */ jsx6("code", { children: "2025-07-18" })
                  ] }),
                  /* @__PURE__ */ jsx6("td", { children: "8 Days" }),
                  /* @__PURE__ */ jsx6("td", { className: "num", children: "\u2014" }),
                  /* @__PURE__ */ jsx6("td", { children: "Eliminates 7-day target lookahead leakage between training cutoff and calibration" })
                ] }),
                /* @__PURE__ */ jsxs5("tr", { children: [
                  /* @__PURE__ */ jsx6("td", { className: "strong", children: /* @__PURE__ */ jsxs5("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx6(Badge, { variant: "info", children: "Calibration" }),
                    "Residual Calibration Partition"
                  ] }) }),
                  /* @__PURE__ */ jsxs5("td", { children: [
                    /* @__PURE__ */ jsx6("code", { children: "2025-07-19" }),
                    " \u2192 ",
                    /* @__PURE__ */ jsx6("code", { children: "2025-10-11" })
                  ] }),
                  /* @__PURE__ */ jsx6("td", { children: "84 Days" }),
                  /* @__PURE__ */ jsx6("td", { className: "num", children: evalObj?.row_counts?.calibration ? evalObj.row_counts.calibration.toLocaleString() : "2,805" }),
                  /* @__PURE__ */ jsx6("td", { children: "Evaluates residual distribution quantiles for conformal prediction interval bounds" })
                ] }),
                /* @__PURE__ */ jsxs5("tr", { style: { background: "var(--bg-surface-subtle)" }, children: [
                  /* @__PURE__ */ jsx6("td", { className: "strong", children: /* @__PURE__ */ jsxs5("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx6(Badge, { variant: "warning", children: "Embargo" }),
                    "Evaluation Buffer"
                  ] }) }),
                  /* @__PURE__ */ jsxs5("td", { children: [
                    /* @__PURE__ */ jsx6("code", { children: "2025-10-12" }),
                    " \u2192 ",
                    /* @__PURE__ */ jsx6("code", { children: "2025-10-18" })
                  ] }),
                  /* @__PURE__ */ jsx6("td", { children: "8 Days" }),
                  /* @__PURE__ */ jsx6("td", { className: "num", children: "\u2014" }),
                  /* @__PURE__ */ jsx6("td", { children: "Guarantees statistical independence between residual calibration and test data" })
                ] }),
                /* @__PURE__ */ jsxs5("tr", { children: [
                  /* @__PURE__ */ jsx6("td", { className: "strong", children: /* @__PURE__ */ jsxs5("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx6(Badge, { variant: "success", children: "Test" }),
                    "Holdout Test Partition"
                  ] }) }),
                  /* @__PURE__ */ jsxs5("td", { children: [
                    /* @__PURE__ */ jsx6("code", { children: testPeriod[0] }),
                    " \u2192 ",
                    /* @__PURE__ */ jsx6("code", { children: testPeriod[1] })
                  ] }),
                  /* @__PURE__ */ jsx6("td", { children: "1 Full Year" }),
                  /* @__PURE__ */ jsx6("td", { className: "num", children: evalObj?.row_counts?.test ? evalObj.row_counts.test.toLocaleString() : "12,045" }),
                  /* @__PURE__ */ jsx6("td", { children: "Unbiased out-of-time evaluation across all 4 seasons (MAE \xB11.16\xB0C, R\xB2 0.9697)" })
                ] })
              ] })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxs5("div", { children: [
            /* @__PURE__ */ jsx6(
              "div",
              {
                style: {
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-secondary)",
                  marginBottom: 10
                },
                children: "Anti-Leakage Safeguards"
              }
            ),
            /* @__PURE__ */ jsx6(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 14
                },
                children: SAFEGUARDS.map((s, idx) => /* @__PURE__ */ jsxs5(
                  "div",
                  {
                    style: {
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      borderTop: "3px solid var(--info)",
                      borderRadius: "var(--radius-md)",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      boxShadow: "var(--shadow-xs)"
                    },
                    children: [
                      /* @__PURE__ */ jsxs5("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }, children: [
                        /* @__PURE__ */ jsx6("strong", { style: { fontSize: 13, color: "var(--text-primary)", lineHeight: 1.4 }, children: s.title }),
                        /* @__PURE__ */ jsx6(Badge, { variant: "info", children: idx + 1 })
                      ] }),
                      /* @__PURE__ */ jsx6("p", { style: { margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }, children: s.detail })
                    ]
                  },
                  s.title
                ))
              }
            )
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5(
      Card,
      {
        title: "REST API Endpoints & Deployment Spec",
        icon: /* @__PURE__ */ jsx6(DatabaseIcon, {}),
        subtitle: "Standardized HTTP interface documentation and production system deployment specifications.",
        children: [
          /* @__PURE__ */ jsx6("div", { className: "table-wrap", children: /* @__PURE__ */ jsxs5("table", { children: [
            /* @__PURE__ */ jsx6("thead", { children: /* @__PURE__ */ jsxs5("tr", { children: [
              /* @__PURE__ */ jsx6("th", { style: { width: 85 }, children: "Method" }),
              /* @__PURE__ */ jsx6("th", { children: "Endpoint Path" }),
              /* @__PURE__ */ jsx6("th", { children: "Parameters" }),
              /* @__PURE__ */ jsx6("th", { children: "Return Type" }),
              /* @__PURE__ */ jsx6("th", { children: "Description & Operational Scope" })
            ] }) }),
            /* @__PURE__ */ jsx6("tbody", { children: API_ENDPOINTS.map((ep) => /* @__PURE__ */ jsxs5("tr", { children: [
              /* @__PURE__ */ jsx6("td", { children: /* @__PURE__ */ jsx6(Badge, { variant: ep.method === "POST" ? "success" : "info", children: ep.method }) }),
              /* @__PURE__ */ jsx6("td", { children: /* @__PURE__ */ jsx6(
                "code",
                {
                  style: {
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--text-primary)"
                  },
                  children: ep.path
                }
              ) }),
              /* @__PURE__ */ jsx6("td", { children: /* @__PURE__ */ jsx6(
                "code",
                {
                  style: {
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--text-secondary)"
                  },
                  children: ep.params
                }
              ) }),
              /* @__PURE__ */ jsx6("td", { children: /* @__PURE__ */ jsx6(
                "code",
                {
                  style: {
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    color: "var(--accent)"
                  },
                  children: ep.returnType
                }
              ) }),
              /* @__PURE__ */ jsx6("td", { style: { fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "normal" }, children: ep.description })
            ] }, ep.path)) })
          ] }) }),
          /* @__PURE__ */ jsxs5(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
                marginTop: 20
              },
              children: [
                /* @__PURE__ */ jsx6(Card, { title: "PostgreSQL Durability", icon: /* @__PURE__ */ jsx6(DatabaseIcon, {}), subtitle: "ACID Persistence & Auditability", children: /* @__PURE__ */ jsx6("p", { style: { margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }, children: "Historical ground truth weather records across 36 Indian states and immutable prediction audit trails are persisted in PostgreSQL. Relational schema constraints, foreign keys, and advisory locks guarantee data integrity and resilience against concurrent ingestion failures." }) }),
                /* @__PURE__ */ jsx6(Card, { title: "Caching & Concurrency", icon: /* @__PURE__ */ jsx6(SlidersIcon, {}), subtitle: "Sub-10ms Pipeline Execution", children: /* @__PURE__ */ jsx6("p", { style: { margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }, children: "The serialized LightGBM v3 pipeline artifact is loaded into memory on FastAPI application startup. Asynchronous request handling and vectorized scikit-learn transformers execute sub-10ms predictions under concurrent client load." }) }),
                /* @__PURE__ */ jsx6(Card, { title: "Continuous Model Validation", icon: /* @__PURE__ */ jsx6(TargetIcon, {}), subtitle: "Out-of-Time Quality Assurance", children: /* @__PURE__ */ jsx6("p", { style: { margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }, children: "Operational predictions are continuously verified against real-world observations as new weather feeds are ingested. Automated regression suites, strict hash verification (weather_model_v3.joblib), and temporal splits eliminate data leakage and performance regressions." }) })
              ]
            }
          )
        ]
      }
    )
  ] });
}

// frontend/src/pages/WeatherHistoryPage.tsx
import { useEffect as useEffect3, useMemo as useMemo2, useState as useState3 } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Fragment as Fragment2, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
var TOTAL_DB_RECORDS = 46834;
var FETCH_PAGE_SIZE = 1e3;
function prettyDate(iso) {
  if (!iso) return "\u2014";
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return iso;
  }
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(void 0, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}
function shortDate(iso) {
  if (!iso || iso.length < 5) return iso ?? "";
  return iso.slice(5);
}
function WeatherChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return /* @__PURE__ */ jsxs6(
    "div",
    {
      style: {
        background: "rgba(15, 23, 42, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 8,
        padding: "10px 14px",
        color: "#ffffff",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        minWidth: 190
      },
      children: [
        /* @__PURE__ */ jsx7(
          "div",
          {
            style: {
              fontWeight: 700,
              marginBottom: 6,
              borderBottom: "1px solid rgba(255,255,255,0.15)",
              paddingBottom: 4,
              letterSpacing: "-0.01em"
            },
            children: prettyDate(label)
          }
        ),
        /* @__PURE__ */ jsxs6("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
          /* @__PURE__ */ jsxs6("div", { style: { display: "flex", justifyContent: "space-between", gap: 12 }, children: [
            /* @__PURE__ */ jsxs6("span", { style: { color: "#ea580c", display: "inline-flex", alignItems: "center", gap: 4 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "\u25CF" }),
              " Max Temp:"
            ] }),
            /* @__PURE__ */ jsxs6("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums" }, children: [
              data.temp_max.toFixed(1),
              " \xB0C"
            ] })
          ] }),
          /* @__PURE__ */ jsxs6("div", { style: { display: "flex", justifyContent: "space-between", gap: 12 }, children: [
            /* @__PURE__ */ jsxs6("span", { style: { color: "#cbd5e1", display: "inline-flex", alignItems: "center", gap: 4 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "\u25CF" }),
              " Avg Temp:"
            ] }),
            /* @__PURE__ */ jsxs6("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums" }, children: [
              data.temp_avg.toFixed(1),
              " \xB0C"
            ] })
          ] }),
          /* @__PURE__ */ jsxs6("div", { style: { display: "flex", justifyContent: "space-between", gap: 12 }, children: [
            /* @__PURE__ */ jsxs6("span", { style: { color: "#38bdf8", display: "inline-flex", alignItems: "center", gap: 4 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "\u25CF" }),
              " Min Temp:"
            ] }),
            /* @__PURE__ */ jsxs6("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums" }, children: [
              data.temp_min.toFixed(1),
              " \xB0C"
            ] })
          ] }),
          /* @__PURE__ */ jsxs6("div", { style: { display: "flex", justifyContent: "space-between", gap: 12 }, children: [
            /* @__PURE__ */ jsxs6("span", { style: { color: "#60a5fa", display: "inline-flex", alignItems: "center", gap: 4 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "\u{1F4A7}" }),
              " Humidity:"
            ] }),
            /* @__PURE__ */ jsxs6("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums" }, children: [
              data.humidity.toFixed(0),
              " %"
            ] })
          ] }),
          /* @__PURE__ */ jsxs6("div", { style: { display: "flex", justifyContent: "space-between", gap: 12 }, children: [
            /* @__PURE__ */ jsxs6("span", { style: { color: "#a5b4fc", display: "inline-flex", alignItems: "center", gap: 4 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "\u{1F327}\uFE0F" }),
              " Rainfall:"
            ] }),
            /* @__PURE__ */ jsxs6("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums" }, children: [
              data.rainfall.toFixed(1),
              " mm"
            ] })
          ] })
        ] })
      ]
    }
  );
}
function WeatherHistoryPage() {
  const states = useFetch(getStates, []);
  const [state, setState] = useState3("");
  const [district, setDistrict] = useState3("");
  const [location, setLocation] = useState3("");
  const [startDate, setStartDate] = useState3("");
  const [endDate, setEndDate] = useState3("");
  const [searchQuery, setSearchQuery] = useState3("");
  const [records, setRecords] = useState3([]);
  const [total, setTotal] = useState3(0);
  const [loading, setLoading] = useState3(false);
  const [loadingMore, setLoadingMore] = useState3(false);
  const [error, setError] = useState3(null);
  const [retryKey, setRetryKey] = useState3(0);
  const [sortKey, setSortKey] = useState3("date");
  const [sortOrder, setSortOrder] = useState3("desc");
  const [page, setPage] = useState3(1);
  const [pageSize, setPageSize] = useState3(25);
  const [chartView, setChartView] = useState3("temperature");
  const districtsFetch = useFetch(
    () => state ? getDistricts(state) : Promise.resolve(null),
    [state]
  );
  const locationsFetch = useFetch(
    () => state && district ? getLocations(state, district) : Promise.resolve(null),
    [state, district]
  );
  const hasDistricts = (districtsFetch.data?.districts.length ?? 0) > 0;
  const hasLocations = (locationsFetch.data?.locations.length ?? 0) > 0;
  useEffect3(() => {
    if (!state) {
      setRecords([]);
      setTotal(0);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchArchiveData() {
      setLoading(true);
      setError(null);
      try {
        const resp = await getWeatherHistory(state, FETCH_PAGE_SIZE, 0, district, location);
        if (!cancelled) {
          setRecords(resp.records);
          setTotal(resp.count);
          setPage(1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void fetchArchiveData();
    return () => {
      cancelled = true;
    };
  }, [state, district, location, retryKey]);
  async function loadMoreRecords() {
    if (loading || loadingMore || records.length >= total) return;
    setLoadingMore(true);
    setError(null);
    try {
      const resp = await getWeatherHistory(state, FETCH_PAGE_SIZE, records.length, district, location);
      setRecords((prev) => [...prev, ...resp.records]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }
  function onStateChange(newState) {
    setState(newState);
    setDistrict("");
    setLocation("");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setPage(1);
  }
  function onDistrictChange(newDistrict) {
    setDistrict(newDistrict);
    setLocation("");
    setPage(1);
  }
  function onLocationChange(newLocation) {
    setLocation(newLocation);
    setPage(1);
  }
  function resetFilters() {
    setState("");
    setDistrict("");
    setLocation("");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setPage(1);
    setSortKey("date");
    setSortOrder("desc");
  }
  function applyDatePreset(days) {
    if (records.length === 0) return;
    const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
    const latestDateStr = sorted[0]?.date;
    if (!latestDateStr) return;
    const latest = /* @__PURE__ */ new Date(latestDateStr + "T00:00:00Z");
    const past = new Date(latest);
    past.setUTCDate(past.getUTCDate() - days);
    const startIso = past.toISOString().slice(0, 10);
    setStartDate(startIso);
    setEndDate(latestDateStr);
    setPage(1);
  }
  function toggleSort(key) {
    if (sortKey === key) {
      setSortOrder((prev) => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder(key === "date" ? "desc" : "desc");
    }
    setPage(1);
  }
  function renderSortIndicator(key) {
    if (sortKey !== key) {
      return /* @__PURE__ */ jsx7("span", { style: { fontSize: 10, color: "var(--text-faint)", marginLeft: 4 }, children: "\u21C5" });
    }
    return /* @__PURE__ */ jsx7("span", { style: { fontSize: 11, color: "var(--accent)", marginLeft: 4, fontWeight: 700 }, children: sortOrder === "asc" ? "\u25B2" : "\u25BC" });
  }
  const filteredRecords = useMemo2(() => {
    return records.filter((r) => {
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const dateMatch = r.date.toLowerCase().includes(q) || prettyDate(r.date).toLowerCase().includes(q);
        const stationMatch = r.state && r.state.toLowerCase().includes(q) || r.district && r.district.toLowerCase().includes(q) || r.location && r.location.toLowerCase().includes(q);
        const remarksMatch = r.rainfall > 0 && "rainfall rain wet showers precipitation".includes(q) || r.rainfall === 0 && "dry sunny clear".includes(q) || r.temp_avg >= 35 && "hot heat sunny".includes(q) || r.temp_avg <= 15 && "cold chill winter cool".includes(q) || r.humidity >= 80 && "humid overcast damp".includes(q);
        if (!dateMatch && !stationMatch && !remarksMatch) return false;
      }
      return true;
    });
  }, [records, startDate, endDate, searchQuery]);
  const sortedRecords = useMemo2(() => {
    return [...filteredRecords].sort((a, b) => {
      if (sortKey === "date") {
        return sortOrder === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      }
      if (sortKey === "wind_speed") {
        const aVal2 = a.wind_speed ?? 0;
        const bVal2 = b.wind_speed ?? 0;
        return sortOrder === "asc" ? aVal2 - bVal2 : bVal2 - aVal2;
      }
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [filteredRecords, sortKey, sortOrder]);
  const totalFiltered = sortedRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = totalFiltered > 0 ? (safePage - 1) * pageSize : 0;
  const endIndex = Math.min(totalFiltered, startIndex + pageSize);
  const paginatedRows = sortedRecords.slice(startIndex, endIndex);
  const chartData = useMemo2(() => {
    return [...filteredRecords].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredRecords]);
  const loadedCount = filteredRecords.length;
  const meanAvgTemp = loadedCount > 0 ? filteredRecords.reduce((acc, r) => acc + r.temp_avg, 0) / loadedCount : null;
  const meanMinTemp = loadedCount > 0 ? filteredRecords.reduce((acc, r) => acc + r.temp_min, 0) / loadedCount : null;
  const meanMaxTemp = loadedCount > 0 ? filteredRecords.reduce((acc, r) => acc + r.temp_max, 0) / loadedCount : null;
  const meanHumidity = loadedCount > 0 ? filteredRecords.reduce((acc, r) => acc + r.humidity, 0) / loadedCount : null;
  const totalRainfall = loadedCount > 0 ? filteredRecords.reduce((acc, r) => acc + r.rainfall, 0) : null;
  const rainDaysCount = loadedCount > 0 ? filteredRecords.filter((r) => r.rainfall > 0.1).length : 0;
  const firstDate = chartData[0]?.date;
  const lastDate = chartData[chartData.length - 1]?.date;
  const dateSpanDays = firstDate && lastDate ? Math.round(
    ((/* @__PURE__ */ new Date(lastDate + "T00:00:00Z")).getTime() - (/* @__PURE__ */ new Date(firstDate + "T00:00:00Z")).getTime()) / (1e3 * 60 * 60 * 24)
  ) + 1 : 0;
  const locSummary = location ? `${location}, ${district}, ${state}` : district ? `${district}, ${state}` : state || "India";
  return /* @__PURE__ */ jsxs6("div", { className: "page", children: [
    /* @__PURE__ */ jsx7(
      PageHead,
      {
        title: "Weather History Archive",
        desc: "Explore 46,834 locked meteorological observations stored across Indian states, districts, and stations in PostgreSQL.",
        badge: /* @__PURE__ */ jsx7(Badge, { variant: "info", children: "46,834 Locked Rows" })
      }
    ),
    /* @__PURE__ */ jsxs6("section", { className: "panel", style: { marginBottom: 20 }, children: [
      /* @__PURE__ */ jsxs6("div", { className: "panel-header", children: [
        /* @__PURE__ */ jsxs6("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ jsxs6("h3", { className: "panel-title", children: [
            /* @__PURE__ */ jsx7(SlidersIcon, {}),
            " Query & Observation Filters"
          ] }),
          /* @__PURE__ */ jsx7("span", { style: { fontSize: 12, color: "var(--text-muted)" }, children: "\u2022 Cascading Geography, Date Range & Text Match" })
        ] }),
        /* @__PURE__ */ jsx7("div", { className: "panel-action", children: /* @__PURE__ */ jsxs6(
          "button",
          {
            type: "button",
            className: "btn-outline",
            onClick: resetFilters,
            title: "Reset all filters and restore initial state",
            children: [
              /* @__PURE__ */ jsx7(RefreshIcon, { style: { width: 13, height: 13 } }),
              " Reset Filters"
            ]
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxs6(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 16
          },
          children: [
            /* @__PURE__ */ jsxs6("label", { className: "field", style: { margin: 0 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "State" }),
              states.loading ? /* @__PURE__ */ jsx7(Spinner, { label: "Loading states\u2026" }) : states.error ? /* @__PURE__ */ jsx7(ErrorBanner, { message: states.error.message }) : /* @__PURE__ */ jsxs6("select", { value: state, onChange: (e) => onStateChange(e.target.value), children: [
                /* @__PURE__ */ jsx7("option", { value: "", children: "Select an Indian state\u2026" }),
                states.data?.states.map((s) => /* @__PURE__ */ jsx7("option", { value: s, children: s }, s))
              ] })
            ] }),
            /* @__PURE__ */ jsxs6("label", { className: "field", style: { margin: 0 }, children: [
              /* @__PURE__ */ jsxs6("span", { children: [
                "District ",
                hasDistricts ? "" : "(State-level records)"
              ] }),
              districtsFetch.loading ? /* @__PURE__ */ jsx7(Spinner, { label: "Loading districts\u2026" }) : /* @__PURE__ */ jsxs6(
                "select",
                {
                  value: district,
                  onChange: (e) => onDistrictChange(e.target.value),
                  disabled: !state || !hasDistricts,
                  children: [
                    /* @__PURE__ */ jsx7("option", { value: "", children: hasDistricts ? "All districts (or choose specific)" : "No sub-districts in DB" }),
                    districtsFetch.data?.districts.map((d) => /* @__PURE__ */ jsx7("option", { value: d, children: d }, d))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs6("label", { className: "field", style: { margin: 0 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "Location Station" }),
              locationsFetch.loading ? /* @__PURE__ */ jsx7(Spinner, { label: "Loading stations\u2026" }) : /* @__PURE__ */ jsxs6(
                "select",
                {
                  value: location,
                  onChange: (e) => onLocationChange(e.target.value),
                  disabled: !district || !hasLocations,
                  children: [
                    /* @__PURE__ */ jsx7("option", { value: "", children: hasLocations ? "All stations (or choose specific)" : "No stations in district" }),
                    locationsFetch.data?.locations.map((l) => /* @__PURE__ */ jsx7("option", { value: l, children: l }, l))
                  ]
                }
              )
            ] })
          ]
        }
      ),
      /* @__PURE__ */ jsxs6(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 14,
            alignItems: "flex-end"
          },
          children: [
            /* @__PURE__ */ jsxs6("label", { className: "field", style: { margin: 0 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "Start Date" }),
              /* @__PURE__ */ jsx7(
                "input",
                {
                  type: "date",
                  value: startDate,
                  onChange: (e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  },
                  disabled: !state
                }
              )
            ] }),
            /* @__PURE__ */ jsxs6("label", { className: "field", style: { margin: 0 }, children: [
              /* @__PURE__ */ jsx7("span", { children: "End Date" }),
              /* @__PURE__ */ jsx7(
                "input",
                {
                  type: "date",
                  value: endDate,
                  onChange: (e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  },
                  disabled: !state
                }
              )
            ] }),
            /* @__PURE__ */ jsxs6("label", { className: "field", style: { margin: 0, gridColumn: "span 2" }, children: [
              /* @__PURE__ */ jsx7("span", { children: "Search Observations" }),
              /* @__PURE__ */ jsxs6("div", { style: { position: "relative", width: "100%" }, children: [
                /* @__PURE__ */ jsx7(
                  "input",
                  {
                    type: "search",
                    placeholder: "Filter by date (YYYY-MM), station, or remarks (e.g. rain, hot)\u2026",
                    value: searchQuery,
                    onChange: (e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    },
                    disabled: !state,
                    style: { paddingLeft: 34 }
                  }
                ),
                /* @__PURE__ */ jsx7(
                  SearchIcon,
                  {
                    style: {
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 16,
                      height: 16,
                      color: "var(--text-muted)",
                      pointerEvents: "none"
                    }
                  }
                )
              ] })
            ] })
          ]
        }
      ),
      state && records.length > 0 && /* @__PURE__ */ jsxs6(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            flexWrap: "wrap",
            fontSize: 12
          },
          children: [
            /* @__PURE__ */ jsx7("span", { style: { color: "var(--text-muted)", fontWeight: 600 }, children: "Quick Window:" }),
            /* @__PURE__ */ jsx7(
              "button",
              {
                type: "button",
                className: "btn-outline",
                onClick: () => applyDatePreset(30),
                style: { padding: "3px 8px", fontSize: 11.5 },
                children: "Past 30 Days"
              }
            ),
            /* @__PURE__ */ jsx7(
              "button",
              {
                type: "button",
                className: "btn-outline",
                onClick: () => applyDatePreset(90),
                style: { padding: "3px 8px", fontSize: 11.5 },
                children: "Past 90 Days"
              }
            ),
            /* @__PURE__ */ jsx7(
              "button",
              {
                type: "button",
                className: "btn-outline",
                onClick: () => applyDatePreset(365),
                style: { padding: "3px 8px", fontSize: 11.5 },
                children: "Past 1 Year"
              }
            ),
            /* @__PURE__ */ jsx7(
              "button",
              {
                type: "button",
                className: "btn-outline",
                onClick: () => {
                  setStartDate("");
                  setEndDate("");
                  setPage(1);
                },
                style: { padding: "3px 8px", fontSize: 11.5 },
                children: "All Records"
              }
            ),
            records.length < total && /* @__PURE__ */ jsx7(
              "button",
              {
                type: "button",
                className: "btn-secondary",
                onClick: loadMoreRecords,
                disabled: loadingMore,
                style: { marginLeft: "auto", padding: "4px 10px", fontSize: 11.5 },
                children: loadingMore ? "Loading older rows\u2026" : `Fetch Older Rows (${(total - records.length).toLocaleString()} remaining in DB)`
              }
            )
          ]
        }
      )
    ] }),
    loading && records.length === 0 && /* @__PURE__ */ jsx7(Skeleton, { rows: 6 }),
    error && /* @__PURE__ */ jsx7(
      ErrorBanner,
      {
        message: error,
        onRetry: () => setRetryKey((k) => k + 1)
      }
    ),
    !loading && !error && !state && /* @__PURE__ */ jsx7(
      EmptyNote,
      {
        title: "Select a Weather Region",
        hint: "Choose an Indian state from the filter toolbar above to load historical meteorological observations."
      }
    ),
    !loading && !error && state && records.length === 0 && /* @__PURE__ */ jsx7(
      EmptyNote,
      {
        title: "No Historical Observations",
        hint: "The PostgreSQL database returned no historical measurements for this selection."
      }
    ),
    records.length > 0 && /* @__PURE__ */ jsxs6("div", { className: "stat-chips", style: { marginBottom: 20 }, children: [
      /* @__PURE__ */ jsx7(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx7(DatabaseIcon, {}),
          label: "Total Database Records",
          value: TOTAL_DB_RECORDS.toLocaleString(),
          sub: "Locked PostgreSQL rows"
        }
      ),
      /* @__PURE__ */ jsx7(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx7(ChartIcon, {}),
          label: "Loaded Rows",
          value: loadedCount.toLocaleString(),
          sub: filteredRecords.length !== records.length ? `${records.length.toLocaleString()} rows in memory` : `${total.toLocaleString()} rows in DB`
        }
      ),
      /* @__PURE__ */ jsx7(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx7(ThermometerIcon, {}),
          label: "Mean Avg Temp (\xB0C)",
          value: meanAvgTemp != null ? `${meanAvgTemp.toFixed(1)} \xB0C` : "\u2014",
          sub: meanMinTemp != null && meanMaxTemp != null ? `Diurnal: ${meanMinTemp.toFixed(1)}\xB0 \u2013 ${meanMaxTemp.toFixed(1)}\xB0` : void 0
        }
      ),
      /* @__PURE__ */ jsx7(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx7(DropletIcon, {}),
          label: "Mean Humidity (%)",
          value: meanHumidity != null ? `${meanHumidity.toFixed(0)} %` : "\u2014",
          sub: "Relative air humidity"
        }
      ),
      /* @__PURE__ */ jsx7(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx7(RainIcon, {}),
          label: "Total Rainfall (mm)",
          value: totalRainfall != null ? `${totalRainfall.toFixed(1)} mm` : "\u2014",
          sub: `${rainDaysCount} rain days in window`
        }
      ),
      /* @__PURE__ */ jsx7(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx7(CalendarIcon, {}),
          label: "Observation Date Range",
          value: firstDate && lastDate ? `${firstDate} \u2192 ${lastDate}` : "\u2014",
          sub: `${dateSpanDays} total calendar days`
        }
      )
    ] }),
    records.length > 0 && chartData.length > 0 && /* @__PURE__ */ jsx7(
      Card,
      {
        title: "Historical Meteorological Trend",
        subtitle: `Chronological observation timeline for ${locSummary} (${chartData.length.toLocaleString()} plotted points).`,
        icon: /* @__PURE__ */ jsx7(ChartIcon, {}),
        action: /* @__PURE__ */ jsxs6("div", { style: { display: "flex", gap: 4 }, children: [
          /* @__PURE__ */ jsx7(
            "button",
            {
              type: "button",
              className: chartView === "temperature" ? "btn-primary" : "btn-outline",
              onClick: () => setChartView("temperature"),
              style: { padding: "4px 8px", fontSize: 11.5 },
              children: "Temperature (\xB0C)"
            }
          ),
          /* @__PURE__ */ jsx7(
            "button",
            {
              type: "button",
              className: chartView === "hydrology" ? "btn-primary" : "btn-outline",
              onClick: () => setChartView("hydrology"),
              style: { padding: "4px 8px", fontSize: 11.5 },
              children: "Rainfall & Humidity"
            }
          ),
          /* @__PURE__ */ jsx7(
            "button",
            {
              type: "button",
              className: chartView === "combined" ? "btn-primary" : "btn-outline",
              onClick: () => setChartView("combined"),
              style: { padding: "4px 8px", fontSize: 11.5 },
              children: "Combined View"
            }
          )
        ] }),
        className: "chart-card",
        children: /* @__PURE__ */ jsx7("div", { style: { height: 320, width: "100%", margin: "8px 0" }, children: /* @__PURE__ */ jsx7(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs6(
          ComposedChart,
          {
            data: chartData,
            margin: { top: 10, right: chartView !== "temperature" ? 30 : 20, bottom: 5, left: 0 },
            children: [
              /* @__PURE__ */ jsx7(CartesianGrid, { stroke: "#e2e8f0", strokeDasharray: "3 3", vertical: false }),
              /* @__PURE__ */ jsx7(
                XAxis,
                {
                  dataKey: "date",
                  tick: { fontSize: 11, fill: "#64748b" },
                  tickFormatter: shortDate
                }
              ),
              chartView === "temperature" && /* @__PURE__ */ jsx7(
                YAxis,
                {
                  tick: { fontSize: 11, fill: "#64748b" },
                  domain: ["dataMin - 2", "dataMax + 2"],
                  tickFormatter: (v) => v.toFixed(1),
                  unit: " \xB0C"
                }
              ),
              chartView === "hydrology" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
                /* @__PURE__ */ jsx7(
                  YAxis,
                  {
                    yAxisId: "left",
                    tick: { fontSize: 11, fill: "#64748b" },
                    domain: [0, 100],
                    unit: " %"
                  }
                ),
                /* @__PURE__ */ jsx7(
                  YAxis,
                  {
                    yAxisId: "right",
                    orientation: "right",
                    tick: { fontSize: 11, fill: "#64748b" },
                    unit: " mm"
                  }
                )
              ] }),
              chartView === "combined" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
                /* @__PURE__ */ jsx7(
                  YAxis,
                  {
                    yAxisId: "temp",
                    tick: { fontSize: 11, fill: "#64748b" },
                    domain: ["dataMin - 2", "dataMax + 2"],
                    tickFormatter: (v) => v.toFixed(1),
                    unit: " \xB0C"
                  }
                ),
                /* @__PURE__ */ jsx7(
                  YAxis,
                  {
                    yAxisId: "rain",
                    orientation: "right",
                    tick: { fontSize: 11, fill: "#64748b" },
                    unit: " mm"
                  }
                )
              ] }),
              /* @__PURE__ */ jsx7(Tooltip, { content: /* @__PURE__ */ jsx7(WeatherChartTooltip, {}) }),
              /* @__PURE__ */ jsx7(Legend, { wrapperStyle: { fontSize: 12, paddingTop: 8 } }),
              (chartView === "temperature" || chartView === "combined") && /* @__PURE__ */ jsxs6(Fragment2, { children: [
                /* @__PURE__ */ jsx7(
                  Line,
                  {
                    yAxisId: chartView === "combined" ? "temp" : void 0,
                    type: "monotone",
                    dataKey: "temp_max",
                    name: "Observed Max Temp",
                    stroke: "#ea580c",
                    strokeWidth: 1.5,
                    dot: false
                  }
                ),
                /* @__PURE__ */ jsx7(
                  Line,
                  {
                    yAxisId: chartView === "combined" ? "temp" : void 0,
                    type: "monotone",
                    dataKey: "temp_avg",
                    name: "Observed Avg Temp",
                    stroke: "#0f172a",
                    strokeWidth: 2,
                    dot: false
                  }
                ),
                /* @__PURE__ */ jsx7(
                  Line,
                  {
                    yAxisId: chartView === "combined" ? "temp" : void 0,
                    type: "monotone",
                    dataKey: "temp_min",
                    name: "Observed Min Temp",
                    stroke: "#0284c7",
                    strokeWidth: 1.5,
                    dot: false
                  }
                )
              ] }),
              chartView === "hydrology" && /* @__PURE__ */ jsxs6(Fragment2, { children: [
                /* @__PURE__ */ jsx7(
                  Line,
                  {
                    yAxisId: "left",
                    type: "monotone",
                    dataKey: "humidity",
                    name: "Relative Humidity",
                    stroke: "#0284c7",
                    strokeWidth: 1.8,
                    dot: false
                  }
                ),
                /* @__PURE__ */ jsx7(
                  Bar,
                  {
                    yAxisId: "right",
                    dataKey: "rainfall",
                    name: "Rainfall (mm)",
                    fill: "#2563eb",
                    opacity: 0.6
                  }
                )
              ] }),
              chartView === "combined" && /* @__PURE__ */ jsx7(
                Bar,
                {
                  yAxisId: "rain",
                  dataKey: "rainfall",
                  name: "Rainfall (mm)",
                  fill: "#38bdf8",
                  opacity: 0.4
                }
              )
            ]
          }
        ) }) })
      }
    ),
    records.length > 0 && /* @__PURE__ */ jsx7(
      Card,
      {
        title: "Structured Observation Archive",
        subtitle: `Tabular daily records for ${locSummary} (${totalFiltered.toLocaleString()} matching records). Sort columns or paginate below.`,
        icon: /* @__PURE__ */ jsx7(DatabaseIcon, {}),
        children: filteredRecords.length === 0 ? /* @__PURE__ */ jsx7(
          EmptyNote,
          {
            title: "No Records Match Current Filters",
            hint: "Try clearing your search query or expanding the date range window.",
            action: /* @__PURE__ */ jsx7("button", { type: "button", className: "btn-secondary", onClick: resetFilters, children: "Clear Search & Filters" })
          }
        ) : /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsx7("div", { className: "table-wrap", children: /* @__PURE__ */ jsxs6("table", { children: [
            /* @__PURE__ */ jsx7("thead", { children: /* @__PURE__ */ jsxs6("tr", { children: [
              /* @__PURE__ */ jsx7(
                "th",
                {
                  onClick: () => toggleSort("date"),
                  style: { cursor: "pointer", userSelect: "none" },
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") toggleSort("date");
                  },
                  children: /* @__PURE__ */ jsxs6("div", { style: { display: "inline-flex", alignItems: "center" }, children: [
                    /* @__PURE__ */ jsx7("span", { children: "Date" }),
                    renderSortIndicator("date")
                  ] })
                }
              ),
              /* @__PURE__ */ jsx7(
                "th",
                {
                  className: "num",
                  onClick: () => toggleSort("temp_max"),
                  style: { cursor: "pointer", userSelect: "none" },
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") toggleSort("temp_max");
                  },
                  children: /* @__PURE__ */ jsxs6(
                    "div",
                    {
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        width: "100%"
                      },
                      children: [
                        /* @__PURE__ */ jsx7("span", { children: "Temp Max (\xB0C)" }),
                        renderSortIndicator("temp_max")
                      ]
                    }
                  )
                }
              ),
              /* @__PURE__ */ jsx7(
                "th",
                {
                  className: "num",
                  onClick: () => toggleSort("temp_avg"),
                  style: { cursor: "pointer", userSelect: "none" },
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") toggleSort("temp_avg");
                  },
                  children: /* @__PURE__ */ jsxs6(
                    "div",
                    {
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        width: "100%"
                      },
                      children: [
                        /* @__PURE__ */ jsx7("span", { children: "Temp Avg (\xB0C)" }),
                        renderSortIndicator("temp_avg")
                      ]
                    }
                  )
                }
              ),
              /* @__PURE__ */ jsx7(
                "th",
                {
                  className: "num",
                  onClick: () => toggleSort("temp_min"),
                  style: { cursor: "pointer", userSelect: "none" },
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") toggleSort("temp_min");
                  },
                  children: /* @__PURE__ */ jsxs6(
                    "div",
                    {
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        width: "100%"
                      },
                      children: [
                        /* @__PURE__ */ jsx7("span", { children: "Temp Min (\xB0C)" }),
                        renderSortIndicator("temp_min")
                      ]
                    }
                  )
                }
              ),
              /* @__PURE__ */ jsx7(
                "th",
                {
                  className: "num",
                  onClick: () => toggleSort("humidity"),
                  style: { cursor: "pointer", userSelect: "none" },
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") toggleSort("humidity");
                  },
                  children: /* @__PURE__ */ jsxs6(
                    "div",
                    {
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        width: "100%"
                      },
                      children: [
                        /* @__PURE__ */ jsx7("span", { children: "Humidity (%)" }),
                        renderSortIndicator("humidity")
                      ]
                    }
                  )
                }
              ),
              /* @__PURE__ */ jsx7(
                "th",
                {
                  className: "num",
                  onClick: () => toggleSort("rainfall"),
                  style: { cursor: "pointer", userSelect: "none" },
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") toggleSort("rainfall");
                  },
                  children: /* @__PURE__ */ jsxs6(
                    "div",
                    {
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        width: "100%"
                      },
                      children: [
                        /* @__PURE__ */ jsx7("span", { children: "Rainfall (mm)" }),
                        renderSortIndicator("rainfall")
                      ]
                    }
                  )
                }
              ),
              /* @__PURE__ */ jsx7(
                "th",
                {
                  className: "num",
                  onClick: () => toggleSort("wind_speed"),
                  style: { cursor: "pointer", userSelect: "none" },
                  role: "button",
                  tabIndex: 0,
                  onKeyDown: (e) => {
                    if (e.key === "Enter" || e.key === " ") toggleSort("wind_speed");
                  },
                  children: /* @__PURE__ */ jsxs6(
                    "div",
                    {
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        width: "100%"
                      },
                      children: [
                        /* @__PURE__ */ jsx7("span", { children: "Wind Speed" }),
                        renderSortIndicator("wind_speed")
                      ]
                    }
                  )
                }
              )
            ] }) }),
            /* @__PURE__ */ jsx7("tbody", { children: paginatedRows.map((r) => /* @__PURE__ */ jsxs6("tr", { children: [
              /* @__PURE__ */ jsx7("td", { title: r.date, children: prettyDate(r.date) }),
              /* @__PURE__ */ jsx7("td", { className: "num", children: r.temp_max.toFixed(1) }),
              /* @__PURE__ */ jsx7("td", { className: "num strong", children: r.temp_avg.toFixed(1) }),
              /* @__PURE__ */ jsx7("td", { className: "num", children: r.temp_min.toFixed(1) }),
              /* @__PURE__ */ jsxs6("td", { className: "num", children: [
                r.humidity.toFixed(0),
                " %"
              ] }),
              /* @__PURE__ */ jsx7("td", { className: "num", children: r.rainfall.toFixed(1) }),
              /* @__PURE__ */ jsx7("td", { className: "num", style: { color: "var(--text-faint)" }, children: r.wind_speed != null ? `${Number(r.wind_speed).toFixed(1)} km/h` : "\u2014" })
            ] }, `${r.date}-${r.state}-${r.district || ""}-${r.location || ""}`)) })
          ] }) }),
          /* @__PURE__ */ jsxs6(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 18px",
                borderTop: "1px solid var(--border-subtle)",
                flexWrap: "wrap",
                gap: 12,
                background: "#f8fafc"
              },
              children: [
                /* @__PURE__ */ jsxs6("div", { style: { fontSize: 13, color: "var(--text-secondary)" }, children: [
                  "Showing ",
                  /* @__PURE__ */ jsx7("strong", { children: startIndex + 1 }),
                  " to ",
                  /* @__PURE__ */ jsx7("strong", { children: endIndex }),
                  " of",
                  " ",
                  /* @__PURE__ */ jsx7("strong", { children: totalFiltered.toLocaleString() }),
                  " records",
                  records.length < total && /* @__PURE__ */ jsxs6("span", { style: { marginLeft: 8, color: "var(--text-muted)", fontSize: 12 }, children: [
                    "(",
                    records.length.toLocaleString(),
                    " of ",
                    total.toLocaleString(),
                    " rows in memory)"
                  ] })
                ] }),
                /* @__PURE__ */ jsxs6("div", { style: { display: "flex", alignItems: "center", gap: 14 }, children: [
                  /* @__PURE__ */ jsxs6(
                    "div",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12.5,
                        color: "var(--text-secondary)"
                      },
                      children: [
                        /* @__PURE__ */ jsx7("span", { children: "Rows per page:" }),
                        /* @__PURE__ */ jsxs6(
                          "select",
                          {
                            value: pageSize,
                            onChange: (e) => {
                              setPageSize(Number(e.target.value));
                              setPage(1);
                            },
                            style: { width: "auto", padding: "4px 28px 4px 10px", fontSize: 12.5 },
                            children: [
                              /* @__PURE__ */ jsx7("option", { value: 25, children: "25" }),
                              /* @__PURE__ */ jsx7("option", { value: 50, children: "50" }),
                              /* @__PURE__ */ jsx7("option", { value: 100, children: "100" })
                            ]
                          }
                        )
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs6("div", { style: { fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }, children: [
                    "Page ",
                    safePage,
                    " of ",
                    totalPages
                  ] }),
                  /* @__PURE__ */ jsxs6("div", { style: { display: "flex", gap: 6 }, children: [
                    /* @__PURE__ */ jsxs6(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary",
                        onClick: () => setPage((p) => Math.max(1, p - 1)),
                        disabled: safePage <= 1,
                        "aria-label": "Previous page",
                        style: { padding: "6px 10px" },
                        children: [
                          /* @__PURE__ */ jsx7(ChevronLeftIcon, { style: { width: 16, height: 16 } }),
                          /* @__PURE__ */ jsx7("span", { children: "Previous" })
                        ]
                      }
                    ),
                    /* @__PURE__ */ jsxs6(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary",
                        onClick: () => setPage((p) => Math.min(totalPages, p + 1)),
                        disabled: safePage >= totalPages,
                        "aria-label": "Next page",
                        style: { padding: "6px 10px" },
                        children: [
                          /* @__PURE__ */ jsx7("span", { children: "Next" }),
                          /* @__PURE__ */ jsx7(ChevronRightIcon, { style: { width: 16, height: 16 } })
                        ]
                      }
                    )
                  ] })
                ] })
              ]
            }
          )
        ] })
      }
    )
  ] });
}

// frontend/src/pages/ModelPerformancePage.tsx
import { useState as useState4 } from "react";
import {
  Bar as Bar2,
  BarChart,
  CartesianGrid as CartesianGrid2,
  Cell,
  Legend as Legend2,
  Line as Line2,
  LineChart,
  ResponsiveContainer as ResponsiveContainer2,
  Tooltip as Tooltip2,
  XAxis as XAxis2,
  YAxis as YAxis2
} from "recharts";
import { jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
var FALLBACK_HORIZONS = [
  { day: 1, mae: 0.9251, rmse: 1.2517, r2: 0.9808, skill: 10.3 },
  { day: 2, mae: 1.0623, rmse: 1.4286, r2: 0.975, skill: 13.4 },
  { day: 3, mae: 1.1485, rmse: 1.5408, r2: 0.9709, skill: 16 },
  { day: 4, mae: 1.2022, rmse: 1.6155, r2: 0.9681, skill: 19.2 },
  { day: 5, mae: 1.2478, rmse: 1.6795, r2: 0.9655, skill: 21.4 },
  { day: 6, mae: 1.269, rmse: 1.7046, r2: 0.9645, skill: 23.1 },
  { day: 7, mae: 1.2906, rmse: 1.7334, r2: 0.9632, skill: 25 }
];
function categorizeFeatures(features) {
  const groups = [
    {
      label: "Temporal Lag Inputs",
      count: 0,
      description: "Auto-regressive measurements from preceding days (t-1, t-2, t-3) capturing inertia.",
      items: features.filter((f) => f.startsWith("lag"))
    },
    {
      label: "Rolling & Dynamics",
      count: 0,
      description: "Short and medium-term moving windows capturing thermal trends and diurnal temperature range.",
      items: features.filter((f) => f.startsWith("roll") || f.startsWith("rainfall_roll") || f === "temp_range")
    },
    {
      label: "Seasonal & Cyclic",
      count: 0,
      description: "Sine and cosine trigonometric cyclic encodings for annual calendar and day-of-year solar progression.",
      items: features.filter((f) => /^(month|day_of_year)_/.test(f))
    },
    {
      label: "Geographical & Meteorological Domain",
      count: 0,
      description: "One-hot state identity and bioclimatic season encodings capturing regional micro-climates.",
      items: features.filter((f) => ["Season", "State"].includes(f))
    }
  ];
  return groups.map((g) => ({ ...g, count: g.items.length })).filter((g) => g.count > 0);
}
function ModelPerformancePage() {
  const info = useFetch(getModelInfo, []);
  const [metricTab, setMetricTab] = useState4("MAE");
  if (info.loading) return /* @__PURE__ */ jsx8(Spinner, { label: "Loading model evaluation and benchmarking metadata\u2026" });
  if (info.error) return /* @__PURE__ */ jsx8(ErrorBanner, { message: info.error.message });
  if (!info.data) return null;
  const {
    model_name,
    target,
    features,
    metrics,
    train_period,
    test_period,
    metrics_status,
    evaluation_note
  } = info.data;
  const validated_for_artifact = info.data.validated_for_artifact;
  const selected = metrics[model_name] ?? metrics["LightGBM"];
  const isValidated = metrics_status === "validated_for_current_artifact" || validated_for_artifact === true;
  const rawByHorizon = selected?.by_horizon;
  const horizonData = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const key = `day_${d}`;
    const h = rawByHorizon?.[key];
    const fallback = FALLBACK_HORIZONS[d - 1];
    return {
      day: `Day ${d}`,
      dayNum: d,
      label: `Day ${d} (t+${d})`,
      MAE: Number((h?.MAE ?? fallback.mae).toFixed(3)),
      RMSE: Number((h?.RMSE ?? fallback.rmse).toFixed(3)),
      R2: Number((h?.R2 ?? fallback.r2).toFixed(4)),
      skill: fallback.skill
    };
  });
  const comparisonModels = [
    {
      name: "LightGBM Multi-Output",
      shortName: "LightGBM (Prod)",
      type: "Production Gradient Boosted Trees",
      isProduction: true,
      MAE: Number((metrics["LightGBM"]?.MAE ?? 1.1636).toFixed(4)),
      RMSE: Number((metrics["LightGBM"]?.RMSE ?? 1.5731).toFixed(4)),
      R2: Number((metrics["LightGBM"]?.R2 ?? 0.9697).toFixed(4)),
      skill: "+19.1%",
      status: isValidated ? "Production Validated" : "Evaluated Test Overlap",
      statusVariant: isValidated ? "success" : "warning"
    },
    {
      name: "Random Forest (Tuned)",
      shortName: "Random Forest",
      type: "Tuned Ensemble Benchmark",
      isProduction: false,
      MAE: Number((metrics["Random Forest"]?.MAE ?? 1.2842).toFixed(4)),
      RMSE: Number((metrics["Random Forest"]?.RMSE ?? 1.7145).toFixed(4)),
      R2: Number((metrics["Random Forest"]?.R2 ?? 0.9634).toFixed(4)),
      skill: "+10.7%",
      status: "Candidate Benchmark",
      statusVariant: "neutral"
    },
    {
      name: "Linear Regression",
      shortName: "Linear Reg",
      type: "Multivariate Linear Baseline",
      isProduction: false,
      MAE: Number((metrics["Linear Regression"]?.MAE ?? 1.3512).toFixed(4)),
      RMSE: Number((metrics["Linear Regression"]?.RMSE ?? 1.7963).toFixed(4)),
      R2: Number((metrics["Linear Regression"]?.R2 ?? 0.9592).toFixed(4)),
      skill: "+6.1%",
      status: "Linear Baseline",
      statusVariant: "neutral"
    },
    {
      name: "Climatology Reference",
      shortName: "Climatology",
      type: "Historical 30-Day Mean Reference",
      isProduction: false,
      MAE: Number((metrics["Climatology"]?.MAE ?? 1.3947).toFixed(4)),
      RMSE: Number((metrics["Climatology"]?.RMSE ?? 1.8525).toFixed(4)),
      R2: Number((metrics["Climatology"]?.R2 ?? 0.958).toFixed(4)),
      skill: "+3.1%",
      status: "Statistical Baseline",
      statusVariant: "neutral"
    },
    {
      name: "Persistence Reference",
      shortName: "Persistence",
      type: "Naive Tomorrow=Today Reference (t-1)",
      isProduction: false,
      MAE: Number((metrics["Persistence"]?.MAE ?? 1.4386).toFixed(4)),
      RMSE: Number((metrics["Persistence"]?.RMSE ?? 1.9844).toFixed(4)),
      R2: Number((metrics["Persistence"]?.R2 ?? 0.9518).toFixed(4)),
      skill: "0.0% (Reference)",
      status: "Naive Baseline",
      statusVariant: "neutral"
    }
  ];
  const overallMae = selected?.MAE ?? 1.1636;
  const overallRmse = selected?.RMSE ?? 1.5731;
  const overallR2 = selected?.R2 ?? 0.9697;
  const coveragePercent = info.data.coverage_90 ? (info.data.coverage_90 * 100).toFixed(1) : "89.4";
  const conformalQ = info.data.q ? info.data.q.toFixed(2) : "2.84";
  return /* @__PURE__ */ jsxs7("div", { className: "page", children: [
    /* @__PURE__ */ jsx8(
      PageHead,
      {
        title: "Model Evaluation & Benchmarking",
        desc: "Rigorous empirical evaluation of the production LightGBM multi-output model against baseline benchmarks on out-of-time test partitions.",
        badge: /* @__PURE__ */ jsx8(Badge, { variant: isValidated ? "success" : "warning", children: isValidated ? "Production Validated" : "Diagnostic Overlap (Unvalidated)" }),
        children: /* @__PURE__ */ jsx8(Badge, { neutral: true, children: "Artifact: weather_model_v3.joblib" })
      }
    ),
    /* @__PURE__ */ jsxs7("div", { className: "stat-chips", children: [
      /* @__PURE__ */ jsx8(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx8(ChipIcon, {}),
          label: "Production Model",
          value: "LightGBM Multi-Output",
          sub: "7-Day Joint Regressor"
        }
      ),
      /* @__PURE__ */ jsx8(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx8(TargetIcon, {}),
          label: "Overall Test MAE",
          value: `\xB1${overallMae.toFixed(2)}\xB0C`,
          sub: "Mean absolute error (All Horizons)"
        }
      ),
      /* @__PURE__ */ jsx8(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx8(TargetIcon, {}),
          label: "Overall RMSE",
          value: `${overallRmse.toFixed(2)}\xB0C`,
          sub: "Root mean squared error"
        }
      ),
      /* @__PURE__ */ jsx8(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx8(ChartIcon, {}),
          label: "R\xB2 Score",
          value: overallR2.toFixed(4),
          sub: "Explained target variance"
        }
      ),
      /* @__PURE__ */ jsx8(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx8(ArrowUpIcon, {}),
          label: "Baseline Skill Score",
          value: "+19.1% vs Persistence",
          sub: "Relative MAE reduction vs naive"
        }
      ),
      /* @__PURE__ */ jsx8(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx8(CheckIcon, {}),
          label: "Conformal Coverage",
          value: `${coveragePercent}%`,
          sub: `Target 90% (q = \xB1${conformalQ}\xB0C)`
        }
      )
    ] }),
    /* @__PURE__ */ jsx8("div", { className: "advisory-callout", role: "region", "aria-label": "Evaluation Safeguards", children: /* @__PURE__ */ jsxs7("div", { style: { display: "flex", alignItems: "flex-start", gap: 10 }, children: [
      /* @__PURE__ */ jsx8(DatabaseIcon, { style: { width: 20, height: 20, color: "var(--accent)", flexShrink: 0, marginTop: 2 } }),
      /* @__PURE__ */ jsxs7("div", { children: [
        /* @__PURE__ */ jsx8("strong", { style: { fontSize: "14px", display: "block", marginBottom: 4 }, children: "Out-of-Time Evaluation Protocol & Anti-Leakage Embargo Safeguards" }),
        /* @__PURE__ */ jsxs7("p", { style: { margin: "0 0 6px 0", color: "var(--text-secondary)", lineHeight: 1.55 }, children: [
          "The multi-output LightGBM model is evaluated on a strictly chronological out-of-time test window from",
          " ",
          /* @__PURE__ */ jsx8("strong", { children: test_period[0] }),
          " to ",
          /* @__PURE__ */ jsx8("strong", { children: test_period[1] }),
          " (12,045 samples across all 34 Indian states and Union Territories). A mandatory ",
          /* @__PURE__ */ jsx8("strong", { children: "8-day anti-leakage embargo" }),
          " buffer strictly isolates the training partition (",
          train_period[0],
          " \u2192 ",
          train_period[1],
          ", 126,654 rows) from the test set, preventing multi-step autoregressive leakage."
        ] }),
        /* @__PURE__ */ jsxs7("div", { style: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: "12px", color: "var(--text-muted)", marginTop: 6 }, children: [
          /* @__PURE__ */ jsxs7("span", { children: [
            "\u2022 ",
            /* @__PURE__ */ jsx8("strong", { children: "Target Variable:" }),
            " ",
            target
          ] }),
          /* @__PURE__ */ jsxs7("span", { children: [
            "\u2022 ",
            /* @__PURE__ */ jsx8("strong", { children: "Artifact Fingerprint:" }),
            " ",
            /* @__PURE__ */ jsx8("code", { style: { fontSize: "11px" }, children: "844fdadfbe2786..." })
          ] }),
          /* @__PURE__ */ jsxs7("span", { children: [
            "\u2022 ",
            /* @__PURE__ */ jsx8("strong", { children: "Status Note:" }),
            " ",
            evaluation_note ?? (isValidated ? "Verified current artifact." : "Evaluated overlap diagnostics.")
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs7(
      Card,
      {
        title: "Horizon-by-Horizon Performance Breakdown (Day 1 through Day 7)",
        subtitle: "Detailed meteorological error growth across consecutive forecast lead times. Demonstrates sustained accuracy across the 7-day trajectory.",
        icon: /* @__PURE__ */ jsx8(CalendarIcon, {}),
        children: [
          /* @__PURE__ */ jsx8(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 10,
                marginBottom: 20
              },
              children: horizonData.map((h) => /* @__PURE__ */ jsxs7(
                "div",
                {
                  style: {
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 10px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    boxShadow: "var(--shadow-xs)"
                  },
                  children: [
                    /* @__PURE__ */ jsx8(
                      "span",
                      {
                        style: {
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          color: "var(--accent)",
                          letterSpacing: "0.04em",
                          marginBottom: 4
                        },
                        children: h.label
                      }
                    ),
                    /* @__PURE__ */ jsxs7(
                      "div",
                      {
                        style: {
                          fontSize: "18px",
                          fontWeight: 800,
                          color: "var(--text-primary)",
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: 1.1,
                          margin: "2px 0 4px"
                        },
                        children: [
                          "\xB1",
                          h.MAE.toFixed(2),
                          /* @__PURE__ */ jsx8("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }, children: "\xB0C" })
                        ]
                      }
                    ),
                    /* @__PURE__ */ jsxs7("div", { style: { fontSize: "11.5px", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }, children: [
                      "RMSE: ",
                      /* @__PURE__ */ jsxs7("strong", { children: [
                        h.RMSE.toFixed(2),
                        "\xB0C"
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs7("div", { style: { fontSize: "11px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }, children: [
                      "R\xB2: ",
                      h.R2.toFixed(3)
                    ] }),
                    /* @__PURE__ */ jsx8("div", { style: { marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-subtle)", width: "100%" }, children: /* @__PURE__ */ jsxs7(
                      "span",
                      {
                        style: {
                          fontSize: "10.5px",
                          fontWeight: 700,
                          color: "var(--success)",
                          background: "var(--success-bg)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid var(--success-border)",
                          display: "inline-block"
                        },
                        children: [
                          "+",
                          h.skill.toFixed(1),
                          "% vs Persist"
                        ]
                      }
                    ) })
                  ]
                },
                h.day
              ))
            }
          ),
          /* @__PURE__ */ jsxs7("div", { style: { marginTop: 12 }, children: [
            /* @__PURE__ */ jsxs7("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }, children: [
              /* @__PURE__ */ jsx8("span", { style: { fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)" }, children: "Forecast Horizon Error Progression (MAE & RMSE in \xB0C)" }),
              /* @__PURE__ */ jsx8("span", { style: { fontSize: "11.5px", color: "var(--text-muted)" }, children: "Day 1 Error: \xB10.93\xB0C \u2192 Day 7 Error: \xB11.29\xB0C (+25.0% Skill Retention)" })
            ] }),
            /* @__PURE__ */ jsx8("div", { style: { width: "100%", height: 220 }, children: /* @__PURE__ */ jsx8(ResponsiveContainer2, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs7(LineChart, { data: horizonData, margin: { top: 10, right: 25, bottom: 5, left: 0 }, children: [
              /* @__PURE__ */ jsx8(CartesianGrid2, { stroke: "#e2e8f0", strokeDasharray: "3 3", vertical: false }),
              /* @__PURE__ */ jsx8(XAxis2, { dataKey: "label", tick: { fontSize: 11, fill: "#64748b" } }),
              /* @__PURE__ */ jsx8(
                YAxis2,
                {
                  domain: [0.8, 2],
                  tick: { fontSize: 11, fill: "#64748b" },
                  unit: "\xB0C",
                  tickFormatter: (v) => v.toFixed(1)
                }
              ),
              /* @__PURE__ */ jsx8(
                Tooltip2,
                {
                  formatter: (val, name) => [`${val.toFixed(3)} \xB0C`, name],
                  contentStyle: {
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: "6px",
                    color: "#ffffff",
                    fontSize: "12px"
                  },
                  labelStyle: { color: "#94a3b8", fontWeight: 600 }
                }
              ),
              /* @__PURE__ */ jsx8(
                Legend2,
                {
                  wrapperStyle: { fontSize: "12px", paddingTop: "8px" },
                  iconType: "circle"
                }
              ),
              /* @__PURE__ */ jsx8(
                Line2,
                {
                  type: "monotone",
                  dataKey: "MAE",
                  name: "MAE (\xB0C)",
                  stroke: "#ea580c",
                  strokeWidth: 2.5,
                  dot: { r: 4, fill: "#ea580c", strokeWidth: 1 },
                  activeDot: { r: 6 }
                }
              ),
              /* @__PURE__ */ jsx8(
                Line2,
                {
                  type: "monotone",
                  dataKey: "RMSE",
                  name: "RMSE (\xB0C)",
                  stroke: "#2563eb",
                  strokeWidth: 2.5,
                  dot: { r: 4, fill: "#2563eb", strokeWidth: 1 },
                  activeDot: { r: 6 }
                }
              )
            ] }) }) })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs7(
      Card,
      {
        title: "Model Architecture Benchmark Comparison",
        subtitle: "Comparing production LightGBM Multi-Output against machine learning benchmarks and climatological baselines.",
        icon: /* @__PURE__ */ jsx8(TargetIcon, {}),
        action: /* @__PURE__ */ jsxs7("div", { style: { display: "inline-flex", background: "var(--bg-surface-subtle)", padding: 3, borderRadius: "var(--radius-md)" }, children: [
          /* @__PURE__ */ jsx8(
            "button",
            {
              type: "button",
              className: metricTab === "MAE" ? "btn-primary" : "btn-outline",
              onClick: () => setMetricTab("MAE"),
              style: {
                fontSize: "12px",
                padding: "4px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer"
              },
              children: "MAE (Lower is Better)"
            }
          ),
          /* @__PURE__ */ jsx8(
            "button",
            {
              type: "button",
              className: metricTab === "RMSE" ? "btn-primary" : "btn-outline",
              onClick: () => setMetricTab("RMSE"),
              style: {
                fontSize: "12px",
                padding: "4px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer"
              },
              children: "RMSE (Lower is Better)"
            }
          ),
          /* @__PURE__ */ jsx8(
            "button",
            {
              type: "button",
              className: metricTab === "R2" ? "btn-primary" : "btn-outline",
              onClick: () => setMetricTab("R2"),
              style: {
                fontSize: "12px",
                padding: "4px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer"
              },
              children: "R\xB2 Score (Higher is Better)"
            }
          )
        ] }),
        children: [
          /* @__PURE__ */ jsx8("div", { style: { width: "100%", height: 280, margin: "10px 0 20px" }, children: /* @__PURE__ */ jsx8(ResponsiveContainer2, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs7(
            BarChart,
            {
              data: comparisonModels,
              margin: { top: 15, right: 20, bottom: 15, left: 0 },
              children: [
                /* @__PURE__ */ jsx8(CartesianGrid2, { stroke: "#e2e8f0", strokeDasharray: "3 3", vertical: false }),
                /* @__PURE__ */ jsx8(
                  XAxis2,
                  {
                    dataKey: "shortName",
                    tick: { fontSize: 11.5, fill: "#475569", fontWeight: 500 }
                  }
                ),
                /* @__PURE__ */ jsx8(
                  YAxis2,
                  {
                    domain: metricTab === "R2" ? [0.93, 1] : [0, "auto"],
                    tick: { fontSize: 11, fill: "#64748b" },
                    unit: metricTab === "R2" ? "" : "\xB0C",
                    tickFormatter: (v) => v.toFixed(metricTab === "R2" ? 3 : 2)
                  }
                ),
                /* @__PURE__ */ jsx8(
                  Tooltip2,
                  {
                    formatter: (val) => [
                      metricTab === "R2" ? val.toFixed(4) : `${val.toFixed(4)} \xB0C`,
                      metricTab
                    ],
                    contentStyle: {
                      backgroundColor: "#0f172a",
                      border: "none",
                      borderRadius: "6px",
                      color: "#ffffff",
                      fontSize: "12px"
                    }
                  }
                ),
                /* @__PURE__ */ jsx8(Bar2, { dataKey: metricTab, name: metricTab, radius: [6, 6, 0, 0], children: comparisonModels.map((entry) => /* @__PURE__ */ jsx8(
                  Cell,
                  {
                    fill: entry.isProduction ? "#2563eb" : "#cbd5e1"
                  },
                  entry.name
                )) })
              ]
            }
          ) }) }),
          /* @__PURE__ */ jsx8("div", { className: "table-wrap", children: /* @__PURE__ */ jsxs7("table", { children: [
            /* @__PURE__ */ jsx8("thead", { children: /* @__PURE__ */ jsxs7("tr", { children: [
              /* @__PURE__ */ jsx8("th", { children: "Model Architecture" }),
              /* @__PURE__ */ jsx8("th", { children: "Model Type" }),
              /* @__PURE__ */ jsx8("th", { className: "num", children: "MAE (\xB0C)" }),
              /* @__PURE__ */ jsx8("th", { className: "num", children: "RMSE (\xB0C)" }),
              /* @__PURE__ */ jsx8("th", { className: "num", children: "R\xB2 Score" }),
              /* @__PURE__ */ jsx8("th", { children: "Skill vs Persistence" }),
              /* @__PURE__ */ jsx8("th", { children: "Evaluation Status" })
            ] }) }),
            /* @__PURE__ */ jsx8("tbody", { children: comparisonModels.map((m) => /* @__PURE__ */ jsxs7("tr", { className: m.isProduction ? "highlight-row" : "", children: [
              /* @__PURE__ */ jsx8("td", { children: /* @__PURE__ */ jsxs7("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                m.isProduction && /* @__PURE__ */ jsx8(ChipIcon, { style: { width: 14, height: 14, color: "var(--accent)" } }),
                /* @__PURE__ */ jsx8("span", { children: m.name })
              ] }) }),
              /* @__PURE__ */ jsx8("td", { children: m.type }),
              /* @__PURE__ */ jsx8("td", { className: "num strong", children: m.MAE.toFixed(4) }),
              /* @__PURE__ */ jsx8("td", { className: "num", children: m.RMSE.toFixed(4) }),
              /* @__PURE__ */ jsx8("td", { className: "num", children: m.R2.toFixed(4) }),
              /* @__PURE__ */ jsx8("td", { children: /* @__PURE__ */ jsx8("span", { style: { fontWeight: 600, color: m.isProduction ? "var(--success)" : "var(--text-secondary)" }, children: m.skill }) }),
              /* @__PURE__ */ jsx8("td", { children: /* @__PURE__ */ jsx8(Badge, { variant: m.statusVariant, children: m.status }) })
            ] }, m.name)) })
          ] }) })
        ]
      }
    ),
    /* @__PURE__ */ jsx8(
      Card,
      {
        title: "Feature Engineering Taxonomy (20 Inputs)",
        subtitle: `Exactly ${features.length} features engineered automatically server-side from recent historical weather observations prior to inference.`,
        icon: /* @__PURE__ */ jsx8(SlidersIcon, {}),
        children: /* @__PURE__ */ jsx8("div", { className: "feature-groups-grid", children: categorizeFeatures(features).map((g) => /* @__PURE__ */ jsxs7("div", { className: "feature-card", children: [
          /* @__PURE__ */ jsxs7("div", { className: "feature-card-header", children: [
            /* @__PURE__ */ jsx8("span", { className: "feature-card-title", children: g.label }),
            /* @__PURE__ */ jsxs7(Badge, { neutral: true, children: [
              g.count,
              " features"
            ] })
          ] }),
          /* @__PURE__ */ jsx8("div", { className: "feature-tag-list", children: g.items.map((f) => /* @__PURE__ */ jsx8("span", { className: "feature-tag", children: f }, f)) }),
          /* @__PURE__ */ jsx8("p", { className: "feature-card-desc", children: g.description })
        ] }, g.label)) })
      }
    )
  ] });
}

// frontend/src/pages/PredictionHistoryPage.tsx
import { useEffect as useEffect4, useState as useState5 } from "react";
import {
  CartesianGrid as CartesianGrid3,
  Line as Line3,
  LineChart as LineChart2,
  ReferenceLine,
  ResponsiveContainer as ResponsiveContainer3,
  Tooltip as Tooltip3,
  XAxis as XAxis3,
  YAxis as YAxis3
} from "recharts";
import { jsx as jsx9, jsxs as jsxs8 } from "react/jsx-runtime";
var PAGE_SIZE_OPTIONS = [25, 50, 100];
var CONFORMAL_Q = 2.84;
function prettyDate2(iso) {
  if (!iso) return "\u2014";
  const parts = iso.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return iso;
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}
function computeHorizonDate(baseIso, dayOffset) {
  if (!baseIso) return `Day ${dayOffset + 1}`;
  const parts = baseIso.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return `Day ${dayOffset + 1}`;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d + dayOffset));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  });
}
function PredictionHistoryPage() {
  const states = useFetch(getStates, []);
  const modelInfo = useFetch(getModelInfo, []);
  const [records, setRecords] = useState5([]);
  const [totalCount, setTotalCount] = useState5(0);
  const [loading, setLoading] = useState5(true);
  const [error, setError] = useState5(null);
  const [stateFilter, setStateFilter] = useState5("");
  const [modelFilter, setModelFilter] = useState5("");
  const [searchQuery, setSearchQuery] = useState5("");
  const [pageSize, setPageSize] = useState5(25);
  const [currentPage, setCurrentPage] = useState5(1);
  const [selectedRecord, setSelectedRecord] = useState5(null);
  useEffect4(() => {
    void loadData();
  }, []);
  useEffect4(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") setSelectedRecord(null);
    }
    if (selectedRecord) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedRecord]);
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const resp = await getPredictions(500, 0);
      const rows = resp.predictions ?? [];
      setRecords(rows);
      setTotalCount(resp.total ?? resp.count ?? rows.length);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  const filteredRecords = records.filter((r) => {
    if (stateFilter && r.state !== stateFilter) return false;
    if (modelFilter) {
      const ver = r.model_version ?? "weather_model_v3";
      if (ver !== modelFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchId = String(r.id).includes(q);
      const matchState = r.state.toLowerCase().includes(q);
      const matchDistrict = (r.district ?? "").toLowerCase().includes(q);
      const matchLocation = (r.location ?? "").toLowerCase().includes(q);
      const matchDate = r.forecast_date.includes(q);
      if (!matchId && !matchState && !matchDistrict && !matchLocation && !matchDate) {
        return false;
      }
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRecords.length);
  const pagedRecords = filteredRecords.slice(startIndex, endIndex);
  const modelVersions = Array.from(
    new Set(records.map((r) => r.model_version ?? "weather_model_v3"))
  ).filter(Boolean);
  const latestPredictionDate = records.length > 0 && records[0].created_at ? new Date(records[0].created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }) : "\u2014";
  return /* @__PURE__ */ jsxs8("div", { className: "page", children: [
    /* @__PURE__ */ jsx9(
      PageHead,
      {
        title: "Prediction History & Audit Log",
        desc: "Immutable audit trail of multi-output temperature forecasts generated and stored in PostgreSQL. Inspect multi-horizon trajectories and model versions.",
        badge: /* @__PURE__ */ jsx9(Badge, { neutral: true, children: "Database Audit Trail" })
      }
    ),
    /* @__PURE__ */ jsxs8("div", { className: "stat-chips", children: [
      /* @__PURE__ */ jsx9(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx9(DatabaseIcon, {}),
          label: "Total Stored Predictions",
          value: loading ? "\u2026" : totalCount.toLocaleString(),
          sub: "PostgreSQL public.predictions"
        }
      ),
      /* @__PURE__ */ jsx9(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx9(FilterIcon, {}),
          label: "Active Filter Matches",
          value: loading ? "\u2026" : filteredRecords.length.toLocaleString(),
          sub: stateFilter || modelFilter || searchQuery ? "Filtered subset" : "All predictions matched"
        }
      ),
      /* @__PURE__ */ jsx9(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx9(ChipIcon, {}),
          label: "Production Engine",
          value: modelInfo.data?.model_name ? `${modelInfo.data.model_name} v3` : "LightGBM v3",
          sub: "7-Day Multi-Output Joint Model"
        }
      ),
      /* @__PURE__ */ jsx9(
        StatChip,
        {
          icon: /* @__PURE__ */ jsx9(ClockIcon, {}),
          label: "Latest Prediction Entry",
          value: latestPredictionDate,
          sub: "Most recent stored inference"
        }
      )
    ] }),
    /* @__PURE__ */ jsx9("div", { className: "panel", style: { padding: "16px 20px", marginBottom: 20 }, children: /* @__PURE__ */ jsxs8(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap"
        },
        children: [
          /* @__PURE__ */ jsxs8("div", { style: { display: "flex", gap: 14, flexWrap: "wrap", flex: 1 }, children: [
            /* @__PURE__ */ jsxs8("label", { className: "field inline", style: { minWidth: 170 }, children: [
              /* @__PURE__ */ jsx9("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }, children: "State Filter" }),
              /* @__PURE__ */ jsxs8(
                "select",
                {
                  value: stateFilter,
                  onChange: (e) => {
                    setStateFilter(e.target.value);
                    setCurrentPage(1);
                  },
                  children: [
                    /* @__PURE__ */ jsxs8("option", { value: "", children: [
                      "All States (",
                      states.data?.states.length ?? 34,
                      ")"
                    ] }),
                    states.data?.states.map((s) => /* @__PURE__ */ jsx9("option", { value: s, children: s }, s))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs8("label", { className: "field inline", style: { minWidth: 160 }, children: [
              /* @__PURE__ */ jsx9("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }, children: "Model Version" }),
              /* @__PURE__ */ jsxs8(
                "select",
                {
                  value: modelFilter,
                  onChange: (e) => {
                    setModelFilter(e.target.value);
                    setCurrentPage(1);
                  },
                  children: [
                    /* @__PURE__ */ jsx9("option", { value: "", children: "All Versions" }),
                    modelVersions.map((v) => /* @__PURE__ */ jsx9("option", { value: v, children: v }, v))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs8("label", { className: "field inline", style: { minWidth: 220, flex: 1 }, children: [
              /* @__PURE__ */ jsx9("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }, children: "Search Audit Trail" }),
              /* @__PURE__ */ jsxs8("div", { style: { position: "relative", width: "100%" }, children: [
                /* @__PURE__ */ jsx9(
                  SearchIcon,
                  {
                    style: {
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 15,
                      height: 15,
                      color: "var(--text-muted)",
                      pointerEvents: "none"
                    }
                  }
                ),
                /* @__PURE__ */ jsx9(
                  "input",
                  {
                    type: "search",
                    placeholder: "Filter by district, station, state, or ID\u2026",
                    value: searchQuery,
                    onChange: (e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    },
                    style: { paddingLeft: 32 }
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs8("div", { style: { display: "flex", alignItems: "flex-end", gap: 10 }, children: [
            /* @__PURE__ */ jsxs8("label", { className: "field inline", style: { width: 110 }, children: [
              /* @__PURE__ */ jsx9("span", { style: { fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }, children: "Rows per page" }),
              /* @__PURE__ */ jsx9(
                "select",
                {
                  value: pageSize,
                  onChange: (e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  },
                  children: PAGE_SIZE_OPTIONS.map((n) => /* @__PURE__ */ jsxs8("option", { value: n, children: [
                    n,
                    " rows"
                  ] }, n))
                }
              )
            ] }),
            /* @__PURE__ */ jsxs8(
              "button",
              {
                type: "button",
                className: "btn-secondary",
                onClick: () => void loadData(),
                disabled: loading,
                style: { height: 38, display: "inline-flex", alignItems: "center", gap: 6 },
                children: [
                  /* @__PURE__ */ jsx9(RefreshIcon, { style: { width: 15, height: 15 } }),
                  loading ? "Refreshing\u2026" : "Refresh"
                ]
              }
            )
          ] })
        ]
      }
    ) }),
    error && /* @__PURE__ */ jsx9(ErrorBanner, { message: error, onRetry: () => void loadData() }),
    loading && records.length === 0 && /* @__PURE__ */ jsx9(Card, { title: "Loading Prediction Audit Records\u2026", icon: /* @__PURE__ */ jsx9(ListIcon, {}), children: /* @__PURE__ */ jsx9(Skeleton, { rows: 8 }) }),
    !loading && !error && filteredRecords.length === 0 && /* @__PURE__ */ jsx9(Card, { title: "Stored Predictions", icon: /* @__PURE__ */ jsx9(ListIcon, {}), children: /* @__PURE__ */ jsx9(
      EmptyNote,
      {
        title: stateFilter || searchQuery || modelFilter ? "No matching prediction records" : "No predictions stored yet",
        hint: stateFilter || searchQuery || modelFilter ? "Try clearing or broadening your search filters to view older audit records." : "No forecast requests have been executed yet. Run a prediction on the Weather Forecast page to generate an audit log.",
        action: stateFilter || searchQuery || modelFilter ? /* @__PURE__ */ jsx9(
          "button",
          {
            type: "button",
            className: "btn-secondary",
            onClick: () => {
              setStateFilter("");
              setModelFilter("");
              setSearchQuery("");
              setCurrentPage(1);
            },
            children: "Clear All Filters"
          }
        ) : void 0
      }
    ) }),
    !loading && filteredRecords.length > 0 && /* @__PURE__ */ jsxs8(
      Card,
      {
        title: "Stored Prediction Audit Log",
        subtitle: `Showing items ${startIndex + 1}\u2013${endIndex} of ${filteredRecords.length.toLocaleString()} matching records.`,
        icon: /* @__PURE__ */ jsx9(ListIcon, {}),
        children: [
          /* @__PURE__ */ jsx9("div", { className: "table-wrap", children: /* @__PURE__ */ jsxs8("table", { children: [
            /* @__PURE__ */ jsx9("thead", { children: /* @__PURE__ */ jsxs8("tr", { children: [
              /* @__PURE__ */ jsx9("th", { style: { width: 70 }, children: "ID" }),
              /* @__PURE__ */ jsx9("th", { children: "State" }),
              /* @__PURE__ */ jsx9("th", { children: "District" }),
              /* @__PURE__ */ jsx9("th", { children: "Station" }),
              /* @__PURE__ */ jsx9("th", { children: "Target Date" }),
              /* @__PURE__ */ jsx9("th", { children: "7-Day Predicted Avg Temp (\xB0C)" }),
              /* @__PURE__ */ jsx9("th", { children: "Model Version" }),
              /* @__PURE__ */ jsx9("th", { children: "Created At" }),
              /* @__PURE__ */ jsx9("th", { style: { textAlign: "right" }, children: "Trajectory Action" })
            ] }) }),
            /* @__PURE__ */ jsx9("tbody", { children: pagedRecords.map((r) => {
              const temps = Array.isArray(r.predicted_temp_avg) ? r.predicted_temp_avg : [Number(r.predicted_temp_avg)];
              const minTemp = Math.min(...temps);
              const maxTemp = Math.max(...temps);
              return /* @__PURE__ */ jsxs8("tr", { children: [
                /* @__PURE__ */ jsx9("td", { children: /* @__PURE__ */ jsxs8("span", { className: "feature-tag", children: [
                  "#",
                  r.id
                ] }) }),
                /* @__PURE__ */ jsx9("td", { children: /* @__PURE__ */ jsx9(Badge, { variant: "info", children: r.state }) }),
                /* @__PURE__ */ jsx9("td", { children: r.district || /* @__PURE__ */ jsx9("span", { style: { color: "var(--text-faint)" }, children: "\u2014" }) }),
                /* @__PURE__ */ jsx9("td", { children: r.location || /* @__PURE__ */ jsx9("span", { style: { color: "var(--text-faint)" }, children: "\u2014" }) }),
                /* @__PURE__ */ jsx9("td", { style: { fontWeight: 600 }, children: prettyDate2(r.forecast_date) }),
                /* @__PURE__ */ jsx9("td", { children: /* @__PURE__ */ jsxs8("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
                  /* @__PURE__ */ jsxs8(
                    "span",
                    {
                      style: {
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--accent)",
                        background: "var(--accent-subtle)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid #bfdbfe",
                        fontVariantNumeric: "tabular-nums"
                      },
                      title: `Day 1: ${temps[0]?.toFixed(1)}\xB0C`,
                      children: [
                        "D1: ",
                        temps[0]?.toFixed(1),
                        "\xB0C"
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs8(
                    "span",
                    {
                      style: {
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        fontVariantNumeric: "tabular-nums"
                      },
                      children: [
                        "Range: ",
                        minTemp.toFixed(1),
                        "\xB0\u2013",
                        maxTemp.toFixed(1),
                        "\xB0C (",
                        temps.length,
                        "D)"
                      ]
                    }
                  )
                ] }) }),
                /* @__PURE__ */ jsx9("td", { children: /* @__PURE__ */ jsx9(Badge, { neutral: true, children: r.model_version || "weather_model_v3" }) }),
                /* @__PURE__ */ jsx9("td", { style: { fontSize: "12px", color: "var(--text-secondary)" }, children: new Date(r.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                }) }),
                /* @__PURE__ */ jsx9("td", { style: { textAlign: "right" }, children: /* @__PURE__ */ jsxs8(
                  "button",
                  {
                    type: "button",
                    className: "btn-outline",
                    onClick: () => setSelectedRecord(r),
                    style: {
                      fontSize: "11.5px",
                      padding: "4px 8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4
                    },
                    children: [
                      /* @__PURE__ */ jsx9(TargetIcon, { style: { width: 13, height: 13 } }),
                      "Inspect Trajectory"
                    ]
                  }
                ) })
              ] }, r.id);
            }) })
          ] }) }),
          /* @__PURE__ */ jsxs8(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 4px 4px",
                marginTop: 10,
                borderTop: "1px solid var(--border-subtle)",
                flexWrap: "wrap",
                gap: 12
              },
              children: [
                /* @__PURE__ */ jsxs8("div", { style: { fontSize: "12.5px", color: "var(--text-secondary)" }, children: [
                  "Showing ",
                  /* @__PURE__ */ jsx9("strong", { children: startIndex + 1 }),
                  " to ",
                  /* @__PURE__ */ jsx9("strong", { children: endIndex }),
                  " of",
                  " ",
                  /* @__PURE__ */ jsx9("strong", { children: filteredRecords.length.toLocaleString() }),
                  " prediction records"
                ] }),
                /* @__PURE__ */ jsxs8("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                  /* @__PURE__ */ jsxs8(
                    "button",
                    {
                      type: "button",
                      className: "btn-secondary",
                      onClick: () => setCurrentPage((p) => Math.max(1, p - 1)),
                      disabled: activePage <= 1,
                      style: {
                        padding: "5px 10px",
                        fontSize: "12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4
                      },
                      children: [
                        /* @__PURE__ */ jsx9(ChevronLeftIcon, { style: { width: 14, height: 14 } }),
                        "Previous"
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs8(
                    "span",
                    {
                      style: {
                        fontSize: "12.5px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        padding: "0 8px"
                      },
                      children: [
                        "Page ",
                        activePage,
                        " of ",
                        totalPages
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs8(
                    "button",
                    {
                      type: "button",
                      className: "btn-secondary",
                      onClick: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
                      disabled: activePage >= totalPages,
                      style: {
                        padding: "5px 10px",
                        fontSize: "12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4
                      },
                      children: [
                        "Next",
                        /* @__PURE__ */ jsx9(ChevronRightIcon, { style: { width: 14, height: 14 } })
                      ]
                    }
                  )
                ] })
              ]
            }
          )
        ]
      }
    ),
    selectedRecord && /* @__PURE__ */ jsx9(
      "div",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "modal-title",
        onClick: () => setSelectedRecord(null),
        style: {
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1e3,
          padding: "16px"
        },
        children: /* @__PURE__ */ jsxs8(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              width: "100%",
              maxWidth: "780px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            },
            children: [
              /* @__PURE__ */ jsxs8(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)"
                  },
                  children: [
                    /* @__PURE__ */ jsxs8("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
                      /* @__PURE__ */ jsx9(
                        "div",
                        {
                          style: {
                            width: 32,
                            height: 32,
                            borderRadius: "6px",
                            background: "var(--accent-subtle)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--accent)"
                          },
                          children: /* @__PURE__ */ jsx9(TargetIcon, { style: { width: 18, height: 18 } })
                        }
                      ),
                      /* @__PURE__ */ jsxs8("div", { children: [
                        /* @__PURE__ */ jsxs8(
                          "h3",
                          {
                            id: "modal-title",
                            style: {
                              margin: 0,
                              fontSize: "16px",
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              display: "flex",
                              alignItems: "center",
                              gap: 8
                            },
                            children: [
                              "Prediction Audit Record #",
                              selectedRecord.id,
                              /* @__PURE__ */ jsx9(Badge, { variant: "info", children: selectedRecord.state })
                            ]
                          }
                        ),
                        /* @__PURE__ */ jsx9("span", { style: { fontSize: "12px", color: "var(--text-muted)" }, children: "7-Day Multi-Horizon Predicted Trajectory & Confidence Bounds" })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx9(
                      "button",
                      {
                        type: "button",
                        className: "btn-outline",
                        onClick: () => setSelectedRecord(null),
                        style: { padding: "6px", border: "none", color: "var(--text-muted)", cursor: "pointer" },
                        "aria-label": "Close dialog",
                        children: /* @__PURE__ */ jsx9(XIcon, { style: { width: 18, height: 18 } })
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ jsxs8("div", { style: { padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }, children: [
                /* @__PURE__ */ jsxs8(
                  "div",
                  {
                    style: {
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 10,
                      background: "var(--bg-surface-subtle)",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)"
                    },
                    children: [
                      /* @__PURE__ */ jsxs8("div", { children: [
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }, children: "State / Region" }),
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginTop: 2 }, children: selectedRecord.state })
                      ] }),
                      /* @__PURE__ */ jsxs8("div", { children: [
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }, children: "District / Station" }),
                        /* @__PURE__ */ jsxs8("div", { style: { fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }, children: [
                          selectedRecord.district || "State Default",
                          " ",
                          selectedRecord.location ? `\xB7 ${selectedRecord.location}` : ""
                        ] })
                      ] }),
                      /* @__PURE__ */ jsxs8("div", { children: [
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }, children: "Forecast Origin Date" }),
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }, children: prettyDate2(selectedRecord.forecast_date) })
                      ] }),
                      /* @__PURE__ */ jsxs8("div", { children: [
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }, children: "Model Engine" }),
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }, children: selectedRecord.model_version || "weather_model_v3" })
                      ] }),
                      /* @__PURE__ */ jsxs8("div", { children: [
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "11px", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase" }, children: "Recorded Timestamp" }),
                        /* @__PURE__ */ jsx9("div", { style: { fontSize: "13px", color: "var(--text-secondary)", marginTop: 2 }, children: new Date(selectedRecord.created_at).toLocaleString() })
                      ] })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs8("div", { children: [
                  /* @__PURE__ */ jsx9("span", { style: { fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }, children: "7-Day Predicted Trajectory (\xB0C)" }),
                  /* @__PURE__ */ jsx9("div", { style: { width: "100%", height: 180, marginTop: 8 }, children: /* @__PURE__ */ jsx9(ResponsiveContainer3, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs8(
                    LineChart2,
                    {
                      data: selectedRecord.predicted_temp_avg.map((temp, i) => ({
                        day: `Day ${i + 1}`,
                        date: computeHorizonDate(selectedRecord.forecast_date, i + 1),
                        temp: Number(temp.toFixed(2)),
                        upper: Number((temp + CONFORMAL_Q).toFixed(2)),
                        lower: Number((temp - CONFORMAL_Q).toFixed(2))
                      })),
                      margin: { top: 10, right: 20, bottom: 5, left: 0 },
                      children: [
                        /* @__PURE__ */ jsx9(CartesianGrid3, { stroke: "#e2e8f0", strokeDasharray: "3 3", vertical: false }),
                        /* @__PURE__ */ jsx9(XAxis3, { dataKey: "day", tick: { fontSize: 11, fill: "#64748b" } }),
                        /* @__PURE__ */ jsx9(
                          YAxis3,
                          {
                            tick: { fontSize: 11, fill: "#64748b" },
                            unit: "\xB0C",
                            domain: ["dataMin - 3", "dataMax + 3"],
                            tickFormatter: (v) => v.toFixed(0)
                          }
                        ),
                        /* @__PURE__ */ jsx9(
                          Tooltip3,
                          {
                            formatter: (v, name) => [`${v.toFixed(2)} \xB0C`, name],
                            contentStyle: {
                              backgroundColor: "#0f172a",
                              border: "none",
                              borderRadius: "6px",
                              color: "#ffffff",
                              fontSize: "12px"
                            }
                          }
                        ),
                        /* @__PURE__ */ jsx9(
                          ReferenceLine,
                          {
                            y: selectedRecord.predicted_temp_avg.reduce((a, b) => a + b, 0) / selectedRecord.predicted_temp_avg.length,
                            stroke: "#94a3b8",
                            strokeDasharray: "4 4"
                          }
                        ),
                        /* @__PURE__ */ jsx9(
                          Line3,
                          {
                            type: "monotone",
                            dataKey: "temp",
                            name: "Predicted Temp Avg",
                            stroke: "#2563eb",
                            strokeWidth: 2.5,
                            dot: { r: 4, fill: "#2563eb" }
                          }
                        )
                      ]
                    }
                  ) }) })
                ] }),
                /* @__PURE__ */ jsx9("div", { className: "table-wrap", children: /* @__PURE__ */ jsxs8("table", { children: [
                  /* @__PURE__ */ jsx9("thead", { children: /* @__PURE__ */ jsxs8("tr", { children: [
                    /* @__PURE__ */ jsx9("th", { children: "Horizon" }),
                    /* @__PURE__ */ jsx9("th", { children: "Valid Date" }),
                    /* @__PURE__ */ jsx9("th", { className: "num", children: "Predicted Avg Temp (\xB0C)" }),
                    /* @__PURE__ */ jsx9("th", { className: "num", children: "Est. Diurnal (Min \u2013 Max)" }),
                    /* @__PURE__ */ jsx9("th", { children: "90% Confidence Interval" })
                  ] }) }),
                  /* @__PURE__ */ jsx9("tbody", { children: selectedRecord.predicted_temp_avg.map((temp, i) => {
                    const dayDate = computeHorizonDate(selectedRecord.forecast_date, i + 1);
                    const estMin = (temp - 3.5).toFixed(1);
                    const estMax = (temp + 3.5).toFixed(1);
                    const ciLow = (temp - CONFORMAL_Q).toFixed(1);
                    const ciHigh = (temp + CONFORMAL_Q).toFixed(1);
                    return /* @__PURE__ */ jsxs8("tr", { children: [
                      /* @__PURE__ */ jsx9("td", { children: /* @__PURE__ */ jsxs8(Badge, { neutral: true, children: [
                        "Day ",
                        i + 1,
                        " (t+",
                        i + 1,
                        ")"
                      ] }) }),
                      /* @__PURE__ */ jsx9("td", { style: { fontWeight: 600 }, children: dayDate }),
                      /* @__PURE__ */ jsxs8("td", { className: "num strong", style: { color: "var(--accent)" }, children: [
                        temp.toFixed(2),
                        "\xB0C"
                      ] }),
                      /* @__PURE__ */ jsxs8("td", { className: "num", style: { color: "var(--text-secondary)" }, children: [
                        estMin,
                        "\xB0C \u2013 ",
                        estMax,
                        "\xB0C"
                      ] }),
                      /* @__PURE__ */ jsx9("td", { children: /* @__PURE__ */ jsxs8("span", { style: { fontSize: "11.5px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }, children: [
                        "[",
                        ciLow,
                        "\xB0C, ",
                        ciHigh,
                        "\xB0C]"
                      ] }) })
                    ] }, i);
                  }) })
                ] }) }),
                /* @__PURE__ */ jsxs8(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      background: "var(--bg-surface-subtle)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    },
                    children: [
                      /* @__PURE__ */ jsx9(CalendarIcon, { style: { width: 14, height: 14, color: "var(--text-faint)" } }),
                      /* @__PURE__ */ jsxs8("span", { children: [
                        "Audit Verification: Stored in PostgreSQL ",
                        /* @__PURE__ */ jsx9("code", { children: "predictions" }),
                        " table on inference request. Output array contains 7 joint multi-output predictions."
                      ] })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsx9(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "flex-end",
                    padding: "12px 20px",
                    borderTop: "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)"
                  },
                  children: /* @__PURE__ */ jsx9(
                    "button",
                    {
                      type: "button",
                      className: "btn-secondary",
                      onClick: () => setSelectedRecord(null),
                      children: "Close Inspector"
                    }
                  )
                }
              )
            ]
          }
        )
      }
    )
  ] });
}

// frontend/tests/tier1_features.test.tsx
import { jsx as jsx10 } from "react/jsx-runtime";
describe("Tier 1: Feature Coverage (F1 to F15)", () => {
  describe("F1: IndiaMap Shell & Layout", () => {
    it("renders map shell container with toolbar, controls, and legend bar", () => {
      const html = renderComponent(
        /* @__PURE__ */ jsx10(
          IndiaMap,
          {
            selectedState: "Maharashtra",
            height: "550px",
            overlayMetric: "temperature",
            forecastDay: 1
          }
        )
      );
      assertContains(html, "map-shell-container");
      assertContains(html, "map-toolbar-bar");
      assertContains(html, "map-legend-bar");
      assertContains(html, "Temperature");
      assertContains(html, "Humidity");
      assertContains(html, "Rainfall");
      assertContains(html, "Wind");
      assertContains(html, "Horizon:");
      assertContains(html, "Day 1");
      assertContains(html, "Day 7");
      assertContains(html, "Search city");
    });
    it("normalizes legacy state names correctly", () => {
      assert2.strictEqual(
        normalizeStateName("Jammu & Kashmir"),
        "Jammu And Kashmir"
      );
      assert2.strictEqual(
        normalizeStateName("Andaman & Nicobar"),
        "Andaman And Nicobar"
      );
      assert2.strictEqual(
        normalizeStateName("Dadra & Nagar Haveli"),
        "Dadra And Nagar Haveli And Daman And Diu"
      );
      assert2.strictEqual(
        normalizeStateName("Karnataka"),
        "Karnataka"
      );
    });
  });
  describe("F2: IndiaMap Page Integration", () => {
    it("renders page header, KPI chips, and responsive two-column grid layout", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(IndiaMapPage, { selectedState: "Karnataka" }));
      assertContains(html, "India Meteorological Intelligence Map");
      assertContains(html, "Monitored Regions");
      assertContains(html, "36 States / UTs");
      assertContains(html, "Live Feeds");
      assertContains(html, "150+ Cities");
      assertContains(html, "Active Overlay");
      assertContains(html, "Inference Engine");
      assertContains(html, "LightGBM Multi-Output");
      assertContains(html, "map-layout-grid");
      assertContains(html, "map-shell-container");
    });
  });
  describe("F3: IndiaMap Meteorological Overlays", () => {
    it("supports all 4 meteorological overlays with valid units and legends", () => {
      assert2.ok(METRIC_CONFIGS.temperature, "Temperature overlay config exists");
      assert2.ok(METRIC_CONFIGS.humidity, "Humidity overlay config exists");
      assert2.ok(METRIC_CONFIGS.rainfall, "Rainfall overlay config exists");
      assert2.ok(METRIC_CONFIGS.wind, "Wind overlay config exists");
      assert2.strictEqual(METRIC_CONFIGS.temperature.unit, "\xB0C");
      assert2.strictEqual(METRIC_CONFIGS.humidity.unit, "%");
      assert2.strictEqual(METRIC_CONFIGS.rainfall.unit, "mm");
      assert2.strictEqual(METRIC_CONFIGS.wind.unit, "km/h");
      assert2.strictEqual(getTempColor(void 0), "#94a3b8");
      assert2.strictEqual(getTempColor(10), "#3b82f6");
      assert2.strictEqual(getTempColor(18), "#06b6d4");
      assert2.strictEqual(getTempColor(22), "#10b981");
      assert2.strictEqual(getTempColor(28), "#f59e0b");
      assert2.strictEqual(getTempColor(32), "#f97316");
      assert2.strictEqual(getTempColor(40), "#ef4444");
    });
    it("renders legend swatches in the legend bar", () => {
      const html = renderComponent(
        /* @__PURE__ */ jsx10(IndiaMap, { overlayMetric: "temperature", forecastDay: 2 })
      );
      assertContains(html, "legend-swatch");
      assertContains(html, "Day 2 LightGBM Multi-Output Forecast");
    });
  });
  describe("F4: IndiaMap State Selection & Telemetry", () => {
    it("renders unselected state prompt with quick-select buttons for key states", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(IndiaMapPage, { selectedState: "" }));
      assertContains(html, "No State Selected");
      assertContains(html, "Quick Select Key States:");
      assertContains(html, "Maharashtra");
      assertContains(html, "Delhi");
      assertContains(html, "Karnataka");
      assertContains(html, "Tamil Nadu");
      assertContains(html, "Uttar Pradesh");
      assertContains(html, "Gujarat");
    });
    it("renders regional telemetry panel with quick jump button when state is selected", () => {
      const html = renderComponent(
        /* @__PURE__ */ jsx10(
          IndiaMapPage,
          {
            selectedState: "Maharashtra",
            onSelectState: () => {
            },
            onNavigateTab: () => {
            }
          }
        )
      );
      assertContains(html, "Maharashtra");
      assertContains(html, "Regional Telemetry &amp; Forecast");
      assertContains(html, "Clear Selection");
      assertContains(html, "Open Full Forecast Details");
    });
  });
  describe("F5: ML Architecture Flow Diagram", () => {
    it("renders .arch-flow with 5 connected stages and tech stack badges", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(MLDashboardPage, {}));
      assertContains(html, "arch-flow");
      assertContains(html, "arch-node");
      assertContains(html, "arch-arrow");
      assertContains(html, "Raw Data (PostgreSQL)");
      assertContains(html, "Feature Pipeline (20 features)");
      assertContains(html, "LightGBM Multi-Output (7 horizons)");
      assertContains(html, "FastAPI Inference Service");
      assertContains(html, "React 18 Enterprise UI");
      assertContains(html, "Python 3.11");
      assertContains(html, "LightGBM");
      assertContains(html, "scikit-learn");
      assertContains(html, "FastAPI");
      assertContains(html, "PostgreSQL");
      assertContains(html, "React 18");
      assertContains(html, "TypeScript");
      assertContains(html, "Vite");
    });
  });
  describe("F6: Feature Taxonomy & Engineering", () => {
    it("renders .feature-groups-grid with 5 categories and 20 features", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(MLDashboardPage, {}));
      assertContains(html, "feature-groups-grid");
      assertContains(html, "feature-card");
      assertContains(html, "Temperature Lags");
      assertContains(html, "Atmospheric Lags");
      assertContains(html, "Derived Trends");
      assertContains(html, "Cyclical Temporal Embeddings");
      assertContains(html, "Geographic Categoricals");
      assertContains(html, "lag1_temp_avg");
      assertContains(html, "lag1_humidity");
      assertContains(html, "roll7_temp_avg");
      assertContains(html, "month_sin");
      assertContains(html, "month_cos");
    });
  });
  describe("F7: Training Pipeline & Invariant Safeguards", () => {
    it("renders training parameters, temporal split table, and 5 anti-leakage safeguards", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(MLDashboardPage, {}));
      assertContains(html, "LightGBM Multi-Output Regressor");
      assertContains(html, "7 Simultaneous Outputs (Temp_Avg)");
      assertContains(html, "StandardScaler + OneHotEncoder");
      assertContains(html, "8 days");
      assertContains(html, "Historical Train Partition");
      assertContains(html, "Residual Calibration Partition");
      assertContains(html, "Holdout Test Partition");
      assertContains(html, "2015-01-08");
      assertContains(html, "2025-07-11");
      assertContains(html, "2026-10-18");
      assertContains(html, "Strict Temporal Cutoff (date &lt; asof)");
      assertContains(html, "8-Day Target Window Embargo");
      assertContains(html, "Per-State Rolling Calculation Isolation");
      assertContains(html, "Runtime Staleness Enforcers (MAX_STALENESS_DAYS = 2)");
      assertContains(html, "Conformal Interval Calibration Gate");
    });
  });
  describe("F8: ML REST API & Deployment Spec", () => {
    it("documents all 6 REST endpoints and 3 deployment architecture cards", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(MLDashboardPage, {}));
      assertContains(html, "/forecast/all");
      assertContains(html, "/predict");
      assertContains(html, "/model-info");
      assertContains(html, "/weather/{state}/recent");
      assertContains(html, "/weather/history");
      assertContains(html, "/health");
      assertContains(html, "PostgreSQL Durability");
      assertContains(html, "Caching &amp; Concurrency");
      assertContains(html, "Continuous Model Validation");
    });
  });
  describe("F9: Weather History Filter Toolbar & KPIs", () => {
    it("renders filter toolbar with dropdowns, search, dates, and header", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(WeatherHistoryPage, {}));
      assertContains(html, "Weather History Archive");
      assertContains(html, "46,834 Locked Rows");
      assertContains(html, "Query &amp; Observation Filters");
      assertContains(html, "State");
      assertContains(html, "District");
      assertContains(html, "Location Station");
      assertContains(html, "Start Date");
      assertContains(html, "End Date");
      assertContains(html, "Search Observations");
      assertContains(html, "Select a Weather Region");
    });
  });
  describe("F10: Weather History Trend Chart", () => {
    it("renders filter toolbar and query controls for trend inspection", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(WeatherHistoryPage, {}));
      assertContains(html, "Query &amp; Observation Filters");
      assertContains(html, "Reset Filters");
    });
  });
  describe("F11: Weather History Sortable Table", () => {
    it("renders state selection guidance and structured filter panel", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(WeatherHistoryPage, {}));
      assertContains(html, "Select a Weather Region");
      assertContains(html, "Choose an Indian state from the filter toolbar above");
    });
  });
  describe("F12: Model Performance Evaluation & Status", () => {
    it("renders page head, validation badges, hero metrics, and evaluation banner", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(ModelPerformancePage, {}));
      assertContains(html, "Model Evaluation &amp; Benchmarking");
      assertContains(html, "Diagnostic Overlap (Unvalidated)");
      assertContains(html, "Artifact: weather_model_v3.joblib");
      assertContains(html, "Production Model");
      assertContains(html, "LightGBM Multi-Output");
      assertContains(html, "Overall Test MAE");
      assertContains(html, "Overall RMSE");
      assertContains(html, "R\xB2 Score");
      assertContains(html, "Baseline Skill Score");
    });
  });
  describe("F13: Model Baseline Comparison Visuals", () => {
    it("renders baseline comparison bar chart, metric toggles, and comparison table", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(ModelPerformancePage, {}));
      assertContains(html, "Model Architecture Benchmark Comparison");
      assertContains(html, "MAE (Lower is Better)");
      assertContains(html, "RMSE (Lower is Better)");
      assertContains(html, "R\xB2 Score (Higher is Better)");
      assertContains(html, "LightGBM Multi-Output");
      assertContains(html, "Random Forest (Tuned)");
      assertContains(html, "Linear Regression");
      assertContains(html, "Climatology Reference");
      assertContains(html, "Persistence Reference");
      assertContains(html, "Horizon-by-Horizon Performance Breakdown (Day 1 through Day 7)");
      assertContains(html, "Day 1 (t+1)");
      assertContains(html, "Day 7 (t+7)");
    });
  });
  describe("F14: Prediction History Audit Log & Filters", () => {
    it("renders audit log page head, state filter, page size selector, and audit trail", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(PredictionHistoryPage, {}));
      assertContains(html, "Prediction History &amp; Audit Log");
      assertContains(html, "Database Audit Trail");
      assertContains(html, "Total Stored Predictions");
      assertContains(html, "Active Filter Matches");
      assertContains(html, "Production Engine");
      assertContains(html, "LightGBM v3");
      assertContains(html, "State Filter");
      assertContains(html, "Model Version");
      assertContains(html, "Search Audit Trail");
      assertContains(html, "Rows per page");
      assertContains(html, "Refresh");
    });
  });
  describe("F15: Prediction History Detail Modal/Drawer", () => {
    it("renders initial auto-loading skeleton state on mount", () => {
      const html = renderComponent(/* @__PURE__ */ jsx10(PredictionHistoryPage, {}));
      assertContains(html, "Loading Prediction Audit Records\u2026");
      assertContains(html, "skeleton-box");
      assertContains(html, "skeleton-line");
    });
  });
});
