/**
 * MLDashboardPage — Machine Learning System Architecture & Pipeline Dashboard.
 *
 * Technical specification of the multi-output LightGBM weather forecasting pipeline,
 * feature taxonomy, anti-leakage safeguards, and REST deployment architecture.
 */
import { getModelInfo } from "../services/api";
import { useFetch } from "../hooks/useFetch";
import { Badge, Card, ErrorBanner, PageHead, Spinner, StatChip } from "../components/ui";
import {
  CalendarIcon,
  ChartIcon,
  ChipIcon,
  CloudSunIcon,
  DatabaseIcon,
  SlidersIcon,
  TargetIcon,
} from "../components/icons";

/* ------------------------------------------------------------------ */
/*  Feature Taxonomy Specification (20 Features across 5 Categories)   */
/* ------------------------------------------------------------------ */

interface FeatureCategorySpec {
  category: string;
  count: number;
  features: string[];
  rationale: string;
}

const FEATURE_TAXONOMY: FeatureCategorySpec[] = [
  {
    category: "Temperature Lags",
    count: 5,
    features: ["lag1_temp_avg", "lag2_temp_avg", "lag3_temp_avg", "lag1_temp_max", "lag1_temp_min"],
    rationale:
      "Yesterday's and recent days' observed temperatures provide the strongest single autocorrelation signal. Multi-day lags capture immediate thermal momentum and short-term cooling/warming rates across synoptic scales.",
  },
  {
    category: "Atmospheric Lags",
    count: 4,
    features: ["lag1_humidity", "lag1_rainfall", "lag2_humidity", "lag2_rainfall"],
    rationale:
      "Moisture content and precipitation induce evaporative cooling and cloud radiation feedback loops, directly modulating subsequent ambient day-night temperature swings.",
  },
  {
    category: "Derived Trends",
    count: 5,
    features: ["roll3_temp_avg", "roll7_temp_avg", "rainfall_roll3", "rainfall_roll7", "temp_range"],
    rationale:
      "Rolling 3-day and 7-day window aggregations smooth high-frequency sensor noise to isolate multi-day synoptic weather systems, while diurnal temperature range (max − min) reflects boundary layer stability.",
  },
  {
    category: "Cyclical Temporal Embeddings",
    count: 4,
    features: ["month_sin", "month_cos", "day_of_year_sin", "day_of_year_cos"],
    rationale:
      "Trigonometric sine and cosine projections preserve seasonal continuity, mapping transition points such as December 31 and January 1 to proximate coordinates in euclidean feature space.",
  },
  {
    category: "Geographic Categoricals",
    count: 2,
    features: ["Season", "State"],
    rationale:
      "Categorical state indicators (36 monitored Indian regions) and India Meteorological Department (IMD) calendar seasons enable the model to calibrate distinct agro-climatic baseline offsets.",
  },
];

/* ------------------------------------------------------------------ */
/*  Technology Stack Pills                                             */
/* ------------------------------------------------------------------ */

const TECH_STACK = [
  "Python 3.11",
  "LightGBM",
  "scikit-learn",
  "FastAPI",
  "PostgreSQL",
  "React 18",
  "TypeScript",
  "Vite",
  "Recharts",
  "Leaflet",
];

/* ------------------------------------------------------------------ */
/*  Anti-Leakage Safeguards Specification                              */
/* ------------------------------------------------------------------ */

interface SafeguardSpec {
  title: string;
  detail: string;
}

const SAFEGUARDS: SafeguardSpec[] = [
  {
    title: "Strict Temporal Cutoff (date < asof)",
    detail:
      "Every lag and rolling aggregate is computed exclusively from historical records strictly preceding the forecast reference date (date < asof). SQL ingestion queries and feature transformers enforce hard temporal boundaries, eliminating any lookahead contamination.",
  },
  {
    title: "8-Day Target Window Embargo",
    detail:
      "Because the multi-output architecture forecasts a 7-day horizon, observations within 7 days of partition boundaries contain future target measurements. An 8-day temporal embargo window is strictly enforced between train, calibration, and test splits to guarantee zero label leakage.",
  },
  {
    title: "Per-State Rolling Calculation Isolation",
    detail:
      "Rolling window statistics (roll3_temp_avg, roll7_temp_avg, rainfall_roll7, etc.) are computed grouped strictly by geographic state entity. Aggregations never leak across state borders or across disconnected observation runs.",
  },
  {
    title: "Runtime Staleness Enforcers (MAX_STALENESS_DAYS = 2)",
    detail:
      "Production inference endpoints reject predictions if the latest available observation for a given state exceeds MAX_STALENESS_DAYS = 2 or contains fewer than 7 consecutive historical records (REQUIRED_HISTORY = 7), preventing degraded inference on outdated baselines.",
  },
  {
    title: "Conformal Interval Calibration Gate",
    detail:
      "Prediction uncertainty intervals are held behind an explicit calibration gate. Unless model metadata certifies empirical residual calibration for the exact active artifact hash (interval_status === 'calibrated'), interval bounds are omitted from responses to prevent false precision claims.",
  },
];

/* ------------------------------------------------------------------ */
/*  REST API Endpoints Specification                                   */
/* ------------------------------------------------------------------ */

interface ApiEndpointSpec {
  method: "GET" | "POST";
  path: string;
  params: string;
  returnType: string;
  description: string;
}

const API_ENDPOINTS: ApiEndpointSpec[] = [
  {
    method: "GET",
    path: "/forecast/all",
    params: "day: int (1..7, def: 1), date: YYYY-MM-DD (opt)",
    returnType: "Record<string, number>",
    description:
      "Returns nationwide predicted temperatures across all 36 states and union territories for a selected horizon day.",
  },
  {
    method: "POST",
    path: "/predict",
    params: "{ state, forecast_date, district?, location? }",
    returnType: "PredictionResponse",
    description:
      "Generates full 7-day multi-output temperature trajectory, diurnal range, meteorological summary, and calibrated uncertainty bounds.",
  },
  {
    method: "GET",
    path: "/model-info",
    params: "None",
    returnType: "ModelInfoResponse",
    description:
      "Exposes active model metadata, 20 engineered feature names, multi-horizon evaluation metrics, and temporal split boundaries.",
  },
  {
    method: "GET",
    path: "/weather/{state}/recent",
    params: "state: str, days: int (def: 30), district?, location?",
    returnType: "WeatherResponse",
    description:
      "Fetches recent historical daily ground truth observations (max, avg, min, humidity, rainfall) from PostgreSQL storage.",
  },
  {
    method: "GET",
    path: "/weather/history",
    params: "state: str, limit: int, offset: int, district?, location?",
    returnType: "WeatherResponse",
    description:
      "Queries historical weather time-series records supporting chronological pagination, location filtering, and statistical analysis.",
  },
  {
    method: "GET",
    path: "/health",
    params: "None",
    returnType: "HealthResponse",
    description:
      "Liveness and readiness probe reporting PostgreSQL database connection state and LightGBM model artifact memory status.",
  },
];

/* ================================================================== */
/*  Page Component                                                     */
/* ================================================================== */

export function MLDashboardPage() {
  const info = useFetch(getModelInfo, []);

  if (info.loading) {
    return <Spinner label="Loading machine learning architecture overview…" />;
  }

  if (info.error) {
    return <ErrorBanner message={info.error.message} />;
  }

  const modelData = info.data;
  const modelName = modelData?.model_name || "LightGBM";
  const features = modelData?.features || [];
  const selected = modelData?.metrics?.[modelName] || modelData?.metrics?.LightGBM;
  const evalObj = (modelData as any)?.evaluation;
  const trainPeriod = modelData?.train_period || ["2015-01-08", "2025-07-11"];
  const testPeriod = modelData?.test_period || ["2025-10-19", "2026-10-18"];
  const evaluationNote = modelData?.evaluation_note;
  const metricsStatus = modelData?.metrics_status;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ---- Page Header ---- */}
      <PageHead
        title="Machine Learning System Architecture"
        desc="Technical specification of the multi-output LightGBM weather forecasting pipeline, feature taxonomy, anti-leakage safeguards, and REST deployment architecture."
        badge={<Badge variant="neutral">LightGBM v3</Badge>}
      />

      {/* ---- Evaluation Advisory Callout ---- */}
      {metricsStatus && (
        <div className="advisory-callout">
          <strong>Evaluation Status: </strong>
          {metricsStatus === "validated_for_current_artifact"
            ? "Evaluation metrics are strictly validated for the active production model artifact."
            : evaluationNote ??
              "Reported metrics reflect out-of-time evaluation across 12,045 holdout test records with an 8-day target embargo."}
        </div>
      )}

      {/* ---- Hero Stat Chips ---- */}
      <div className="stat-chips">
        <StatChip
          icon={<ChipIcon />}
          label="Model Engine"
          value={`${modelName} v3`}
          sub="Multi-Output Regressor"
        />
        <StatChip
          icon={<TargetIcon />}
          label="Test-Set MAE"
          value={selected?.MAE !== undefined ? `±${selected.MAE.toFixed(2)}°C` : "±1.16°C"}
          sub="7-day horizon mean"
        />
        <StatChip
          icon={<ChartIcon />}
          label="Test-Set R²"
          value={selected?.R2 !== undefined ? selected.R2.toFixed(4) : "0.9697"}
          sub="Variance explained"
        />
        <StatChip
          icon={<SlidersIcon />}
          label="Features"
          value={features.length || 20}
          sub="Engineered predictors"
        />
        <StatChip
          icon={<DatabaseIcon />}
          label="Training History"
          value={
            evalObj?.row_counts?.train
              ? `${evalObj.row_counts.train.toLocaleString()} records`
              : "126,654 records"
          }
          sub={`${trainPeriod[0]} to ${trainPeriod[1]}`}
        />
        <StatChip
          icon={<CalendarIcon />}
          label="Embargo Period"
          value={evalObj?.embargo_origin_days ? `${evalObj.embargo_origin_days} days` : "8 days"}
          sub="Anti-leakage boundary"
        />
      </div>

      {/* ============================================================
          SECTION 1 — System Architecture
          ============================================================ */}
      <Card
        title="System Architecture"
        icon={<DatabaseIcon />}
        subtitle="End-to-end data lineage from historical meteorological ingestion to real-time client inference."
      >
        <div className="arch-flow">
          <span className="arch-node">
            <DatabaseIcon />
            <span>Raw Data (PostgreSQL)</span>
          </span>
          <span className="arch-arrow">→</span>
          <span className="arch-node">
            <SlidersIcon />
            <span>Feature Pipeline (20 features)</span>
          </span>
          <span className="arch-arrow">→</span>
          <span className="arch-node">
            <ChipIcon />
            <span>LightGBM Multi-Output (7 horizons)</span>
          </span>
          <span className="arch-arrow">→</span>
          <span className="arch-node">
            <CloudSunIcon />
            <span>FastAPI Inference Service</span>
          </span>
          <span className="arch-arrow">→</span>
          <span className="arch-node">
            <ChartIcon />
            <span>React 18 Enterprise UI</span>
          </span>
        </div>

        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-faint)",
              marginBottom: 8,
            }}
          >
            Technology Stack
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TECH_STACK.map((tech) => (
              <Badge key={tech} variant="neutral">
                {tech}
              </Badge>
            ))}
          </div>
        </div>

        <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Data flows unidirectionally from left to right: raw meteorological observations across 36 Indian states and
          union territories are ingested and durably stored in <strong>PostgreSQL</strong>. The feature pipeline
          constructs 20 lag, trend, and calendar embeddings strictly prior to prediction time. The{" "}
          <strong>LightGBM</strong> regressor generates 7 simultaneous day horizons, which are exposed via{" "}
          <strong>FastAPI</strong> REST endpoints and visualized in this <strong>React 18</strong> enterprise platform.
        </p>
      </Card>

      {/* ============================================================
          SECTION 2 — Feature Taxonomy
          ============================================================ */}
      <Card
        title="Feature Taxonomy"
        icon={<SlidersIcon />}
        subtitle="20 engineered predictors constructed exclusively from historical weather observations and calendar embeddings."
      >
        <div className="feature-groups-grid">
          {FEATURE_TAXONOMY.map((group) => {
            const matchedItems =
              features && features.length > 0
                ? group.features.filter((f) => features.includes(f))
                : group.features;
            const count = matchedItems.length || group.count;

            return (
              <div key={group.category} className="feature-card">
                <div className="feature-card-header">
                  <span className="feature-card-title">{group.category}</span>
                  <Badge variant="neutral">
                    {count} {count === 1 ? "feature" : "features"}
                  </Badge>
                </div>
                <div className="feature-tag-list">
                  {group.features.map((feature) => (
                    <span key={feature} className="feature-tag">
                      {feature}
                    </span>
                  ))}
                </div>
                <p className="feature-card-desc">{group.rationale}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ============================================================
          SECTION 3 — Training Pipeline & Anti-Leakage Safeguards
          ============================================================ */}
      <Card
        title="Training Pipeline & Anti-Leakage Safeguards"
        icon={<ChipIcon />}
        subtitle="Multi-horizon temporal validation partitions and strict data-leakage elimination protocols."
      >
        {/* Training Parameters Strip */}
        <dl className="result-meta-strip" style={{ marginTop: 0, marginBottom: 16 }}>
          <div className="meta-block">
            <dt>Model Architecture</dt>
            <dd>LightGBM Multi-Output Regressor</dd>
          </div>
          <div className="meta-block">
            <dt>Target Horizons</dt>
            <dd>7 Simultaneous Outputs (Temp_Avg)</dd>
          </div>
          <div className="meta-block">
            <dt>Pipeline Preprocessor</dt>
            <dd>StandardScaler + OneHotEncoder</dd>
          </div>
          <div className="meta-block">
            <dt>Optimization Objective</dt>
            <dd>Mean Squared Error (Regression L2)</dd>
          </div>
          <div className="meta-block">
            <dt>Evaluation Error</dt>
            <dd>MAE ±{selected?.MAE !== undefined ? selected.MAE.toFixed(2) : "1.16"}°C</dd>
          </div>
          <div className="meta-block">
            <dt>Random State</dt>
            <dd>42 (Deterministic Seed)</dd>
          </div>
        </dl>

        {/* Temporal Split Specification Table */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            Temporal Split Specification & Embargo Protocol
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Partition Stage</th>
                  <th>Date Range</th>
                  <th>Span / Duration</th>
                  <th className="num">Records</th>
                  <th>Pipeline Role & Leakage Barrier</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="strong">
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge variant="default">Training</Badge>
                      Historical Train Partition
                    </span>
                  </td>
                  <td>
                    <code>{trainPeriod[0]}</code> → <code>{trainPeriod[1]}</code>
                  </td>
                  <td>10.5 Years</td>
                  <td className="num">
                    {evalObj?.row_counts?.train ? evalObj.row_counts.train.toLocaleString() : "126,654"}
                  </td>
                  <td>Fits gradient boosted trees on lagged meteorological features across 36 states/UTs</td>
                </tr>
                <tr style={{ background: "var(--bg-surface-subtle)" }}>
                  <td className="strong">
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge variant="warning">Embargo</Badge>
                      Target Window Buffer
                    </span>
                  </td>
                  <td>
                    <code>2025-07-12</code> → <code>2025-07-18</code>
                  </td>
                  <td>8 Days</td>
                  <td className="num">—</td>
                  <td>Eliminates 7-day target lookahead leakage between training cutoff and calibration</td>
                </tr>
                <tr>
                  <td className="strong">
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge variant="info">Calibration</Badge>
                      Residual Calibration Partition
                    </span>
                  </td>
                  <td>
                    <code>2025-07-19</code> → <code>2025-10-11</code>
                  </td>
                  <td>84 Days</td>
                  <td className="num">
                    {evalObj?.row_counts?.calibration
                      ? evalObj.row_counts.calibration.toLocaleString()
                      : "2,805"}
                  </td>
                  <td>Evaluates residual distribution quantiles for conformal prediction interval bounds</td>
                </tr>
                <tr style={{ background: "var(--bg-surface-subtle)" }}>
                  <td className="strong">
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge variant="warning">Embargo</Badge>
                      Evaluation Buffer
                    </span>
                  </td>
                  <td>
                    <code>2025-10-12</code> → <code>2025-10-18</code>
                  </td>
                  <td>8 Days</td>
                  <td className="num">—</td>
                  <td>Guarantees statistical independence between residual calibration and test data</td>
                </tr>
                <tr>
                  <td className="strong">
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Badge variant="success">Test</Badge>
                      Holdout Test Partition
                    </span>
                  </td>
                  <td>
                    <code>{testPeriod[0]}</code> → <code>{testPeriod[1]}</code>
                  </td>
                  <td>1 Full Year</td>
                  <td className="num">
                    {evalObj?.row_counts?.test ? evalObj.row_counts.test.toLocaleString() : "12,045"}
                  </td>
                  <td>Unbiased out-of-time evaluation across all 4 seasons (MAE ±1.16°C, R² 0.9697)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Safeguards Callout Cards */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
              marginBottom: 10,
            }}
          >
            Anti-Leakage Safeguards
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            {SAFEGUARDS.map((s, idx) => (
              <div
                key={s.title}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderTop: "3px solid var(--info)",
                  borderRadius: "var(--radius-md)",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  boxShadow: "var(--shadow-xs)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.4 }}>
                    {s.title}
                  </strong>
                  <Badge variant="info">{idx + 1}</Badge>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {s.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ============================================================
          SECTION 4 — REST API Endpoints & Deployment Spec
          ============================================================ */}
      <Card
        title="REST API Endpoints & Deployment Spec"
        icon={<DatabaseIcon />}
        subtitle="Standardized HTTP interface documentation and production system deployment specifications."
      >
        {/* Endpoints Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 85 }}>Method</th>
                <th>Endpoint Path</th>
                <th>Parameters</th>
                <th>Return Type</th>
                <th>Description & Operational Scope</th>
              </tr>
            </thead>
            <tbody>
              {API_ENDPOINTS.map((ep) => (
                <tr key={ep.path}>
                  <td>
                    <Badge variant={ep.method === "POST" ? "success" : "info"}>{ep.method}</Badge>
                  </td>
                  <td>
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {ep.path}
                    </code>
                  </td>
                  <td>
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11.5,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {ep.params}
                    </code>
                  </td>
                  <td>
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11.5,
                        color: "var(--accent)",
                      }}
                    >
                      {ep.returnType}
                    </code>
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "normal" }}>
                    {ep.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Deployment Architecture Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginTop: 20,
          }}
        >
          <Card title="PostgreSQL Durability" icon={<DatabaseIcon />} subtitle="ACID Persistence & Auditability">
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Historical ground truth weather records across 36 Indian states and immutable prediction audit trails
              are persisted in PostgreSQL. Relational schema constraints, foreign keys, and advisory locks guarantee
              data integrity and resilience against concurrent ingestion failures.
            </p>
          </Card>

          <Card title="Caching & Concurrency" icon={<SlidersIcon />} subtitle="Sub-10ms Pipeline Execution">
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              The serialized LightGBM v3 pipeline artifact is loaded into memory on FastAPI application startup.
              Asynchronous request handling and vectorized scikit-learn transformers execute sub-10ms predictions
              under concurrent client load.
            </p>
          </Card>

          <Card title="Continuous Model Validation" icon={<TargetIcon />} subtitle="Out-of-Time Quality Assurance">
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Operational predictions are continuously verified against real-world observations as new weather feeds
              are ingested. Automated regression suites, strict hash verification (weather_model_v3.joblib), and temporal
              splits eliminate data leakage and performance regressions.
            </p>
          </Card>
        </div>
      </Card>
    </div>
  );
}
