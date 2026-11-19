# Academic Reference & Citation Audit

**Project:** Weather Forecasting Using Machine Learning  
**Scope:** Complete verification of all 35 academic and authoritative technical citations ([1] through [35])  
**Branch:** `audit/final-evidence-documentation`  
**Status:** VERIFIED (35/35 Authoritative Sources Validated)

---

## 1. Executive Summary & Domain Context

Academic reports and engineering publications must uphold rigorous standards of source attribution, bibliographic integrity, and scientific precision. This audit examines all 35 references supporting the project across five core domains:

1. **Atmospheric Science & Meteorological Benchmarks** (Numerical Weather Prediction, reanalysis datasets, empirical comfort equations)
2. **Machine Learning Algorithms & Methodology** (Gradient boosted decision trees, random forests, hyperparameter optimization, temporal validation)
3. **Data Science & Scientific Computing Foundations** (NumPy, Pandas, Scikit-learn, technical debt in ML systems)
4. **Backend Architecture, Protocols & Security** (FastAPI, SQLAlchemy, PostgreSQL, RFC 7807 Problem Details, OWASP Top 10, CWEs)
5. **Frontend Systems & Cloud Infrastructure** (React, Vite, Recharts, Neon Serverless Postgres, Render, Vercel)

---

## 2. Mandatory NWP Disambiguation Statement

In academic literature, confusing physics-based **Numerical Weather Prediction (NWP)** with empirical **Machine Learning (ML)** constitutes a fundamental category error. Early drafts of project deliverables occasionally conflated the two paradigms. The following authoritative, neutral text must replace any claim that this machine learning model performs NWP:

> "Numerical weather prediction is a physics-based forecasting approach that integrates the Navier-Stokes hydrodynamic equations, thermodynamic energy conservation, and radiative transfer over three-dimensional spatial grids. This project instead applies supervised machine learning to historical regional weather observations to predict average temperature for multiple forecast horizons. The statistical model discovers temporal auto-regressive patterns and seasonal cycles directly from tabular time-series data without solving atmospheric differential equations."

---

## 3. Authoritative 35-Reference Verification Table

The table below catalogs every citation ([1] to [35]), verifying authors, publication title, journal/conference/publisher venue, publication year, and Digital Object Identifier (DOI) or canonical URI.

| # | Primary Authors | Publication Title | Venue / Publisher | Year | DOI / Canonical Identifier | Category |
|---|---|---|---|---|---|---|
| [1] | Bauer, P., Thorpe, A., & Brunet, G. | *The quiet revolution of numerical weather prediction* | Nature, 525(7567), 47–55 | 2015 | [10.1038/nature14956](https://doi.org/10.1038/nature14956) | Meteorology / NWP |
| [2] | Rasp, S., Dueben, P. D., Scher, S., Weyn, J. A., Mouatadid, S., & Thuerey, N. | *WeatherBench: A benchmark data set for data-driven weather forecasting* | Journal of Advances in Modeling Earth Systems, 12(11), e2020MS002203 | 2020 | [10.1029/2020MS002203](https://doi.org/10.1029/2020MS002203) | ML Weather Benchmark |
| [3] | Hersbach, H., Bell, B., Berrisford, P., et al. | *The ERA5 global reanalysis* | Quarterly Journal of the Royal Meteorological Society, 146(730), 1999–2049 | 2020 | [10.1002/qj.3803](https://doi.org/10.1002/qj.3803) | Reanalysis Dataset |
| [4] | Lam, R., Sanchez-Gonzalez, A., Willson, M., et al. | *Learning skillful medium-range global weather forecasting (GraphCast)* | Science, 382(6677), 1416–1421 | 2023 | [10.1126/science.adi2336](https://doi.org/10.1126/science.adi2336) | Deep Learning Weather |
| [5] | Bi, K., Xie, L., Zhang, H., Chen, X., Gu, X., & Tian, Q. | *Accurate medium-range global weather forecasting with 3D neural networks (Pangu-Weather)* | Nature, 619(7970), 533–538 | 2023 | [10.1038/s41586-023-06185-3](https://doi.org/10.1038/s41586-023-06185-3) | Deep Learning Weather |
| [6] | Chen, T., & Guestrin, C. | *XGBoost: A Scalable Tree Boosting System* | Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining, 785–794 | 2016 | [10.1145/2939672.2939785](https://doi.org/10.1145/2939672.2939785) | Tree Boosting ML |
| [7] | Ke, G., Meng, Q., Finley, T., Wang, T., Chen, W., Ma, W., Ye, Q., & Liu, T. Y. | *LightGBM: A Highly Efficient Gradient Boosting Decision Tree* | Advances in Neural Information Processing Systems (NeurIPS 30), 3146–3154 | 2017 | [NeurIPS 2017 Paper](https://proceedings.neurips.cc/paper/2017/hash/6449f44a102fde848669bdd9eb6b76fa-Abstract.html) | Tree Boosting ML |
| [8] | Breiman, L. | *Random Forests* | Machine Learning, 45(1), 5–32 | 2001 | [10.1023/A:1010933404324](https://doi.org/10.1023/A:1010933404324) | Ensemble Learning |
| [9] | Pedregosa, F., Varoquaux, G., Gramfort, A., et al. | *Scikit-learn: Machine Learning in Python* | Journal of Machine Learning Research (JMLR), 12, 2825–2830 | 2011 | [JMLR v12](http://jmlr.org/papers/v12/pedregosa11a.html) | ML Software Library |
| [10] | Sculley, D., Holt, G., Golovin, D., et al. | *Hidden Technical Debt in Machine Learning Systems* | Advances in Neural Information Processing Systems (NeurIPS 28), 2503–2511 | 2015 | [NeurIPS 2015 Paper](https://proceedings.neurips.cc/paper/2015/hash/86df7dcfd896fcaf2674f757a2463eba-Abstract.html) | ML Engineering Debt |
| [11] | Steadman, R. G. | *The Assessment of Sultriness. Part I: A Temperature-Humidity Index Based on Human Physiological Reactions* | Journal of Applied Meteorology and Climatology, 18(7), 861–873 | 1979 | [10.1175/1520-0450(1979)018<0861:TAOSPI>2.0.CO;2](https://doi.org/10.1175/1520-0450(1979)018<0861:TAOSPI>2.0.CO;2) | Biometeorology |
| [12] | Steadman, R. G. | *A Universal Scale of Apparent Temperature* | Journal of Applied Meteorology and Climatology, 23(12), 1674–1687 | 1984 | [10.1175/1520-0450(1984)023<1674:AUSOAT>2.0.CO;2](https://doi.org/10.1175/1520-0450(1984)023<1674:AUSOAT>2.0.CO;2) | Apparent Temp Heuristic |
| [13] | Lawrence, M. G. | *The Relationship between Relative Humidity and the Dewpoint Temperature in Moist Air: A Simple Conversion and Applications* | Bulletin of the American Meteorological Society (BAMS), 86(2), 225–234 | 2005 | [10.1175/BAMS-86-2-225](https://doi.org/10.1175/BAMS-86-2-225) | Dew Point Approximation |
| [14] | Alduchov, O. A., & Eskridge, R. E. | *Improved Magnus Form Approximation of Saturation Vapor Pressure* | Journal of Applied Meteorology, 35(4), 601–609 | 1996 | [10.1175/1520-0450(1996)035<0601:IMFAOS>2.0.CO;2](https://doi.org/10.1175/1520-0450(1996)035<0601:IMFAOS>2.0.CO;2) | Vapor Pressure Physics |
| [15] | Hyndman, R. J., & Athanasopoulos, G. | *Forecasting: Principles and Practice (3rd ed.)* | OTexts: Melbourne, Australia | 2021 | [OTexts.com/fpp3](https://otexts.com/fpp3/) | Time-Series Forecasting |
| [16] | Box, G. E., Jenkins, G. M., Reinsel, G. C., & Ljung, G. M. | *Time Series Analysis: Forecasting and Control (5th ed.)* | John Wiley & Sons | 2015 | [ISBN: 978-1-118-67502-1](https://www.wiley.com/en-us/Time+Series+Analysis%3A+Forecasting+and+Control%2C+5th+Edition-p-9781118675021) | Autoregressive Models |
| [17] | Bergstra, J., & Bengio, Y. | *Random Search for Hyper-Parameter Optimization* | Journal of Machine Learning Research (JMLR), 13, 281–305 | 2012 | [JMLR v13](http://jmlr.org/papers/v13/bergstra12a.html) | Hyperparameter Tuning |
| [18] | Arlot, S., & Celisse, A. | *A survey of cross-validation procedures for model selection* | Statistics Surveys, 4, 40–79 | 2010 | [10.1214/09-SSU049](https://doi.org/10.1214/09-SSU049) | Validation Theory |
| [19] | Stone, M. | *Cross-Validatory Choice and Assessment of Statistical Predictions* | Journal of the Royal Statistical Society: Series B (Methodological), 36(2), 111–133 | 1974 | [10.1111/j.2517-6161.1974.tb00994.x](https://doi.org/10.1111/j.2517-6161.1974.tb00994.x) | Cross-Validation Roots |
| [20] | Zippenfenig, P. | *Open-Meteo: Free Open-Source Weather API* | Zenodo / Open-Meteo Documentation | 2023 | [10.5281/zenodo.7940114](https://doi.org/10.5281/zenodo.7940114) | Meteorological API |
| [21] | McKinney, W. | *Data Structures for Statistical Computing in Python* | Proceedings of the 9th Python in Science Conference (SciPy 2010), 56–61 | 2010 | [10.25080/Majora-92bf1922-00a](https://doi.org/10.25080/Majora-92bf1922-00a) | Data Processing (Pandas) |
| [22] | Harris, C. R., Millman, K. J., van der Walt, S. J., et al. | *Array programming with NumPy* | Nature, 585(7825), 357–362 | 2020 | [10.1038/s41586-020-2649-2](https://doi.org/10.1038/s41586-020-2649-2) | Numerical Array Engine |
| [23] | Ramírez, S. | *FastAPI: Modern, High-Performance Web Framework for Python* | GitHub / FastAPI Documentation | 2019 | [fastapi.tiangolo.com](https://fastapi.tiangolo.com/) | API Framework |
| [24] | PostgreSQL Global Development Group | *PostgreSQL 16 Documentation: Advisory Locks, JSON Types, and Indexing* | PostgreSQL Documentation | 2024 | [postgresql.org/docs/16](https://www.postgresql.org/docs/16/) | Database Management |
| [25] | Bayer, M. | *SQLAlchemy: The Database Toolkit for Python* | The Architecture of Open Source Applications, Volume II | 2012 | [aosabook.org/en/sqlalchemy.html](https://aosabook.org/en/sqlalchemy.html) | ORM Architecture |
| [26] | Fielding, R. T. | *Architectural Styles and the Design of Network-based Software Architectures (REST)* | Ph.D. Dissertation, University of California, Irvine | 2000 | [UC Irvine Repository](https://www.ics.uci.edu/~fielding/pubs/dissertation/top.htm) | REST Architecture |
| [27] | Nottingham, M., Wilde, E., & Dalal, S. | *Problem Details for HTTP APIs (RFC 7807 / RFC 9457)* | Internet Engineering Task Force (IETF) RFC 7807 | 2016 | [10.17487/RFC7807](https://doi.org/10.17487/RFC7807) | Error Specification |
| [28] | OWASP Foundation | *OWASP Top 10: 2021 The Ten Most Critical Web Application Security Risks* | Open Web Application Security Project (OWASP) | 2021 | [owasp.org/Top10](https://owasp.org/Top10/) | Application Security |
| [29] | MITRE Corporation | *Common Weakness Enumeration (CWE-89, CWE-208, CWE-209)* | MITRE CWE Knowledge Base | 2024 | [cwe.mitre.org](https://cwe.mitre.org/) | Security Vulnerabilities |
| [30] | Meta Open Source | *React: A JavaScript Library for Building User Interfaces (React 18)* | React Official Documentation | 2024 | [react.dev](https://react.dev/) | Frontend Architecture |
| [31] | Vite Core Team & You, E. | *Vite: Next Generation Frontend Tooling* | Vite Documentation | 2024 | [vite.dev](https://vite.dev/) | Bundler & Dev Tooling |
| [32] | Recharts Group | *Recharts: Redefined Chart Library Built on React and D3* | Recharts Documentation | 2024 | [recharts.org](https://recharts.org/) | Data Visualization |
| [33] | Neon Inc. | *Neon Architecture: Serverless Postgres with Separated Storage and Compute* | Neon Technical Documentation | 2024 | [neon.tech/docs](https://neon.tech/docs/introduction) | Serverless Database |
| [34] | Render Services Inc. | *Render Cloud Application Platform Documentation: Web Services & Background Workers* | Render Documentation | 2024 | [render.com/docs](https://render.com/docs) | Cloud Hosting |
| [35] | Vercel Inc. | *Vercel Platform: Deploying Modern Web Applications and Single Page App Routing* | Vercel Documentation | 2024 | [vercel.com/docs](https://vercel.com/docs) | Frontend Edge Hosting |

---

## 4. Citation Usage Guidelines for Project Documentation

1. **When discussing Weather Prediction Background:** Use [1] for classical NWP context, [2] for machine learning benchmarking, and [3] for reanalysis baselines. Always include the NWP disambiguation statement from Section 2.
2. **When discussing Tree-Based Architectures:** Use [6] when referencing XGBoost comparisons and [7] when documenting the deployed LightGBM model.
3. **When explaining Derived Parameters:** Cite Steadman [11, 12] when discussing apparent temperature ("feels like"), and Lawrence [13] when explaining the linear dew-point rule of thumb. Note that the implementation intentionally omits wind speed and uses the linear approximation rather than the Alduchov-Eskridge [14] Magnus formulation.
4. **When explaining Validation Strategy:** Cite Hyndman [15], Box et al. [16], Arlot & Celisse [18], and Stone [19] to justify why standard k-fold random splitting is invalid for time-series and why chronological `TimeSeriesSplit` was used.
5. **When describing Full-Stack & Infrastructure:** Use [23] for FastAPI, [24] for PostgreSQL advisory locking, [27] for error responses, [28, 29] for security audits, and [33, 34, 35] for the Neon-Render-Vercel target infrastructure.
