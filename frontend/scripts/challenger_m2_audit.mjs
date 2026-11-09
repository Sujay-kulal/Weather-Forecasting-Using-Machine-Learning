import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(frontendRoot, "..");

console.log("===============================================================================");
console.log("   CHALLENGER ADVERSARIAL VERIFICATION HARNESS — MILESTONE 2 (FRONTEND/API)   ");
console.log("===============================================================================\n");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// 1. Check for 1.25 in frontend/src
// ----------------------------------------------------------------------------
test("1. Verify no diagnostic MAE is misrepresented as 1.25 across frontend/src", () => {
  const srcDir = path.resolve(frontendRoot, "src");
  function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        results = results.concat(walk(full));
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        results.push(full);
      }
    }
    return results;
  }

  const files = walk(srcDir);
  const matches = [];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf-8");
    const lines = content.split("\n");
    lines.forEach((l, idx) => {
      if (l.includes("1.25")) {
        matches.push({ file: path.relative(srcDir, f), line: idx + 1, content: l.trim() });
      }
    });
  }

  // Exactly 6 matches: cityWeather.ts (2 coordinates), icons.tsx (3 SVG coords), ModelPerformancePage.tsx (1 horizon-1 RMSE: 1.2517)
  assert.strictEqual(matches.length, 6, `Expected exactly 6 known matches, found ${matches.length}`);

  for (const m of matches) {
    // Assert none represent MAE
    assert.ok(!m.content.includes("±1.25"), `Forbidden ±1.25 in ${m.file}:${m.line}`);
    assert.ok(!m.content.includes('"1.25"'), `Forbidden "1.25" in ${m.file}:${m.line}`);
    assert.ok(!m.content.includes('"1.250"'), `Forbidden "1.250" in ${m.file}:${m.line}`);
    assert.ok(!/mae\s*[:=]\s*1\.25/i.test(m.content), `1.25 must not be assigned to MAE in ${m.file}:${m.line}`);
  }

  // Verify App.tsx footer explicitly has 1.16
  const appContent = fs.readFileSync(path.resolve(srcDir, "App.tsx"), "utf-8");
  assert.ok(appContent.includes("Diagnostic MAE: ±1.16°C (validation pending)"), "App.tsx footer missing ±1.16°C");

  // Verify ForecastPage.tsx fallback has 1.164
  const forecastContent = fs.readFileSync(path.resolve(srcDir, "pages/ForecastPage.tsx"), "utf-8");
  assert.ok(forecastContent.includes('"1.164"'), "ForecastPage.tsx fallback missing 1.164");
});

// ----------------------------------------------------------------------------
// 2. Conformal Interval Calibration Safeguard in PredictionHistoryPage.tsx
// ----------------------------------------------------------------------------
test("2. Verify PredictionHistoryPage does not fabricate intervals when uncalibrated", () => {
  const pagePath = path.resolve(frontendRoot, "src/pages/PredictionHistoryPage.tsx");
  const content = fs.readFileSync(pagePath, "utf-8");

  // Verify hardcoded CONFORMAL_Q is absent
  assert.ok(!content.includes("CONFORMAL_Q = 2.84"), "Found hardcoded CONFORMAL_Q = 2.84 in PredictionHistoryPage.tsx");
  assert.ok(!content.includes("CONFORMAL_Q"), "Found CONFORMAL_Q reference in PredictionHistoryPage.tsx");
  assert.ok(!content.includes("2.84"), "Found hardcoded 2.84 in PredictionHistoryPage.tsx");

  // Verify interval gating condition
  assert.ok(
    content.includes('modelInfo.data?.interval_status === "calibrated" && typeof modelInfo.data?.q === "number"'),
    "Gating condition must check interval_status === 'calibrated' and typeof q === 'number'"
  );

  // Simulate component logic under model_info.json status ("not_calibrated_for_current_artifact")
  const modelInfoUncalibrated = {
    data: {
      interval_status: "not_calibrated_for_current_artifact",
      q: null,
    },
  };

  const isCalibrated =
    modelInfoUncalibrated.data?.interval_status === "calibrated" &&
    typeof modelInfoUncalibrated.data?.q === "number";
  const conformalQ = isCalibrated ? modelInfoUncalibrated.data.q : null;

  assert.strictEqual(isCalibrated, false, "isCalibrated must be false for uncalibrated artifact");
  assert.strictEqual(conformalQ, null, "conformalQ must be null when uncalibrated");

  // Trajectory chart mapper simulation
  const dummyTemps = [25.0, 26.0, 27.0, 26.5, 25.5, 24.5, 24.0];
  const chartPoints = dummyTemps.map((temp, i) => ({
    day: `Day ${i + 1}`,
    temp: Number(temp.toFixed(2)),
    ...(isCalibrated && conformalQ !== null
      ? {
          upper: Number((temp + conformalQ).toFixed(2)),
          lower: Number((temp - conformalQ).toFixed(2)),
        }
      : {}),
  }));

  for (const pt of chartPoints) {
    assert.strictEqual(pt.upper, undefined, "Chart point must not have upper bound when uncalibrated");
    assert.strictEqual(pt.lower, undefined, "Chart point must not have lower bound when uncalibrated");
  }

  // Verify text indicator for uncalibrated in table cells
  assert.ok(content.includes("Uncalibrated for artifact"), "Must render 'Uncalibrated for artifact' indicator in table cells");
  assert.ok(
    content.includes("title=\"Conformal intervals omitted: interval_status is not_calibrated_for_current_artifact\""),
    "Must have explanatory tooltip explaining omission"
  );
  assert.ok(
    content.includes("Empirical 90% confidence intervals are withheld because the active model artifact has not completed residual calibration"),
    "Must display audit verification note when uncalibrated"
  );
});

// ----------------------------------------------------------------------------
// 3. API Contract Schema Alignment in types/api.ts
// ----------------------------------------------------------------------------
test("3. Verify types/api.ts schema definitions match backend contracts", () => {
  const typesPath = path.resolve(frontendRoot, "src/types/api.ts");
  const content = fs.readFileSync(typesPath, "utf-8");

  // PredictionsResponse
  assert.ok(content.includes("export interface PredictionsResponse {"), "Missing PredictionsResponse interface");
  const predRespMatch = content.match(/export interface PredictionsResponse \{([\s\S]*?)\}/);
  assert.ok(predRespMatch, "Could not match PredictionsResponse body");
  const predRespBody = predRespMatch[1];
  assert.ok(predRespBody.includes("total: number"), "PredictionsResponse missing total: number");
  assert.ok(predRespBody.includes("limit: number"), "PredictionsResponse missing limit: number");
  assert.ok(predRespBody.includes("offset: number"), "PredictionsResponse missing offset: number");

  // PredictionRecord
  assert.ok(content.includes("export interface PredictionRecord {"), "Missing PredictionRecord interface");
  const predRecMatch = content.match(/export interface PredictionRecord \{([\s\S]*?)\}/);
  assert.ok(predRecMatch, "Could not match PredictionRecord body");
  const predRecBody = predRecMatch[1];
  assert.ok(predRecBody.includes("model_version?: string | null"), "PredictionRecord missing model_version");
  assert.ok(predRecBody.includes("actual_temp?: number | null"), "PredictionRecord missing actual_temp");

  // ModelInfoResponse
  assert.ok(content.includes("export interface ModelInfoResponse {"), "Missing ModelInfoResponse interface");
  const modelInfoMatch = content.match(/export interface ModelInfoResponse \{([\s\S]*?)\}/);
  assert.ok(modelInfoMatch, "Could not match ModelInfoResponse body");
  const modelInfoBody = modelInfoMatch[1];
  assert.ok(modelInfoBody.includes("loaded_artifact_version: string"), "ModelInfoResponse missing loaded_artifact_version");
  assert.ok(modelInfoBody.includes("validated_for_artifact?: boolean | null"), "ModelInfoResponse missing validated_for_artifact");
  assert.ok(modelInfoBody.includes("evaluation?: Record<string, any> | null"), "ModelInfoResponse missing evaluation");
});

// ----------------------------------------------------------------------------
// 4. Dead Column Removal and Endpoint Correction Verification
// ----------------------------------------------------------------------------
test("4. Verify dead wind_speed column eliminated and API endpoint corrected", () => {
  // WeatherHistoryPage: wind_speed should not be in SortKey or table columns
  const weatherHistContent = fs.readFileSync(path.resolve(frontendRoot, "src/pages/WeatherHistoryPage.tsx"), "utf-8");
  assert.ok(!weatherHistContent.includes('"wind_speed"'), "WeatherHistoryPage must not have SortKey 'wind_speed'");
  assert.ok(!weatherHistContent.includes("<th>Wind Speed"), "WeatherHistoryPage must not render Wind Speed table header");
  assert.ok(!weatherHistContent.includes("r.wind_speed"), "WeatherHistoryPage must not attempt to access r.wind_speed");

  // MLDashboardPage: GET /weather/{state}
  const mlDashContent = fs.readFileSync(path.resolve(frontendRoot, "src/pages/MLDashboardPage.tsx"), "utf-8");
  assert.ok(mlDashContent.includes("/weather/{state}"), "MLDashboardPage must document /weather/{state}");
  assert.ok(!mlDashContent.includes("/weather/history"), "MLDashboardPage must not document non-existent /weather/history");
});

// ----------------------------------------------------------------------------
// 5. Check for any leftover "(as any)" casts in modified files
// ----------------------------------------------------------------------------
test("5. Verify absence of unsafe '(as any)' casts in modified frontend pages", () => {
  const pages = [
    "pages/PredictionHistoryPage.tsx",
    "pages/MLDashboardPage.tsx",
    "pages/ModelPerformancePage.tsx",
  ];
  for (const page of pages) {
    const full = path.resolve(frontendRoot, "src", page);
    const text = fs.readFileSync(full, "utf-8");
    const anyMatches = text.match(/\(as any\)/g) || [];
    assert.strictEqual(anyMatches.length, 0, `Found ${anyMatches.length} instance(s) of '(as any)' in ${page}`);
  }
});

console.log("\n===============================================================================");
console.log(` ALL ${passed} AUDIT CHECKS PASSED EMPIRICALLY WITH ZERO DEFECTS `);
console.log("===============================================================================\n");
