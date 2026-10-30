# Repository Engineering Rules

## Project invariants
1. The production application uses FastAPI, PostgreSQL, SQLAlchemy, React, TypeScript, and Vite. Confirm current source before changing architecture.
2. The deployed ML contract is defined by `model/model_info.json` and the configured artifact in `backend/app/services/model_service.py`. Current metadata describes a seven-day multi-output forecast with 20 input features (18 numeric and 2 categorical). Verify the loaded artifact and hash before making claims.
3. Do not retrain, replace, overwrite, or alter `model/weather_model_v3.joblib`, `model/model_info.json`, training data, or training scripts without explicit user approval.
4. Do not generate synthetic weather observations or fabricated ML predictions.
5. PostgreSQL is the production database. Do not replace it with SQLite in runtime code.
6. Do not commit `.env`, credentials, API tokens, private keys, or database passwords.
7. Preserve existing API response contracts, database records, and frontend functionality unless the user explicitly approves a breaking change.
8. Do not install dependencies or introduce services without explaining the need and obtaining approval when material.
9. Avoid unrelated refactoring and opportunistic scope expansion.
10. Treat live Open-Meteo observations and ML forecasts as different data products. Label them distinctly.
11. A passing unit test does not prove production readiness. State exactly what was tested.
12. Never claim a command, test, deployment, or mutation succeeded unless there is direct execution evidence.

## Required workflow
1. Read this file and the relevant `.agents/skills/*/SKILL.md`.
2. Inspect the implementation, callers, contracts, and tests before editing.
3. Define acceptance criteria, affected files, risks, and rollback for non-trivial changes.
4. Make the smallest safe change.
5. Add or update regression tests for changed behavior.
6. Run focused tests and relevant regression checks.
7. Review `git diff`, `git status --short`, and `git diff --check`.
8. Report exact changed files, commands, outcomes, and limitations.

## Useful verification commands
- Backend: `python -m pytest backend/tests/ -v`
- Frontend: `cd frontend && npm run build`
- TypeScript: `cd frontend && npx tsc --noEmit -p tsconfig.json`
- Feature leakage script: `python backend/test_no_leakage.py`
- Training/database consistency script: `python backend/test_consistency.py` (requires the local dataset and PostgreSQL data)

## Scope protection
Never run training, retraining, destructive database operations, schema resets, force pushes, or production deployments unless the user explicitly requests that exact operation.
