# Rainfall model comparison, 20 November 2026

**Decision: retain the v1 research preview.** Seven additional predictors improved RMSE on both validation folds for the regularized direct model. Its absolute errors rose, especially in the drier fold. Heavy-event weighting improved heavy-rain MAE but increased wet-season RMSE. No configuration met all selection criteria. The active model supplies seven research amounts and calibrated probabilities for days 1–6. The original amount release threshold and day-7 probability decision still apply.

## Data and lineage

The read-only PostgreSQL snapshot contains 41,777 distinct daily records across 33 state/UT labels from 1 April 2023 through 10 November 2026. No production rows were written. The ordered snapshot SHA-256 is `e1860ecd7dea80b6eeb3c740abf405cfae6daffa65817f45efa2f63a75deeaf6`. All 30,260 supported state-days shared with the cleaned weather/power CSV matched on the five weather measurements within numerical precision. Every training and development label came from that frozen PostgreSQL series.

The 1,783 missing state-days include 24 September monsoon days for each of the 33 jurisdictions. The common gaps were 31 May 2024, 30–31 December 2024 and 7 September–27 October 2026. Chhattisgarh also lacked 4 December 2023. Windows requiring absent inputs or labels were omitted. There were 16,565 zero amounts. Positive rainfall had a median of 3.55 mm, 95th percentile of 30.8 mm and maximum of 334.4 mm. The longest consecutive dry/trace spell was 128 days in Jharkhand. Monsoon observations were 88.75% wet versus 21.10% in winter. The first fold had 1,016 heavy training state-days and the second had 1,076.

The table lacks row-level station, provider, geographic footprint and observation-availability timestamps. Jammu and Kashmir had 83 minima below −30 °C, reaching −42.7 °C. The repo's archive loader samples one coordinate per state; elevation is especially relevant here. The measurements passed the physical range checks. Their statewide representativeness could not be established, so they were retained and flagged.

An ERA5 probe returned all five fields for two coordinates in January 2015. Comparing July 2024 ERA5 and stored measurements on 31 dates produced mean absolute precipitation differences of 5.21 mm in Karnataka and 0.68 mm in Jammu and Kashmir, with minimum-temperature differences of 1.69 °C and 8.97 °C. The archive's `precipitation_sum` includes snowfall water equivalent. These records have a different spatial support from the mixed historical series. They were used for source comparison only. There was no target interpolation, deduplication by averaging or expansion of training history. Archive data are attributed to Open-Meteo and its upstream reanalysis providers. [Open-Meteo historical archive documentation](https://open-meteo.com/en/docs/historical-weather-api)

## Locked development experiment

Each fold builds training, calibration and validation panels separately. All seven inputs dates and seven target dates must fall inside the corresponding partition. A forecast starting on D has origin D−1, observations D−8 through D−2 and labels D through D+6. Training and inference share the state ordering, dated history checks and feature function. The validation folds cover different seasons. Only the late fold can compare directly against the shipped v1 weights. For the early fold, the same v1 recipe was fitted using only then-available training data. The late-fold refit reproduced the shipped model's validation amounts and probabilities.

| Fold | Training observations | Calibration observations | Validation observations | Fitting / calibration / validation state-origins |
|---|---|---|---|---:|
| Early | Apr 2023 – Sep 2024 | Oct – Dec 2024 | Jan – Apr 2025 | 17,179 / 2,508 / 3,498 |
| Late | Apr 2023 – Dec 2024 | Jan – Apr 2025 | May – Oct 2025 | 20,149 / 3,498 / 5,610 |

The 15 original inputs were the control. The ablation added lag-5 rainfall, seven-day rainfall standard deviation, seven-day heavy count, consecutive wet days capped at seven, three-observation humidity and temperature changes (lag 1 minus lag 3), and lag-1 minimum temperature. All use the existing seven observed days. A 14-day feature was deferred because the serving route guarantees seven days and the recent archive already has gaps.

The control used Tweedie power 1.5, 140 trees, 23 leaves, 60 minimum child samples and learning rate 0.04. The regularized configuration used power 1.3, 180 trees, 12 leaves, maximum depth 6, 100 minimum child samples, L2 regularization of 3 and learning rate 0.035. Other comparisons used a weight of 1.5 at ≥25 mm and a two-stage binary/Gamma model. The two-stage expected amount includes the training dry/trace mean. Each occurrence model was compared with isotonic and Platt calibration on its own calibration period. Class decisions used probability ≥0.5. The measurable-rain target stayed strictly above 0.1 mm.

Before the first scoring run, the selection rule required lower RMSE than v1 in both folds, with at most 1% higher MAE and 2% higher heavy MAE in either fold. Eligible configurations were ranked by mean fold RMSE. Direct-model calibration ties used mean Brier. These development criteria are separate from the existing 1% independent RMSE release requirement. Ten amount/calibration combinations were evaluated without tuning on the inspected v1 test window.

| Forecast | Early MAE / RMSE | Late MAE / RMSE | Early / late heavy MAE |
|---|---:|---:|---:|
| Zero | 1.774 / 6.406 | 8.160 / 14.854 | 41.743 / 40.369 |
| Persistence | 2.257 / 6.827 | 8.479 / 15.433 | 30.411 / 28.927 |
| Training state/month climatology | 2.061 / 5.303 | 7.161 / 12.145 | 31.175 / 28.143 |
| V1 direct | 1.910 / 5.383 | 6.667 / 11.654 | 33.447 / 27.390 |
| Regularized, 15 inputs | 2.014 / 5.335 | 6.765 / 11.661 | 32.988 / 27.168 |
| Regularized, 22 inputs | 2.006 / 5.314 | 6.751 / 11.631 | 32.931 / 27.138 |
| Two-stage, 22 inputs, Platt | 1.957 / 5.370 | 6.641 / 11.623 | 33.648 / 27.782 |
| Heavy-weighted, 22 inputs | 2.065 / 5.273 | 7.112 / 11.784 | 31.655 / 25.644 |

All amount errors are in mm. Relative to v1, early-fold MAE rose by 2.4% for two-stage Platt and 5.0% for extended direct. The heavy-event model's late-fold MAE rose 6.7%. On observed heavy events, even the two-stage *conditional* amount had bias of −31.29 mm early and −27.04 mm late. Occurrence calibration alone cannot fix this magnitude error.

Paired bootstrap resamples hold all states and horizons together within 14-calendar-day origin blocks. With 2,000 draws, seed 42 and 8/13 occupied blocks, the approximate 95% intervals for extended-direct RMSE gain versus v1 were [0.039, 0.104] mm early and [−0.015, 0.058] mm late. For two-stage Platt they were [−0.033, 0.073] and [0.0004, 0.068] mm. The folds are short and contain different seasons. These are exploratory, configuration-specific intervals without a multiple-comparison correction.

## Rain occurrence by horizon

Brier scores below use the late development fold. Smaller is better. The publication column describes the active v1 policy, which also considered its original independent test. Probability diagnostics for both folds include log loss, precision, recall, F1, ten-bin expected calibration error and reliability-bin sample counts.

| Day | Climatology Brier | V1 isotonic | Extended Platt | Active publication |
|---:|---:|---:|---:|---|
| 1 | .1104 | .0875 | .0859 | Yes |
| 2 | .1096 | .0937 | .0913 | Yes |
| 3 | .1094 | .0972 | .0942 | Yes |
| 4 | .1095 | .0997 | .0977 | Yes |
| 5 | .1096 | .1040 | .1015 | Yes |
| 6 | .1102 | .1076 | .1048 | Yes |
| 7 | .1108 | .1122 | .1076 | Withheld |

Late-fold day-7 v1 probabilities averaged 81.21% for an observed wet frequency of 83.55%. The top reliability bin averaged 99.99% predicted versus 96.77% observed in 2,972 forecasts. The bottom bin averaged 6.12% predicted versus 28.13% observed in 64 forecasts. Applying Platt to the same classifier reduced day-7 log loss from 0.897 to 0.348. The extended Platt model reduced it to 0.340. On the earlier validation fold, extended Platt's day-7 Brier was 0.1664 versus climatology's 0.1635. Improved calibration in one season did not justify publication across seasons. V1's pooled Brier was 0.0692 during the late fold's monsoon and 0.1528 during the early fold's winter.

## Retrospective and newer verification

On the previously inspected v1 test window, the retained model reproduced MAE 3.827 mm, RMSE 9.629 mm and heavy-event MAE 30.925 mm. Pooled wet/dry MAEs were 6.898/1.145 mm. Its heavy bias was −30.779 mm. Among states with at least 30 heavy forecast/target pairs, Dadra and Nagar Haveli and Daman and Diu had heavy MAE 75.49 mm (112 pairs), Gujarat 58.54 mm (35), and Meghalaya 48.05 mm (35). Repeated lead times can verify on the same event. The original test still supports a 0.85% observed RMSE improvement against climatology, with a 95% block interval for the gain of [−0.120, 0.285] mm. This replay adds no new independent observations to that result.

After freezing selection, an external archive request on 20 November obtained precipitation for 11–18 November 2026 at the 33 configured coordinates. The preceding ten daily precipitation totals matched PostgreSQL for all 33 states. Historical feature rows came exclusively from PostgreSQL. There were two eligible origins, 66 state-origins, 264 distinct verifying state-days and 462 forecast/target pairs. The two heavy forecast pairs verified on the same state-day. There were zero newly stored PostgreSQL targets. This short, post-monsoon replay measures performance against a newer external precipitation series. Availability of individual historical records at their original issue time cannot be reconstructed from the table.

| Fresh external check | MAE (mm) | RMSE (mm) | Brier |
|---|---:|---:|---:|
| Retained v1 | 1.660 | 3.860 | .1793 |
| Climatology | 2.227 | 4.691 | .2126 |
| Persistence | .934 | 3.799 | .2381 |
| Zero | .708 | 3.705 | .1797 |

The sample was 17.97% wet. The zero baseline had the lowest RMSE. For v1, heavy MAE was 41.79 mm, F1 was 0.315 and expected calibration error was 0.131. Two adjacent origins supply only one 14-day time block. A temporal uncertainty interval or change to the release gates is unsupported here.

| Day | Original test MAE / RMSE (mm) | New external MAE / RMSE (mm) | New external Brier |
|---:|---:|---:|---:|
| 1 | 3.493 / 9.366 | 1.081 / 1.978 | .2194 |
| 2 | 3.706 / 9.570 | 1.214 / 2.144 | .1904 |
| 3 | 3.800 / 9.634 | 1.377 / 2.173 | .1169 |
| 4 | 3.871 / 9.628 | 1.981 / 5.532 | .1985 |
| 5 | 3.931 / 9.704 | 2.466 / 6.306 | .2184 |
| 6 | 3.982 / 9.733 | 1.950 / 3.697 | .1555 |
| 7 | 4.005 / 9.762 | 1.552 / 2.655 | .1560 |

## Serving audit and regression checks

- Calibration previously clipped an infinite or out-of-range classifier result into a plausible probability. Inference now verifies raw probabilities, feature finiteness, estimator column order and nonnegative conditional amounts before combining stages.
- The v1 loader checked publication flags for type only. It now recalculates the same decisions as training and checks isotonic breakpoint order, ranges and estimator objectives in addition to the artifact digest and ordered feature/target contracts.
- Negative stored precipitation previously could reach the temperature model and prediction log before rainfall inference rejected it. The shared history validator now rejects it before prediction. Incomplete shared history returns HTTP 422. Invalid rainfall-specific measurements have a separate response status and null ML fields. The endpoint also rejects dates too close to the maximum calendar date to return all seven horizons.
- The forecast page distinguishes a withheld probability from a model or historical-input failure. The history page removed a fixed record count that could disagree with the connected database. Desktop and mobile tests exercise the forecast, failure states and the six-module navigation flow.
- The active rainfall file is `model/rainfall_v1.json.gz`, SHA-256 `21d153092d466d6ebac6058dd5a6f37f6ff84c423af6d441ebfa32641c153ed7`. Rainfall v1 retraining into an isolated output directory reproduced both the artifact bytes and parsed metadata. The temperature artifact SHA-256 is `844fdadfbe2786d859cdfc55c2e7dc14eb0b2f420b339f3e877fa6856aa37adf`. All four temperature reference predictions matched the training implementation.
- Verification passed 235 backend/PostgreSQL tests, 61 frontend component/API tests, four desktop/mobile browser tests, TypeScript, the production build, Compose configuration validation and the live Open-Meteo rollback probe on a disposable database. Two backend test-client dependency deprecation warnings were reported.

## Reproduce and inspect

Use the repository's Python requirements and the same PostgreSQL snapshot. Both commands read the source database. The first writes a new experiment directory. The second replays the cached external records. The archived response includes the request URLs, model selections, coordinates, units contract and dates through the audit script. Source attribution is Open-Meteo, ECMWF and the Copernicus Climate Change Service.

```sh
python backend/experiment_rainfall.py --output results/rainfall_comparison
python backend/audit_rainfall_sources.py results/rainfall_comparison docs/rainfall_v2/archive_probe.json.gz results/rainfall_sources.json
```

The compressed JSON files contain full-precision metrics, including per-horizon, per-state and target-season breakdowns, reliability bins, tail errors, data fingerprints, configurations and counts. The `candidate` key in the final comparisons denotes the retained v1 model. The experiment produced no eligible replacement weights. [Development and retrospective diagnostics](rainfall_v2_info.json.gz) · [Source audit and external verification](source_audit.json.gz) · [Frozen external data](archive_probe.json.gz)
