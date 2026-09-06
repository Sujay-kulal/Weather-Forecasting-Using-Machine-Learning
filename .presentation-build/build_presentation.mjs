import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "D:/Weather Forecasting Using Machine Learning";
const SKILL_DIR = "C:/Users/SUJAY/.codex/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations";
const TMP_DIR = path.join(workspaceDir, ".presentation-build");
const FINAL_PPTX = path.join(workspaceDir, "deliverables", "Weather_Forecasting_Using_ML_Final_Project_Presentation_v2.pptx");
const RUNTIME_PYTHON = "C:/Users/SUJAY/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href);

await fs.mkdir(TMP_DIR, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const FONT = "Arial";
const C = {
  navy: "#0B2545", blue: "#0077B6", teal: "#00A6A6", sky: "#EAF6FC",
  pale: "#F6FAFD", ink: "#17324D", muted: "#567089", line: "#C9DDEB",
  white: "#FFFFFF", green: "#16794B", amber: "#A66400", red: "#B42318", gray: "#EEF3F7"
};
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function box(slide, text, x, y, w, h, opts = {}) {
  const s = slide.shapes.add({
    geometry: opts.geometry ?? "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: opts.fill ?? "none",
    line: opts.line ?? { fill: "none", width: 0 },
    borderRadius: opts.radius,
  });
  s.text = text;
  s.text.style = {
    typeface: FONT,
    fontSize: opts.size ?? 18,
    color: opts.color ?? C.ink,
    bold: opts.bold ?? false,
    autoFit: "shrinkText",
    verticalAlignment: opts.verticalAlignment ?? "middle",
    paragraphAlignment: opts.align ?? "left",
    marginLeft: opts.margin ?? 0,
    marginRight: opts.margin ?? 0,
    marginTop: opts.margin ?? 0,
    marginBottom: opts.margin ?? 0,
  };
  return s;
}

function addTitle(slide, title, subtitle = "") {
  box(slide, title, 64, 42, 1080, 50, { size: 34, bold: true, color: C.navy });
  slide.shapes.add({ geometry: "rect", position: { left: 64, top: 103, width: 105, height: 6 }, fill: C.blue, line: { fill: "none", width: 0 } });
  if (subtitle) box(slide, subtitle, 64, 118, 1120, 32, { size: 15, color: C.muted });
}

function addFooter(slide, n) {
  slide.shapes.add({ geometry: "line", position: { left: 64, top: 678, width: 1152, height: 0 }, line: { fill: C.line, width: 1 } });
  box(slide, "Weather Forecasting Using Machine Learning", 64, 687, 520, 20, { size: 11, color: C.muted });
  box(slide, String(n).padStart(2, "0"), 1158, 685, 58, 22, { size: 12, color: C.blue, bold: true, align: "right" });
}

function slide(title, subtitle = "") {
  const s = presentation.slides.add();
  s.background.fill = C.pale;
  addTitle(s, title, subtitle);
  return s;
}

function addNote(slide, note) {
  slide.speakerNotes.textFrame.setText(note);
}

function chip(slide, text, x, y, w, color = C.sky, textColor = C.blue) {
  return box(slide, text, x, y, w, 32, { geometry: "roundRect", fill: color, line: { fill: color, width: 1 }, radius: "rounded-full", size: 14, bold: true, color: textColor, align: "center", margin: 8 });
}

function status(slide, label, x, y, kind) {
  const map = { PASS: ["PASS", "#E8F5EE", C.green], FAIL: ["FAIL", "#FCEAE9", C.red], WARNING: ["WARNING", "#FFF4DF", C.amber] };
  const [txt, fill, color] = map[kind];
  box(slide, txt, x, y, 94, 26, { geometry: "roundRect", fill, line: { fill, width: 1 }, radius: "rounded-full", size: 12, bold: true, color, align: "center" });
}

function addTable(slide, values, x, y, w, h, widths, fontSize = 15) {
  const table = slide.tables.add({ rows: values.length, columns: values[0].length, left: x, top: y, width: w, height: h, values, columnWidths: widths });
  table.styleOptions = { headerRow: true, bandedRows: true };
  table.borders.assign({ style: "solid", fill: C.line, width: 1 });
  for (let c = 0; c < values[0].length; c++) {
    const cell = table.getCell(0, c);
    cell.fill = C.navy;
    cell.text.style = { typeface: FONT, fontSize, bold: true, color: C.white, autoFit: "shrinkText" };
  }
  for (let r = 1; r < values.length; r++) {
    for (let c = 0; c < values[0].length; c++) {
      const cell = table.getCell(r, c);
      cell.fill = r % 2 ? C.white : C.sky;
      cell.text.style = { typeface: FONT, fontSize, color: C.ink, autoFit: "shrinkText" };
    }
  }
  return table;
}

function pipelineNode(slide, text, x, y, w, h, fill = C.white, color = C.navy) {
  return box(slide, text, x, y, w, h, { geometry: "roundRect", fill, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 15, bold: true, color, align: "center", margin: 8 });
}

function arrow(slide, x1, y1, x2, y2) {
  const line = slide.shapes.add({ geometry: "line", position: { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }, line: { fill: C.blue, width: 2 } });
  const dx = x2 - x1, dy = y2 - y1;
  let geometry, left, top, width, height;
  if (Math.abs(dx) >= Math.abs(dy)) {
    geometry = dx >= 0 ? "rightArrow" : "leftArrow";
    left = dx >= 0 ? x2 - 13 : x2 - 1;
    top = y2 - 7; width = 15; height = 14;
  } else {
    geometry = dy >= 0 ? "downArrow" : "upArrow";
    left = x2 - 7; top = dy >= 0 ? y2 - 13 : y2 - 1; width = 14; height = 15;
  }
  slide.shapes.add({ geometry, position: { left, top, width, height }, fill: C.blue, line: { fill: C.blue, width: 1 } });
  return line;
}

// 1
{
  const s = presentation.slides.add(); s.background.fill = C.navy;
  box(s, "Weather Forecasting\nUsing Machine Learning", 72, 92, 780, 130, { size: 46, bold: true, color: C.white, verticalAlignment: "top" });
  box(s, "Final-Year College Project Presentation", 76, 240, 480, 36, { size: 20, color: "#B9DBEE" });
  s.shapes.add({ geometry: "rect", position: { left: 76, top: 296, width: 110, height: 7 }, fill: C.teal, line: { fill: "none", width: 0 } });
  box(s, "Student Name: [Name]\nUSN: [USN]\nDepartment: [Department]\nCollege: [College]\nGuide: [Guide]\nAcademic Year: [Year]", 78, 365, 600, 215, { size: 19, color: C.white, verticalAlignment: "top" });
  box(s, "Next-day average temperature forecasting\nfor Indian states", 860, 125, 300, 120, { geometry: "roundRect", fill: "#153B62", line: { fill: "#2A577E", width: 1 }, radius: "rounded-xl", size: 19, bold: true, color: "#D9F2FF", align: "center", margin: 14 });
  box(s, "Repository-verified presentation", 860, 290, 300, 32, { size: 14, color: "#B9DBEE", align: "center" });
  addNote(s, "Good morning. This project is called Weather Forecasting Using Machine Learning. It forecasts the next-day average temperature for Indian states. I will explain the dataset, model, full-stack implementation, results, and the parts that still need deployment verification. Source: repository project files and verification report.");
}

// 2
{
  const s = slide("Introduction", "A local full-stack application for next-day average-temperature forecasting");
  box(s, "Weather forecasting estimates future atmospheric conditions from observations collected over time.", 80, 185, 500, 112, { size: 23, color: C.navy, bold: true, verticalAlignment: "top" });
  box(s, "Machine learning learns relationships between historical weather patterns and the next day's average temperature.", 80, 323, 500, 96, { size: 19, color: C.ink, verticalAlignment: "top" });
  box(s, "The application provides", 680, 178, 370, 34, { size: 22, bold: true, color: C.blue });
  ["State and date forecast request", "Historical weather visualisation", "Model metrics and input features", "Stored prediction history"].forEach((t, i) => {
    box(s, t, 680, 236 + i * 72, 420, 48, { geometry: "roundRect", fill: i % 2 ? C.white : C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 17, color: C.ink, margin: 14 });
  });
  addFooter(s, 2);
  addNote(s, "Weather forecasting estimates future atmospheric conditions using earlier observations. In this project, machine learning learns temperature patterns from historical state-level weather data. The application lets a user choose a state and date, then returns a next-day average temperature forecast with supporting weather context. Source: frontend README, ForecastPage.tsx, train_model.py.");
}

// 3
{
  const s = slide("Problem Statement", "Repository-defined problem scope");
  box(s, "How can stored state-level weather observations be converted into a validated next-day average-temperature forecast that a user can request through a web application?", 90, 190, 1010, 105, { size: 29, bold: true, color: C.navy, align: "center", verticalAlignment: "middle" });
  const items = [
    ["Training-serving consistency", "The API must construct the same 13 features used by the saved model."],
    ["No future-data leakage", "Prediction features must use only historical records before the forecast as-of date."],
    ["Usable application workflow", "Users need forecast, history, model-information and prediction-history views."],
    ["Auditable outputs", "Each successful forecast is stored in the predictions table."],
  ];
  items.forEach((it, i) => {
    const x = 90 + (i % 2) * 540, y = 355 + Math.floor(i / 2) * 122;
    box(s, it[0], x, y, 480, 30, { size: 18, bold: true, color: C.blue });
    box(s, it[1], x, y + 38, 470, 56, { size: 16, color: C.ink, verticalAlignment: "top" });
  });
  addFooter(s, 3);
  addNote(s, "The repository addresses the need to turn stored state-level weather observations into a next-day average-temperature forecast that users can request through a web application. The project keeps training and serving features consistent, prevents future-data leakage, exposes the workflow in the UI and retains generated forecasts. Source: backend README, feature_service.py and prediction.py.");
}

// 4
{
  const s = slide("Objectives", "Objectives derived from the implemented code");
  const objs = [
    "Train and compare regression models for next-day Temp_Avg.",
    "Select and save the trained candidate with the lowest test RMSE.",
    "Build leakage-aware lag, rolling, seasonal and state features.",
    "Serve validated predictions through FastAPI.",
    "Store weather data and prediction audit records in PostgreSQL.",
    "Provide React pages for forecasts, weather history, model performance and predictions.",
  ];
  objs.forEach((t, i) => {
    const y = 175 + i * 72;
    box(s, String(i + 1).padStart(2, "0"), 92, y, 54, 44, { geometry: "roundRect", fill: C.blue, line: { fill: C.blue, width: 1 }, radius: "rounded-full", size: 17, bold: true, color: C.white, align: "center" });
    box(s, t, 170, y - 2, 890, 52, { size: 20, color: C.ink, verticalAlignment: "middle" });
  });
  addFooter(s, 4);
  addNote(s, "The implemented objectives are to train and compare regression models, select a model by test RMSE, serve predictions with FastAPI, use PostgreSQL for weather data and audit records, and provide a React interface for forecasts, weather history, model performance and prediction history. Source: train_model.py, backend application files and frontend App.tsx.");
}

// 5
{
  const s = slide("Existing System vs Proposed System", "The repository does not document a separate legacy product; this compares a manual historical-data workflow with the implemented system");
  addTable(s, [
    ["Aspect", "Manual / disconnected workflow", "Implemented proposed system"],
    ["Forecast creation", "Manual interpretation of historical data", "Saved ML pipeline predicts next-day Temp_Avg"],
    ["Feature preparation", "User would need to derive inputs", "Backend builds 13 training-compatible features"],
    ["Data access", "Separate source records", "FastAPI retrieves PostgreSQL weather history"],
    ["Validation", "No documented request validation", "State, date, history and staleness validation"],
    ["Traceability", "No documented audit record", "Predictions stored with forecast date and timestamp"],
    ["User interface", "No documented application view", "Four React tabs for request, history, model and audit"],
  ], 68, 175, 1144, 410, [245, 395, 504], 15);
  box(s, "Comparison is limited to behaviours evidenced by the repository. It does not claim a named previous product.", 72, 614, 1120, 32, { size: 14, color: C.muted, align: "center" });
  addFooter(s, 5);
  addNote(s, "The repository does not describe a separate legacy product, so this comparison describes a manual historical-data workflow versus the implemented system. The proposed system centralises data access, constructs model inputs automatically, validates requests and stores output records. Source: backend README, routes and frontend README.");
}

// 6
{
  const s = slide("System Architecture", "Verified request and prediction path");
  const nodes = [
    ["User", 80, 225, 135, 60, C.white], ["React + Vite\nFrontend", 270, 225, 175, 60, C.sky],
    ["FastAPI\nBackend", 500, 225, 150, 60, C.sky], ["PostgreSQL\nweather_data", 705, 225, 180, 60, C.white],
    ["Feature\nService", 940, 225, 155, 60, C.sky],
    ["Saved scikit-learn\nGradient Boosting pipeline", 805, 380, 270, 66, C.white],
    ["PostgreSQL\npredictions", 495, 380, 180, 66, C.white], ["JSON response\nto frontend", 220, 380, 180, 66, C.sky],
  ];
  const nodeShapes = nodes.map(n => pipelineNode(s, n[0], n[1], n[2], n[3], n[4], n[5]));
  for (let i = 0; i < 4; i++) arrow(s, nodes[i][1] + nodes[i][3], 255, nodes[i + 1][1], 255);
  arrow(s, 1018, 285, 947, 380); arrow(s, 805, 413, 675, 413); arrow(s, 495, 413, 400, 413); arrow(s, 220, 413, 150, 285);
  box(s, "POST /predict reads seven records before D−1, creates the exact feature row, predicts and writes an audit record.", 154, 520, 960, 42, { size: 17, color: C.muted, align: "center" });
  addFooter(s, 6);
  addNote(s, "The user works through the React and Vite interface. FastAPI validates the request and reads weather history from PostgreSQL. The feature service creates the exact 13 inputs used in training. The saved Gradient Boosting pipeline predicts the temperature, FastAPI stores the audit record, and then returns the response to the interface. Source: backend README, main.py, prediction.py and feature_service.py.");
}

// 7
{
  const s = slide("Technologies Used", "Only technologies found in repository source or configuration");
  const rows = [
    ["Frontend", "React 18, TypeScript, Vite, Recharts"],
    ["Backend", "Python, FastAPI, Uvicorn, SQLAlchemy, psycopg, Pydantic"],
    ["Database", "PostgreSQL"],
    ["Machine Learning", "pandas, NumPy, scikit-learn, joblib"],
    ["Data / API", "Local archive_c CSV; optional Open-Meteo Archive update script"],
    ["Deployment", "Local configuration only. No cloud deployment service verified."],
  ];
  rows.forEach((r, i) => {
    const y = 164 + i * 74;
    box(s, r[0], 85, y, 250, 48, { geometry: "roundRect", fill: C.navy, line: { fill: C.navy, width: 1 }, radius: "rounded-lg", size: 18, bold: true, color: C.white, align: "center", margin: 10 });
    box(s, r[1], 365, y, 740, 48, { geometry: "roundRect", fill: i % 2 ? C.white : C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 18, color: C.ink, margin: 13 });
  });
  addFooter(s, 7);
  addNote(s, "The frontend uses React, TypeScript, Vite and Recharts. The backend uses Python, FastAPI, Uvicorn, SQLAlchemy and psycopg. PostgreSQL stores application data. Pandas, NumPy, scikit-learn and joblib support the model pipeline. Open-Meteo Archive appears only in the optional manual data-update script. No cloud deployment technology is verified. Source: package.json, requirements.txt and update_weather.py.");
}

// 8
{
  const s = slide("Dataset", "Model source: data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv");
  addTable(s, [
    ["Item", "Verified value"],
    ["Dataset documentation", "Weather-Driven Indian Power Demand Dataset; archive_c README credits Vaibhav Porwal, CC BY 4.0"],
    ["Source rows / states", "31,177 rows across 34 state labels"],
    ["Date range", "2023-04-01 to 2025-10-06"],
    ["Model variables selected", "Date, State, Temp_Max, Temp_Min, Temp_Avg, Humidity, Rainfall, Month, Season"],
    ["Missing values", "0 in all required modelling columns"],
    ["Duplicate checks", "0 duplicate State-Date pairs; 0 exact duplicate rows"],
    ["Preprocessing", "Parse date; select weather fields; drop missing values; sort by state and date. Importer also coerces types and removes duplicate state-date rows."],
  ], 65, 162, 1150, 412, [270, 880], 14);
  box(s, "Power-demand columns exist in the source but are intentionally excluded from the ML pipeline.", 80, 606, 1120, 30, { size: 15, color: C.blue, bold: true, align: "center" });
  addFooter(s, 8);
  addNote(s, "The training CSV has 31,177 rows across 34 state labels from 1 April 2023 to 6 October 2025. The model selects weather fields, not the power-demand fields also present in the source. Our checks found no nulls in the required modelling fields and no duplicate state-date pair. Source: direct CSV inspection, train_model.py, import_data.py and archive_c README.");
}

// 9
{
  const s = slide("Machine Learning Model", "Saved model and test metrics from repository metadata");
  box(s, "Gradient Boosting Regressor", 80, 165, 455, 65, { geometry: "roundRect", fill: C.navy, line: { fill: C.navy, width: 1 }, radius: "rounded-xl", size: 27, bold: true, color: C.white, align: "center" });
  box(s, "Target: next-day Temp_Avg (deg C)", 80, 248, 455, 45, { size: 20, bold: true, color: C.blue, align: "center" });
  const metrics = [["MAE", "0.8760 °C"], ["RMSE", "1.1854 °C"], ["R²", "0.9694"]];
  metrics.forEach((m, i) => { const x = 80 + i * 160; box(s, m[0], x, 330, 145, 34, { size: 15, color: C.muted, bold: true, align: "center" }); box(s, m[1], x, 368, 145, 48, { size: 21, color: C.navy, bold: true, align: "center" }); });
  box(s, "Training process", 650, 165, 400, 30, { size: 22, bold: true, color: C.blue });
  ["Chronological 80% / 20% train-test split", "Common preprocessing for all candidates", "Model selected by lowest test RMSE", "Saved pipeline: model/weather_model.joblib", "Metadata: model/model_info.json"].forEach((t, i) => box(s, t, 675, 218 + i * 56, 410, 38, { size: 17, color: C.ink }));
  box(s, "Candidates: Linear Regression, Decision Tree, Random Forest, Gradient Boosting, and naive persistence reference", 80, 490, 1000, 44, { geometry: "roundRect", fill: C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 16, color: C.ink, align: "center", margin: 10 });
  addFooter(s, 9);
  addNote(s, "The selected model is scikit-learn Gradient Boosting. It predicts next-day Temp_Avg in degrees Celsius. Four regression models and a naive persistence reference were evaluated. The saved Gradient Boosting model had test MAE 0.8760, RMSE 1.1854 and R-squared 0.9694. Model choice used the lowest RMSE. Source: train_model.py, model_info.json and model_comparison.csv.");
}

// 10
{
  const s = slide("Feature Engineering", "Actual 13-feature prediction pipeline");
  const xs = [75, 312, 549, 786, 1023];
  const labels = ["Raw weather\nhistory", "Preprocessing", "Feature\nengineering", "Model input", "ML prediction"];
  const details = ["PostgreSQL records\nfrom D−2 to D−8", "State-date ordering\nPast-only records", "Lags, rolling means,\nmonth, season, state", "13 columns in exact\ntraining order", "Gradient Boosting\nnext-day Temp_Avg"];
  for (let i = 0; i < 5; i++) { pipelineNode(s, labels[i], xs[i], 205, 170, 64, i === 4 ? C.navy : C.white, i === 4 ? C.white : C.navy); box(s, details[i], xs[i], 294, 170, 66, { size: 15, color: C.muted, align: "center" }); if (i < 4) arrow(s, xs[i] + 170, 237, xs[i + 1], 237); }
  box(s, "Exact numeric inputs", 90, 430, 220, 30, { size: 17, bold: true, color: C.blue });
  box(s, "lag1_temp_avg, lag2_temp_avg, lag3_temp_avg, lag1_temp_max, lag1_temp_min, lag1_humidity, lag1_rainfall, roll3_temp_avg, roll7_temp_avg, month_sin, month_cos", 90, 470, 1070, 54, { size: 15, color: C.ink, align: "center" });
  box(s, "Categorical inputs: Season and State. Numeric values are standardised; categories are one-hot encoded within the saved pipeline.", 90, 550, 1070, 36, { geometry: "roundRect", fill: C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 16, color: C.ink, align: "center", margin: 8 });
  addFooter(s, 10);
  addNote(s, "The backend reconstructs the same input row used at training time. It includes one to three day temperature lags, previous-day maximum, minimum, humidity and rainfall, three and seven record averages, cyclic month values, season and state. For date D it uses past records before D minus 1, so the target day's actual weather cannot leak into the forecast. Source: train_model.py and feature_service.py.");
}

// 11
{
  const s = slide("Backend and API", "FastAPI implementation, request validation and responses");
  addTable(s, [
    ["Method", "Endpoint", "Purpose"],
    ["GET", "/health", "Application, PostgreSQL and model status"],
    ["GET", "/states", "Distinct states available in database"],
    ["GET", "/weather/{state}?limit=&offset=", "Paginated weather history"],
    ["GET", "/weather/{state}/recent?days=", "Recent records for chart context"],
    ["POST", "/predict", "Validate, build features, predict and store audit record"],
    ["GET", "/predictions?limit=&offset=", "Stored prediction history"],
    ["GET", "/model-info", "Saved model metadata and metrics"],
  ], 63, 163, 1150, 330, [110, 375, 665], 14);
  box(s, "POST /predict flow", 80, 532, 210, 28, { size: 18, bold: true, color: C.blue });
  box(s, "Pydantic request validation  →  state lookup  →  seven past records  →  staleness check  →  feature builder  →  joblib pipeline  →  predictions table  →  JSON", 80, 574, 1110, 44, { geometry: "roundRect", fill: C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 15, color: C.ink, align: "center", margin: 8 });
  addFooter(s, 11);
  addNote(s, "FastAPI provides seven endpoints. The key endpoint is POST slash predict. It accepts state and date, validates state availability and seven historical records, checks that history is recent, builds features, calls the saved pipeline, saves the outcome to PostgreSQL and returns JSON. It returns 404 for unknown state and 422 for insufficient or stale history. Source: schemas.py, health.py, weather.py and prediction.py.");
}

// 12
{
  const s = slide("Frontend", "React single-page application with four tabbed pages");
  const pages = [
    ["Forecast", "State and date form\nPrediction result\n30-day context chart"],
    ["Weather History", "State selector\nTemperature chart and table\nLoad older data"],
    ["Model Performance", "Selected model and periods\nCandidate metrics\nGrouped feature list"],
    ["Prediction History", "Stored forecast table\nPage size and state filter\nLoad more"],
  ];
  pages.forEach((p, i) => { const x = 82 + (i % 2) * 565, y = 175 + Math.floor(i / 2) * 190; box(s, p[0], x, y, 475, 45, { geometry: "roundRect", fill: i % 2 ? C.blue : C.navy, line: { fill: i % 2 ? C.blue : C.navy, width: 1 }, radius: "rounded-lg", size: 21, bold: true, color: C.white, align: "center" }); box(s, p[1], x + 26, y + 67, 420, 80, { size: 18, color: C.ink, align: "center" }); });
  box(s, "Shared behaviour: typed central API service, loading and error views, and a /health indicator that polls every 30 seconds.", 100, 580, 1080, 36, { geometry: "roundRect", fill: C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 16, color: C.ink, align: "center", margin: 8 });
  box(s, "No screenshot included: the configured backend was unavailable during verification, so a live UI state could not be captured without fabricating content.", 95, 630, 1090, 22, { size: 13, color: C.muted, align: "center" });
  addFooter(s, 12);
  addNote(s, "The frontend has four pages. Forecast creates a prediction and shows a recent history chart. Weather History displays state records with paging. Model Performance exposes the metadata and model comparison. Prediction History lists stored predictions with paging and a client-side state filter. The header checks backend health every 30 seconds. Source: App.tsx and all four frontend page components.");
}

// 13
{
  const s = slide("Database", "PostgreSQL integration through SQLAlchemy ORM");
  addTable(s, [
    ["Table", "Columns / purpose", "Data integrity"],
    ["weather_data", "id, date, state, temp_max, temp_min, temp_avg, humidity, rainfall\nOne daily weather measurement per state", "Primary key id\nUnique (state, date)\nIndexes on state and date\nNon-null weather fields"],
    ["predictions", "id, state, forecast_date, predicted_temp_avg, created_at\nAudit record for each prediction", "Primary key id\nUnique (state, forecast_date, created_at)\nIndexes on state and forecast_date\nServer timestamp"],
  ], 65, 180, 1150, 255, [210, 535, 405], 15);
  box(s, "Data flow", 78, 488, 130, 28, { size: 19, bold: true, color: C.blue });
  box(s, "weather_data supplies historical input  →  POST /predict creates model input  →  predictions retains the returned temperature and creation time", 78, 532, 1110, 44, { geometry: "roundRect", fill: C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 17, color: C.ink, align: "center", margin: 8 });
  box(s, "No foreign-key relationship is declared between the two ORM models. SQLite is explicitly rejected; PostgreSQL is mandatory.", 78, 610, 1110, 28, { size: 15, color: C.muted, align: "center" });
  addFooter(s, 13);
  addNote(s, "PostgreSQL has two tables. Weather_data stores one daily weather record for a state and uses a unique state-date constraint. Predictions stores each generated forecast with its creation time. The project does not declare a foreign key between these tables, but weather_data supplies the forecasting inputs and predictions is the output audit trail. Source: models.py, database.py and import_data.py.");
}

// 14
{
  const s = slide("Testing and Results", "Results from current repository inspection and executed checks");
  const tests = [
    ["Saved model load and metadata", "PASS", "Gradient Boosting pipeline loaded; 13 features"],
    ["Dataset NULL and duplicate checks", "PASS", "0 nulls in required fields; 0 duplicate state-date pairs"],
    ["Date range validation", "PASS", "Parsed range: 2023-04-01 to 2025-10-06"],
    ["Frontend build and TypeScript", "PASS", "tsc and Vite build completed; chunk-size warning issued"],
    ["SQLite and secret/config checks", "PASS", "SQLite rejected; no hard-coded credential assignment found outside local .env"],
    ["Current backend health / DB connection", "FAIL", "Configured PostgreSQL port 5433 was unreachable; check_connection() returned False"],
    ["Consistency test, forecast generation, live endpoints", "WARNING", "Not completed because configured database was unavailable"],
  ];
  tests.forEach((t, i) => { const y = 162 + i * 63; box(s, t[0], 82, y, 330, 38, { size: 16, bold: true, color: C.ink }); status(s, t[1], 440, y + 4, t[1]); box(s, t[2], 560, y, 630, 42, { size: 15, color: C.ink }); });
  box(s, "Stored model test metrics: MAE 0.8760 °C   RMSE 1.1854 °C   R² 0.9694", 135, 618, 1010, 34, { geometry: "roundRect", fill: C.navy, line: { fill: C.navy, width: 1 }, radius: "rounded-full", size: 16, bold: true, color: C.white, align: "center" });
  addFooter(s, 14);
  addNote(s, "The saved model, source data checks and frontend build passed. The build did show a size warning for the JavaScript chunk. The current local database URL points to an unavailable port, so database-dependent tests could not complete. I report those as fail or warning instead of claiming successful live API or forecast testing. Source: executed verification checks and model_info.json.");
}

// 15
{
  const s = slide("Deployment Architecture", "Confirmed local configuration only");
  pipelineNode(s, "GitHub remote\nrepository", 90, 195, 180, 68, C.white);
  pipelineNode(s, "React + Vite\nlocal frontend\nport 5173", 365, 195, 195, 78, C.sky);
  pipelineNode(s, "FastAPI + Uvicorn\nlocal backend\nport 8000", 655, 195, 205, 78, C.sky);
  pipelineNode(s, "PostgreSQL\nvia DATABASE_URL", 955, 195, 190, 78, C.white);
  arrow(s, 270, 230, 365, 230); arrow(s, 560, 234, 655, 234); arrow(s, 860, 234, 955, 234);
  box(s, "Environment variables", 90, 360, 250, 30, { size: 19, bold: true, color: C.blue });
  box(s, "VITE_API_BASE_URL controls the frontend API base URL. DATABASE_URL supplies PostgreSQL. CORS_ORIGINS controls allowed frontend origins.", 90, 403, 1030, 44, { geometry: "roundRect", fill: C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 17, color: C.ink, align: "center", margin: 8 });
  box(s, "Not verified in repository", 90, 500, 250, 30, { size: 19, bold: true, color: C.amber });
  box(s, "No Vercel, Render, Neon, Docker, GitHub Actions or production deployment manifest found. Do not claim a cloud deployment topology.", 90, 543, 1030, 44, { geometry: "roundRect", fill: "#FFF4DF", line: { fill: "#F6D49B", width: 1 }, radius: "rounded-lg", size: 17, color: C.ink, align: "center", margin: 8 });
  addFooter(s, 15);
  addNote(s, "The repository confirms local development settings only: Vite on port 5173, FastAPI on port 8000 and PostgreSQL through a connection string. CORS uses an environment-controlled allow-list. No deployment manifest or configuration confirms Vercel, Render, Neon or another production provider, so those services are intentionally not shown as implemented. Source: vite.config.ts, .env.example files, backend README and repository file search.");
}

// 16
{
  const s = slide("Conclusion and Future Scope", "Implemented functionality versus explicitly future work");
  box(s, "Conclusion", 85, 165, 465, 35, { size: 24, bold: true, color: C.blue });
  box(s, "The repository implements a local full-stack workflow for next-day average-temperature forecasting across 34 state labels. It includes model training and comparison, leakage-aware feature engineering, FastAPI validation, PostgreSQL models and a four-page React interface.", 85, 218, 465, 180, { size: 20, color: C.ink, verticalAlignment: "top" });
  box(s, "Future scope", 690, 165, 465, 35, { size: 24, bold: true, color: C.teal });
  ["Compare additional forecasting models", "Add justified weather parameters", "Extend supported locations and forecast horizon", "Automate reliable data updates", "Configure and verify production deployment"].forEach((t, i) => box(s, "• " + t, 700, 220 + i * 57, 430, 34, { size: 18, color: C.ink }));
  box(s, "Future items are proposed improvements. They are not claimed as current repository functionality.", 125, 535, 1035, 42, { geometry: "roundRect", fill: C.sky, line: { fill: C.line, width: 1 }, radius: "rounded-lg", size: 17, bold: true, color: C.navy, align: "center", margin: 8 });
  box(s, "Thank you", 480, 610, 320, 34, { size: 25, bold: true, color: C.navy, align: "center" });
  addFooter(s, 16);
  addNote(s, "The project implements a complete local full-stack workflow for next-day average-temperature forecasting across 34 state labels. It includes model training, leakage-aware feature building, API validation, storage and UI views. Future work can compare additional models, add supported weather features, extend coverage and automate reliable data updates after a production deployment is configured. Source: verified repository implementation and verification report.");
}

const candidatePath = path.join(TMP_DIR, "weather_forecasting_candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const requirements = {
  explicitTotalSlideCount: 16,
  requiredNativeTableOwnerSlides: [5, 8, 11, 13],
  requiredNativeChartOwnerSlides: [],
};
const result = await finalizePresentation({
  ...requirements,
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit", "--require-native-table-slide", "5", "--require-native-table-slide", "8", "--require-native-table-slide", "11", "--require-native-table-slide", "13"],
  requiredNativeTableOwnerSlides: requirements.requiredNativeTableOwnerSlides,
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(TMP_DIR, "weather_forecasting_validation_v2.json"),
});
console.log(JSON.stringify({ finalPath: FINAL_PPTX, result }, null, 2));
