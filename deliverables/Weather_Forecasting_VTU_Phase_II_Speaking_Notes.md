# Weather Forecasting Using Machine Learning
## VTU Phase-II Viva Voce — Slide-by-Slide Speaking Notes

---

### SLIDE 1 — Title Slide
> "Good morning. We are presenting our final-year project titled **Weather Forecasting Using Machine Learning**, carried out under the guidance of **Dr. Manjunath Ramanna Lamani**, Professor and Head, Department of CSE."

- Introduce each team member by name and USN.
- Mention this is the Phase-II final viva voce presentation under the VTU 2022 Scheme, academic year 2026–27.

---

### SLIDE 2 — Presentation Roadmap
> "Our presentation follows this structure, covering the problem, literature, design, implementation, testing, results and conclusion."

- Quickly read out the major sections so the evaluator knows what to expect.
- Do not spend more than 30 seconds on this slide.

---

### SLIDE 3 — Problem Statement & Motivation
> "Temperature forecasts support agriculture, energy, public health and daily decisions. However, NWP models used by IMD require supercomputing and are not directly queryable by students or small organisations."

**Key points to emphasise:**
- ML weather studies usually remain as one-off notebook experiments.
- Our project bridges this gap with a **full-stack, stored, queryable, honestly evaluated** forecasting application.
- Target: daily mean temperature for **33 Indian states and UTs**, seven days ahead.

---

### SLIDE 4 — Objectives, Scope & Deliverables
> "Our primary objective is to develop an end-to-end weather forecasting application using LightGBM."

**Walk through each objective:**
1. Data collection from Open-Meteo → PostgreSQL storage
2. 20 engineered features from strictly past data (no leakage)
3. Multi-output LightGBM pipeline — 7 separate regressors for T+1 to T+7
4. Chronological evaluation with proper baselines
5. FastAPI backend + React frontend

**Scope boundaries:** State-level only; mean temperature only; no rainfall ML prediction; no live deployment claimed.

---

### SLIDE 5 — Literature Review & Research Gap
> "We surveyed NWP, statistical, and ML approaches to weather forecasting."

**Key references to highlight:**
- **Bauer et al. (2015)** — NWP revolution, but computationally expensive.
- **Grinsztajn et al. (2022)** — Tree-based models outperform deep learning on tabular data.
- **Ke et al. (2017)** — LightGBM: GOSS + EFB for efficiency.
- **Bergmeir & Benítez, Cerqueira et al.** — Proper time-series evaluation.

**Research gap:** ML forecasting models are rarely available as a fully integrated, tested, and honestly evaluated service. Our project fills this gap.

---

### SLIDE 6 — Existing System vs Proposed System
> "Let me compare the current state of practice with our proposed system."

**Existing problems:**
- NWP not accessible to small users
- ML notebooks are not deployable services
- No validation against baselines, no prediction storage

**Our solution provides:**
- Complete pipeline: data → ML → API → frontend
- Persistent storage, cached predictions, baseline comparison
- 196+61 automated tests ensuring correctness

---

### SLIDE 7 — Requirements & Use Cases
> "We identified 11 functional requirements, each mapped to an implemented module."

**Highlight:**
- FR-02 is crucial: 20 features from **strictly past data** — leakage prevention is by construction and verified by test.
- Actors: User (read-only operations), Admin (ingestion), Open-Meteo (external data).
- Key workflow: User selects state → backend fetches 7-day history → builds features → LightGBM predicts → response stored.

---

### SLIDE 8 — System Architecture
> "Our system has three layers: Data, ML Pipeline, and Application."

**Walk through the diagram:**
1. **Data Layer:** Open-Meteo API → Ingestion with validation and upsert → PostgreSQL (3 main tables)
2. **ML Pipeline:** Feature engineering (20 features) → LightGBM pipeline (7 regressors × 100 trees) → Prediction service with caching
3. **Application Layer:** FastAPI (16 REST endpoints) → React/TypeScript frontend → User dashboard with 6 modules

**Key architectural decisions:**
- Model loaded once at startup for fast inference
- Predictions are cached for one hour
- Every prediction is stored in the database

---

### SLIDE 9 — Methodology & Project Workflow
> "We followed an eight-step development workflow."

**Step through each:**
1. Data collection: Open-Meteo Archive API for 33 states
2. Preprocessing: null handling, deduplication, date ordering
3. Feature engineering: lags, rolling means/std, cyclical day-of-year, season, state
4. Model training: sklearn pipeline → ColumnTransformer → MultiOutputRegressor with 7 LGBMRegressors
5. Evaluation: chronological hold-out, MAE/RMSE/R², persistence and climatology baselines
6–8. Backend, frontend, testing

---

### SLIDE 10 — Technology Stack
> "Here is the technology stack we used."

**Be ready to justify each choice:**
- **LightGBM** — efficient GBDT, outperforms deep learning on tabular data
- **FastAPI** — async, auto-generated OpenAPI docs, Pydantic validation
- **PostgreSQL** — robust ACID-compliant database for time-series weather data
- **React + TypeScript** — type safety, component reuse, Vite for fast builds
- **Open-Meteo** — free, ERA5-derived, no API key required

---

### SLIDE 11 — Implementation & Module Demonstration
> "Let me walk through the key implementation modules."

**For each module, explain briefly:**
- **Data ingestion:** `fetch_data.py` calls Open-Meteo, validates, upserts with advisory locks
- **Feature engineering:** `feature_service.py` builds exactly 20 features with leakage guards
- **ML prediction:** `model_service.py` loads the joblib artefact, reindexes to FEATURE_ORDER
- **Backend:** 16 endpoints, Pydantic schemas, error responses in RFC 7807 format
- **Database:** 4 tables, SQLAlchemy ORM, ON CONFLICT for idempotent upserts
- **Frontend:** 6 modules visible in the screenshots

**Point to the screenshots** and explain what each one shows.

---

### SLIDE 12 — Testing & Validation
> "We ran comprehensive automated tests with these results."

| Test Suite | Passed | Failed | Total |
|---|---|---|---|
| Backend (pytest) | 196 | 1 | 197 |
| Frontend (Node.js) | 61 | 0 | 61 |
| TypeScript check | ✓ | — | — |
| Production build | ✓ | — | — |

**Be transparent about the failure:**
- The one failed test (`test_evaluate_deployed_artifact.py`) has a date-dependent assertion hardcoded to 2026-11-09.
- The **evaluator is correct**; the **test assertion is defective** — it expects a date that changes with `date.today()`.
- This was investigated and confirmed by running with the date frozen.

---

### SLIDE 13 — Results & Performance Evaluation
> "Our independently held-out evaluation shows these results."

| Metric | Model | Persistence | Climatology |
|---|---|---|---|
| MAE | **1.22 °C** | 1.44 °C | 1.55 °C |
| RMSE | **1.67 °C** | — | — |
| R² | **0.966** | — | — |

**Important clarifications:**
- Skill vs persistence: 15.3% improvement
- Skill vs climatology: 21.3% improvement
- The newer v3 model's MAE of 1.16 °C is **diagnostic only** — the fitting data overlaps the evaluation window
- Model advantage diminishes at longer horizons (T+6, T+7)
- Display fields (min, max, humidity) are **rule-based heuristics**, not ML-predicted

---

### SLIDE 14 — Individual Contribution
> "Each team member contributed to specific modules of the project."

- **Each member should describe their own contributions.**
- Be prepared to answer detailed technical questions about your assigned module.
- Mention shared responsibilities: integration testing, documentation, code review.

⚠️ **Action required:** Each team member must fill in their specific contributions before the viva.

---

### SLIDE 15 — Conclusion, Limitations & Future Scope
> "To conclude, we have developed a complete weather forecasting application."

**Conclusion highlights:**
- End-to-end system: ML + Database + Backend + Frontend
- MAE 1.22 °C on independent held-out data
- 258 automated tests (196+61+type check+build)

**Be honest about limitations:**
- State-level only (not district or city)
- Only mean temperature is ML-predicted
- v3 model lacks independent validation
- No live deployment has been verified

**Future scope:** District-level, rainfall/wind prediction, mobile app, hyperparameter tuning.

---

### SLIDE 16 — References & Acknowledgements
> "Our work builds on these key references."

- Cite 2–3 key papers if asked: Ke et al. (LightGBM), Grinsztajn et al. (tree-based models), Bauer et al. (NWP).
- Acknowledge the guide, department and institution.

---

### SLIDE 17 — Thank You
> "Thank you for your time and attention. We are happy to answer any questions."

- Be prepared for questions on:
  - Feature engineering details (what are the 20 features?)
  - Why LightGBM over LSTM/deep learning?
  - How is data leakage prevented?
  - Why is the v3 evaluation not independent?
  - What does R² = 0.966 mean practically?
  - How does the system handle missing data or a new state?

---

## Quick Reference — The 20 Features

| # | Feature | Description |
|---|---|---|
| 1 | lag1_temp_avg | Yesterday's mean temperature |
| 2 | lag2_temp_avg | Day-before-yesterday mean temperature |
| 3 | lag3_temp_avg | 3 days ago mean temperature |
| 4–6 | lag1/2/3_temp_min | Lagged minimum temperatures |
| 7–9 | lag1/2/3_temp_max | Lagged maximum temperatures |
| 10 | roll3_temp_avg_mean | 3-day rolling mean of Temp_Avg |
| 11 | roll3_temp_avg_std | 3-day rolling std of Temp_Avg |
| 12 | roll7_temp_avg_mean | 7-day rolling mean of Temp_Avg |
| 13 | roll7_temp_avg_std | 7-day rolling std of Temp_Avg |
| 14 | lag1_humidity | Yesterday's humidity |
| 15 | lag1_rainfall | Yesterday's rainfall |
| 16 | day_of_year_sin | Cyclical encoding (sine) |
| 17 | day_of_year_cos | Cyclical encoding (cosine) |
| 18 | temp_range_1d | Yesterday's daily temperature range |
| 19 | Season | Categorical: Winter/Summer/Monsoon/Post-Monsoon |
| 20 | State | Categorical: 33 Indian states and UTs |

---

## Potential Viva Questions & Answers

**Q: Why LightGBM and not deep learning (LSTM)?**
> LightGBM is proven to outperform deep learning on tabular data (Grinsztajn et al., 2022). Our data is tabular with engineered features, not raw sequences. LightGBM also trains much faster and requires less data.

**Q: How do you prevent data leakage?**
> By construction: all features use shifts of at least one day, rolling windows end at t−1, the origin day's observation is excluded, and the query filters enforce `date < D−1` and `date < today`. This is verified by a test that overwrites future values with 9999 and confirms all 20 features are unchanged.

**Q: Why is the v3 model's evaluation diagnostic only?**
> The v3 model was fitted on data that extends into the evaluation window. For a score to be independent, the model must never have seen the evaluation period during training. The earlier artefact's scores (MAE 1.22 °C) were produced on a truly held-out period.

**Q: What happens if a state has fewer than 7 days of history?**
> The backend returns HTTP 422 with a clear error message. No forecast is generated and no value is fabricated.

---

*Document prepared for: Weather Forecasting Using Machine Learning — VTU Phase-II Viva Voce, 2026–27*
