// tests/forecast_api.test.tsx
import { describe, it, beforeEach, afterEach } from "node:test";
import assert2 from "node:assert/strict";

// src/services/api.ts
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
function getForecastAll(dayOrDate, date) {
  const params = new URLSearchParams();
  if (typeof dayOrDate === "number") {
    params.set("day", String(dayOrDate));
    if (date) params.set("date", date);
  } else if (typeof dayOrDate === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayOrDate)) {
      params.set("date", dayOrDate);
    } else if (!isNaN(Number(dayOrDate))) {
      params.set("day", dayOrDate);
    } else {
      params.set("date", dayOrDate);
    }
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/forecast/all${query}`);
}

// src/components/IndiaMap.tsx
import { useEffect, useMemo, useRef, useState } from "react";

// tests/mocks/leafletMock.tsx
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

// src/services/cityWeather.ts
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

// src/components/icons.tsx
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
function base(props) {
  return {
    width: props.width ?? 16,
    height: props.height ?? 16,
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
function MapIcon(props) {
  return /* @__PURE__ */ jsxs("svg", { ...base(props), children: [
    /* @__PURE__ */ jsx2("polygon", { points: "3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" }),
    /* @__PURE__ */ jsx2("line", { x1: "9", x2: "9", y1: "3", y2: "18" }),
    /* @__PURE__ */ jsx2("line", { x1: "15", x2: "15", y1: "6", y2: "21" })
  ] });
}

// src/components/ui.tsx
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

// src/components/IndiaMap.tsx
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
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener("resize", handleResize);
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, [map]);
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
        const data = await getForecastAll(forecastDay);
        if (!cancelled) {
          setForecasts(data);
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
          /* @__PURE__ */ jsx4(MapResizeHandler, {}),
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

// src/pages/IndiaMapPage.tsx
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
        const allForecasts = await getForecastAll(forecastDay);
        if (!cancelled) {
          const val = allForecasts[normState] ?? allForecasts[selectedState];
          setForecastTemp(val !== void 0 ? val : null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Could not load day forecast for state:", selectedState, err);
          setForecastTemp(null);
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

// tests/mocks/testUtils.tsx
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

// tests/forecast_api.test.tsx
import { jsx as jsx6 } from "react/jsx-runtime";
describe("Forecast API Regression & Integration Tests", () => {
  const originalFetch = globalThis.fetch;
  let recordedUrls = [];
  beforeEach(() => {
    recordedUrls = [];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  it("sends correct day parameter for day-based requests", async () => {
    globalThis.fetch = (async (url) => {
      const urlStr = url.toString();
      recordedUrls.push(urlStr);
      return {
        ok: true,
        status: 200,
        json: async () => ({ Karnataka: 24.5, Maharashtra: 26.2 })
      };
    });
    const dataDay1 = await getForecastAll(1);
    assert2.deepEqual(dataDay1, { Karnataka: 24.5, Maharashtra: 26.2 });
    assert2.match(recordedUrls[0], /\/forecast\/all\?day=1$/);
    const dataDay7 = await getForecastAll(7);
    assert2.deepEqual(dataDay7, { Karnataka: 24.5, Maharashtra: 26.2 });
    assert2.match(recordedUrls[1], /\/forecast\/all\?day=7$/);
  });
  it("sends correct date parameter for date-based requests", async () => {
    globalThis.fetch = (async (url) => {
      recordedUrls.push(url.toString());
      return {
        ok: true,
        status: 200,
        json: async () => ({ Karnataka: 25 })
      };
    });
    const data = await getForecastAll("2026-11-10");
    assert2.deepEqual(data, { Karnataka: 25 });
    assert2.match(recordedUrls[0], /\/forecast\/all\?date=2026-11-10$/);
  });
  it("sends both day and date when both are provided", async () => {
    globalThis.fetch = (async (url) => {
      recordedUrls.push(url.toString());
      return {
        ok: true,
        status: 200,
        json: async () => ({ Karnataka: 23 })
      };
    });
    const data = await getForecastAll(3, "2026-11-10");
    assert2.deepEqual(data, { Karnataka: 23 });
    assert2.match(recordedUrls[0], /\/forecast\/all\?day=3&date=2026-11-10$/);
  });
  it("preserves compatibility with empty arguments and string digit days", async () => {
    globalThis.fetch = (async (url) => {
      recordedUrls.push(url.toString());
      return {
        ok: true,
        status: 200,
        json: async () => ({ Delhi: 20 })
      };
    });
    await getForecastAll();
    assert2.match(recordedUrls[0], /\/forecast\/all$/);
    await getForecastAll("4");
    assert2.match(recordedUrls[1], /\/forecast\/all\?day=4$/);
  });
  it("correctly handles HTTP 422 Unprocessable Entity responses", async () => {
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: async () => ({ detail: "Invalid day parameter: must be between 1 and 7." })
      };
    });
    try {
      await getForecastAll(99);
      assert2.fail("Should have thrown ApiError");
    } catch (err) {
      assert2(err instanceof ApiError);
      assert2.equal(err.status, 422);
      assert2.equal(err.message, "Invalid day parameter: must be between 1 and 7.");
    }
  });
  it("correctly handles HTTP 500 and network failure errors", async () => {
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ detail: "Database connection failed" })
      };
    });
    try {
      await getForecastAll(1);
      assert2.fail("Should have thrown ApiError on 500");
    } catch (err) {
      assert2(err instanceof ApiError);
      assert2.equal(err.status, 500);
      assert2.equal(err.message, "Database connection failed");
    }
    globalThis.fetch = (async () => {
      throw new Error("Connection refused");
    });
    try {
      await getForecastAll(1);
      assert2.fail("Should have thrown ApiError on network failure");
    } catch (err) {
      assert2(err instanceof ApiError);
      assert2.equal(err.status, 0);
      assert2.match(err.message, /Cannot reach the backend server/);
    }
  });
  it("renders IndiaMap and IndiaMapPage using getForecastAll without crashing", () => {
    const mapHtml = renderComponent(
      /* @__PURE__ */ jsx6(IndiaMap, { selectedState: "Karnataka", forecastDay: 2 })
    );
    assertContains(mapHtml, "map-shell-container");
    assertContains(mapHtml, "Day 2");
    const pageHtml = renderComponent(
      /* @__PURE__ */ jsx6(IndiaMapPage, { selectedState: "Karnataka" })
    );
    assertContains(pageHtml, "India Meteorological Intelligence Map");
    assertContains(pageHtml, "Karnataka");
  });
});
