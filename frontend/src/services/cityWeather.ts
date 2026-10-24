/**
 * Comprehensive Indian cities list with coordinates for weather markers.
 * Covers all state/UT capitals, district HQs, tier-1/2/3 cities — 150+ cities.
 */
export interface CityDef {
  name: string;
  state: string;
  district?: string;
  location?: string;
  lat: number;
  lng: number;
}

export const INDIAN_CITIES: CityDef[] = [
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
  { name: "Rajahmundry", state: "Andhra Pradesh", lat: 17.0005, lng: 81.8040 },
  { name: "Kakinada", state: "Andhra Pradesh", lat: 16.9891, lng: 82.2475 },
  { name: "Anantapur", state: "Andhra Pradesh", lat: 14.6819, lng: 77.6006 },

  // ─── ARUNACHAL PRADESH ─────────────────────────────────────
  { name: "Itanagar", state: "Arunachal Pradesh", lat: 27.0844, lng: 93.6053 },
  { name: "Tawang", state: "Arunachal Pradesh", lat: 27.5860, lng: 91.8596 },

  // ─── ASSAM ─────────────────────────────────────────────────
  { name: "Guwahati", state: "Assam", lat: 26.1445, lng: 91.7362 },
  { name: "Dibrugarh", state: "Assam", lat: 27.4728, lng: 94.9120 },
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
  { name: "Durg", state: "Chhattisgarh", lat: 21.1900, lng: 81.2849 },
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
  { name: "Bhuj", state: "Gujarat", lat: 23.2420, lng: 69.6669 },

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
  { name: "Dharamshala", state: "Himachal Pradesh", lat: 32.2190, lng: 76.3234 },
  { name: "Mandi", state: "Himachal Pradesh", lat: 31.7066, lng: 76.9317 },

  // ─── JHARKHAND ─────────────────────────────────────────────
  { name: "Ranchi", state: "Jharkhand", lat: 23.3441, lng: 85.3096 },
  { name: "Jamshedpur", state: "Jharkhand", lat: 22.8046, lng: 86.2029 },
  { name: "Dhanbad", state: "Jharkhand", lat: 23.7957, lng: 86.4304 },
  { name: "Bokaro", state: "Jharkhand", lat: 23.6693, lng: 86.1511 },

  // ─── JAMMU & KASHMIR / LADAKH ──────────────────────────────
  { name: "Srinagar", state: "Jammu And Kashmir", lat: 34.0837, lng: 74.7973 },
  { name: "Jammu", state: "Jammu And Kashmir", lat: 32.7266, lng: 74.8570 },
  { name: "Anantnag", state: "Jammu And Kashmir", lat: 33.7311, lng: 75.1487 },
  { name: "Leh", state: "Ladakh", lat: 34.1526, lng: 77.5771 },
  { name: "Kargil", state: "Ladakh", lat: 34.5539, lng: 76.1349 },

  // ─── KARNATAKA ─────────────────────────────────────────────
  { name: "Mysuru", state: "Karnataka", lat: 12.2958, lng: 76.6394 },
  { name: "Mangaluru", state: "Karnataka", lat: 12.9141, lng: 74.856 },
  { name: "Hubli", state: "Karnataka", lat: 15.3647, lng: 75.1240 },
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
  { name: "Kolhapur", state: "Maharashtra", lat: 16.7050, lng: 74.2433 },
  { name: "Thane", state: "Maharashtra", lat: 19.2183, lng: 72.9781 },
  { name: "Navi Mumbai", state: "Maharashtra", lat: 19.0330, lng: 73.0297 },
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
  { name: "Cuttack", state: "Odisha", lat: 20.4625, lng: 85.8830 },
  { name: "Rourkela", state: "Odisha", lat: 22.2604, lng: 84.8536 },
  { name: "Berhampur", state: "Odisha", lat: 19.3150, lng: 84.7941 },
  { name: "Sambalpur", state: "Odisha", lat: 21.4669, lng: 83.9812 },
  { name: "Puri", state: "Odisha", lat: 19.7983, lng: 85.8312 },

  // ─── PUNJAB ────────────────────────────────────────────────
  { name: "Ludhiana", state: "Punjab", lat: 30.901, lng: 75.8573 },
  { name: "Amritsar", state: "Punjab", lat: 31.634, lng: 74.8723 },
  { name: "Jalandhar", state: "Punjab", lat: 31.3260, lng: 75.5762 },
  { name: "Patiala", state: "Punjab", lat: 30.3398, lng: 76.3869 },
  { name: "Bathinda", state: "Punjab", lat: 30.2110, lng: 74.9455 },

  // ─── RAJASTHAN ─────────────────────────────────────────────
  { name: "Jaipur", state: "Rajasthan", lat: 26.9124, lng: 75.7873 },
  { name: "Jodhpur", state: "Rajasthan", lat: 26.2389, lng: 73.0243 },
  { name: "Udaipur", state: "Rajasthan", lat: 24.5854, lng: 73.7125 },
  { name: "Kota", state: "Rajasthan", lat: 25.2138, lng: 75.8648 },
  { name: "Ajmer", state: "Rajasthan", lat: 26.4499, lng: 74.6399 },
  { name: "Bikaner", state: "Rajasthan", lat: 28.0229, lng: 73.3119 },
  { name: "Jaisalmer", state: "Rajasthan", lat: 26.9157, lng: 70.9083 },
  { name: "Alwar", state: "Rajasthan", lat: 27.5530, lng: 76.6346 },
  { name: "Bharatpur", state: "Rajasthan", lat: 27.2152, lng: 77.4890 },

  // ─── SIKKIM ────────────────────────────────────────────────
  { name: "Gangtok", state: "Sikkim", lat: 27.3389, lng: 88.6065 },

  // ─── TAMIL NADU ────────────────────────────────────────────
  { name: "Madurai", state: "Tamil Nadu", lat: 9.9252, lng: 78.1198 },
  { name: "Coimbatore", state: "Tamil Nadu", lat: 11.0168, lng: 76.9558 },
  { name: "Tiruchirappalli", state: "Tamil Nadu", lat: 10.7905, lng: 78.7047 },
  { name: "Salem", state: "Tamil Nadu", lat: 11.6643, lng: 78.1460 },
  { name: "Tirunelveli", state: "Tamil Nadu", lat: 8.7139, lng: 77.7567 },
  { name: "Erode", state: "Tamil Nadu", lat: 11.3410, lng: 77.7172 },
  { name: "Vellore", state: "Tamil Nadu", lat: 12.9165, lng: 79.1325 },
  { name: "Thoothukudi", state: "Tamil Nadu", lat: 8.7642, lng: 78.1348 },
  { name: "Thanjavur", state: "Tamil Nadu", lat: 10.7870, lng: 79.1378 },
  { name: "Ooty", state: "Tamil Nadu", lat: 11.4102, lng: 76.6950 },

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
  { name: "Noida", state: "Uttar Pradesh", lat: 28.5355, lng: 77.3910 },
  { name: "Ghaziabad", state: "Uttar Pradesh", lat: 28.6692, lng: 77.4538 },
  { name: "Bareilly", state: "Uttar Pradesh", lat: 28.3670, lng: 79.4304 },
  { name: "Aligarh", state: "Uttar Pradesh", lat: 27.8974, lng: 78.0880 },
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
  { name: "Haldwani", state: "Uttarakhand", lat: 29.2183, lng: 79.5130 },

  // ─── WEST BENGAL ───────────────────────────────────────────
  { name: "Howrah", state: "West Bengal", lat: 22.5958, lng: 88.2636 },
  { name: "Durgapur", state: "West Bengal", lat: 23.5204, lng: 87.3119 },
  { name: "Asansol", state: "West Bengal", lat: 23.6889, lng: 86.9661 },
  { name: "Siliguri", state: "West Bengal", lat: 26.7271, lng: 88.3953 },
  { name: "Darjeeling", state: "West Bengal", lat: 27.0360, lng: 88.2627 },
  { name: "Malda", state: "West Bengal", lat: 25.0108, lng: 88.1410 },
  { name: "Kharagpur", state: "West Bengal", lat: 22.3460, lng: 87.2320 },

  // ─── UNION TERRITORIES ─────────────────────────────────────
  { name: "Port Blair", state: "Andaman And Nicobar", lat: 11.6234, lng: 92.7265 },
  { name: "Puducherry", state: "Puducherry", lat: 11.9416, lng: 79.8083 },
  { name: "Daman", state: "Dadra And Nagar Haveli And Daman And Diu", lat: 20.3974, lng: 72.8328 },
  { name: "Silvassa", state: "Dadra And Nagar Haveli And Daman And Diu", lat: 20.2766, lng: 73.0091 },
  { name: "Kavaratti", state: "Lakshadweep", lat: 10.5626, lng: 72.6369 },
];

/** WMO Weather interpretation codes → description + icon */
export function wmoWeatherCode(code: number): { description: string; emoji: string } {
  const map: Record<number, { description: string; emoji: string }> = {
    0: { description: "Clear sky", emoji: "☀️" },
    1: { description: "Mainly clear", emoji: "🌤" },
    2: { description: "Partly cloudy", emoji: "⛅" },
    3: { description: "Overcast", emoji: "☁️" },
    45: { description: "Foggy", emoji: "🌫️" },
    48: { description: "Rime fog", emoji: "🌫️" },
    51: { description: "Light drizzle", emoji: "🌦" },
    53: { description: "Moderate drizzle", emoji: "🌦" },
    55: { description: "Dense drizzle", emoji: "🌧" },
    56: { description: "Freezing drizzle", emoji: "🌧" },
    57: { description: "Heavy freezing drizzle", emoji: "🌧" },
    61: { description: "Slight rain", emoji: "🌦" },
    63: { description: "Moderate rain", emoji: "🌧" },
    65: { description: "Heavy rain", emoji: "🌧" },
    66: { description: "Freezing rain", emoji: "🌧" },
    67: { description: "Heavy freezing rain", emoji: "🌧" },
    71: { description: "Slight snow", emoji: "🌨" },
    73: { description: "Moderate snow", emoji: "🌨" },
    75: { description: "Heavy snow", emoji: "❄️" },
    77: { description: "Snow grains", emoji: "❄️" },
    80: { description: "Slight showers", emoji: "🌦" },
    81: { description: "Moderate showers", emoji: "🌧" },
    82: { description: "Violent showers", emoji: "⛈" },
    85: { description: "Slight snow showers", emoji: "🌨" },
    86: { description: "Heavy snow showers", emoji: "❄️" },
    95: { description: "Thunderstorm", emoji: "⛈" },
    96: { description: "Thunderstorm + hail", emoji: "⛈" },
    99: { description: "Severe thunderstorm", emoji: "⛈" },
  };
  return map[code] ?? { description: "Unknown", emoji: "🌡️" };
}

export interface CityWeather {
  city: CityDef;
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  emoji: string;
  isDay: boolean;
}

interface OpenMeteoGeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  admin1?: string;
  admin2?: string;
}

function toCityWeather(city: CityDef, current: Record<string, number | undefined>): CityWeather {
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
    isDay: (current.is_day ?? 1) === 1,
  };
}

/** Searches the India portion of Open-Meteo's city index and gets live weather. */
export async function searchIndianCityWeather(query: string): Promise<CityWeather[]> {
  const name = query.trim();
  if (!name) return [];

  const geocodeResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`
  );
  if (!geocodeResponse.ok) throw new Error("City search is temporarily unavailable");

  const geocodeData = await geocodeResponse.json() as { results?: OpenMeteoGeocodingResult[] };
  const places = (geocodeData.results ?? []).filter((place) => place.country_code === "IN");
  if (places.length === 0) return [];

  const weatherResponse = await fetch(
    "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${places.map((place) => place.latitude).join(",")}` +
      `&longitude=${places.map((place) => place.longitude).join(",")}` +
      "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day" +
      "&timezone=Asia%2FKolkata"
  );
  if (!weatherResponse.ok) throw new Error("Live weather is temporarily unavailable");

  const weatherData = await weatherResponse.json() as
    | { current?: Record<string, number | undefined> }
    | Array<{ current?: Record<string, number | undefined> }>;
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
      lng: place.longitude,
    }, current)];
  });
}

/**
 * Fetches current weather for all Indian cities from the Open-Meteo API.
 * Free, no API key required.
 *
 * Open-Meteo can handle long lat/lng lists, but we batch in chunks of 50
 * to avoid excessively long URLs and improve reliability.
 */
export async function fetchAllCityWeather(): Promise<CityWeather[]> {
  const CHUNK_SIZE = 50;
  const chunks: CityDef[][] = [];

  for (let i = 0; i < INDIAN_CITIES.length; i += CHUNK_SIZE) {
    chunks.push(INDIAN_CITIES.slice(i, i + CHUNK_SIZE));
  }

  const allResults: CityWeather[] = [];

  // Fetch all chunks in parallel
  const chunkPromises = chunks.map(async (chunk) => {
    const lats = chunk.map((c) => c.lat).join(",");
    const lngs = chunk.map((c) => c.lng).join(",");

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lats}` +
      `&longitude=${lngs}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
      `&timezone=Asia/Kolkata`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch city weather data");
    const data = await response.json();

    // Open-Meteo returns an array when multiple coordinates are given
    const results: any[] = Array.isArray(data) ? data : [data];

    return results.map((r, i) => {
      const city = chunk[i];
      return toCityWeather(city, r.current ?? {});
    });
  });

  const chunkResults = await Promise.all(chunkPromises);
  for (const chunk of chunkResults) {
    allResults.push(...chunk);
  }

  return allResults;
}
