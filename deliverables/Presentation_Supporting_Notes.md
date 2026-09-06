# Presentation Supporting Notes — Weather Forecasting Using Machine Learning

## Slide-by-slide content

1. **Title**: Project title and editable placeholders for student name, USN, department, college, guide and academic year.
2. **Introduction**: Definition of weather forecasting, role of ML, project purpose and four application outputs.
3. **Problem Statement**: Turn stored state weather data into a validated next-day Temp_Avg forecast without leakage and with an audit trail.
4. **Objectives**: Train and compare models, select by RMSE, build features, serve API predictions, store records and deliver four UI views.
5. **Existing System vs Proposed System**: Editable comparison table with forecast creation, feature preparation, data access, validation, traceability and UI scope.
6. **System Architecture**: User, React/Vite, FastAPI, PostgreSQL weather data, feature service, saved Gradient Boosting pipeline, prediction storage and response loop.
7. **Technologies Used**: Verified frontend, backend, database, ML, data/API and deployment technologies.
8. **Dataset**: Source description, 31,177 rows, 34 state labels, date range, selected variables, zero-null and zero-duplicate checks, and preprocessing.
9. **Machine Learning Model**: Gradient Boosting Regressor, Temp_Avg target, chronological split, saved artifacts, candidate models and stored test metrics.
10. **Feature Engineering**: Past weather history through preprocessing, exact numeric/categorical inputs and model prediction.
11. **Backend and API**: Editable endpoint table plus POST `/predict` validation, feature-building, model-loading, persistence and response path.
12. **Frontend**: Forecast, Weather History, Model Performance and Prediction History features, plus shared health/error/data-fetch behaviour.
13. **Database**: Editable PostgreSQL table-model summary, constraints, data flow and explicit lack of ORM foreign key.
14. **Testing and Results**: PASS, FAIL and WARNING outcomes, plus stored model metrics.
15. **Deployment Architecture**: Confirmed local development setup, environment variables, CORS and unverified cloud deployment warning.
16. **Conclusion and Future Scope**: Implemented scope versus clearly-labelled proposed improvements.

## Slide-by-slide speaker notes

### 1. Title
Good morning. This project is called Weather Forecasting Using Machine Learning. It forecasts the next-day average temperature for Indian states. I will explain the dataset, model, full-stack implementation, results, and the parts that still need deployment verification.

### 2. Introduction
Weather forecasting estimates future atmospheric conditions using earlier observations. In this project, machine learning learns temperature patterns from historical state-level weather data. The application lets a user choose a state and date, then returns a next-day average temperature forecast with supporting weather context.

### 3. Problem statement
The repository addresses the need to turn stored state-level weather observations into a next-day average-temperature forecast that users can request through a web application. The project must use the same features in training and serving, avoid future-data leakage, and retain the predictions generated through the API.

### 4. Objectives
The implemented objectives are to train and compare regression models, select a model by test RMSE, serve predictions with FastAPI, use PostgreSQL for weather data and audit records, and provide a React interface for forecasts, weather history, model performance and prediction history.

### 5. Existing system vs proposed system
The repository does not describe a separate legacy product, so this comparison describes a manual historical-data workflow versus the implemented system. The proposed system centralises data access, constructs model inputs automatically, validates requests and stores output records.

### 6. System architecture
The user works through the React and Vite interface. FastAPI validates the request and reads weather history from PostgreSQL. The feature service creates the exact 13 inputs used in training. The saved Gradient Boosting pipeline predicts the temperature, FastAPI stores the audit record, and then returns the response to the interface.

### 7. Technologies used
The frontend uses React, TypeScript, Vite and Recharts. The backend uses Python, FastAPI, Uvicorn, SQLAlchemy and psycopg. PostgreSQL stores application data. Pandas, NumPy, scikit-learn and joblib support the model pipeline. Open-Meteo Archive appears only in the optional manual data-update script.

### 8. Dataset
The training CSV has 31,177 rows across 34 state labels from 1 April 2023 to 6 October 2025. The model selects weather fields, not the power-demand fields also present in the source. Our checks found no nulls in the required modelling fields and no duplicate state-date pair.

### 9. Machine learning model
The selected model is scikit-learn Gradient Boosting. It predicts next-day Temp_Avg in degrees Celsius. Four regression models and a naive persistence reference were evaluated. The saved Gradient Boosting model had test MAE 0.8760, RMSE 1.1854 and R-squared 0.9694. Model choice used the lowest RMSE.

### 10. Feature engineering
The backend reconstructs the same input row used at training time. It includes one to three day temperature lags, previous-day maximum, minimum, humidity and rainfall, three and seven record averages, cyclic month values, season and state. For date D it uses past records before D minus 1, so the target day's actual weather cannot leak into the forecast.

### 11. Backend and API
FastAPI provides seven endpoints. The key endpoint is POST slash predict. It accepts state and date, validates state availability and seven historical records, checks that history is recent, builds features, calls the saved pipeline, saves the outcome to PostgreSQL and returns JSON. It returns 404 for unknown state and 422 for insufficient or stale history.

### 12. Frontend
The frontend has four pages. Forecast creates a prediction and shows a recent history chart. Weather History displays state records with paging. Model Performance exposes the metadata and model comparison. Prediction History lists stored predictions with paging and a client-side state filter. The header checks backend health every 30 seconds.

### 13. Database
PostgreSQL has two tables. Weather_data stores one daily weather record for a state and uses a unique state-date constraint. Predictions stores each generated forecast with its creation time. The project does not declare a foreign key between these tables, but weather_data supplies the forecasting inputs and predictions is the output audit trail.

### 14. Testing and results
The saved model, source data checks and frontend build passed. The build did show a size warning for the JavaScript chunk. The current local database URL points to an unavailable port, so database-dependent tests could not complete. I report those as fail or warning instead of claiming successful live API or forecast testing.

### 15. Deployment architecture
The repository confirms local development settings only: Vite on port 5173, FastAPI on port 8000 and PostgreSQL through a connection string. CORS uses an environment-controlled allow-list. No deployment manifest or configuration confirms Vercel, Render, Neon or another production provider, so those services are intentionally not shown as implemented.

### 16. Conclusion and future scope
The project implements a complete local full-stack workflow for next-day average-temperature forecasting across 34 state labels. It includes model training, leakage-aware feature building, API validation, storage and UI views. Future work can compare additional models, add supported weather features, extend coverage and automate reliable data updates after a production deployment is configured.

## Ten likely viva questions and answers

1. **What exactly does the project predict?**  
   It predicts next-day average temperature, named `Temp_Avg`, in degrees Celsius for a requested Indian state.

2. **Which algorithm was selected and why?**  
   The selected algorithm is scikit-learn Gradient Boosting Regressor. The training script selects the trained candidate with the lowest test RMSE.

3. **What are the input features?**  
   There are 13: three average-temperature lags, previous maximum/minimum temperature, humidity, rainfall, three- and seven-record temperature averages, sine and cosine of month, Season and State.

4. **How do you prevent data leakage?**  
   The training code uses shifted historical values. For a target date D, the API reads only records before D minus 1 and rejects insufficient or stale history. It never reads day D's actual weather.

5. **Which dataset is used?**  
   The model uses `PSP_Weather_Merged_EDA_Cleaned.csv` from archive_c. The repository documentation calls it the Weather-Driven Indian Power Demand Dataset, but the model selects only weather columns.

6. **What do MAE, RMSE and R-squared show?**  
   MAE measures average absolute error, RMSE penalises larger errors more strongly, and R-squared shows how much target variation the model explains. The stored Gradient Boosting values are 0.8760, 1.1854 and 0.9694.

7. **Why use PostgreSQL?**  
   PostgreSQL stores historical measurements and prediction audit records. A unique state-date constraint protects weather records from duplicate imports. The code explicitly rejects SQLite.

8. **What happens if a user enters an invalid request?**  
   The API returns 404 for an unknown state, and 422 if date or query bounds are invalid or if enough recent history is not available. The frontend displays the backend error.

9. **Is it real-time forecasting?**  
   No. The implemented system forecasts the next-day value from weather history already stored in PostgreSQL. There is a manual script that can retrieve missing daily observations from Open-Meteo Archive, but no automatic real-time pipeline is configured.

10. **Is the project deployed?**  
   The repository confirms local setup only. It has no configuration proving Vercel, Render, Neon or another production deployment.

## Two-minute project explanation

Weather Forecasting Using Machine Learning is a full-stack system that predicts next-day average temperature for Indian states. The model uses the repository's cleaned weather dataset, which has 31,177 rows across 34 state labels from April 2023 to October 2025. Although the source dataset also contains power-demand fields, the model deliberately uses only weather variables.

The training script creates lag values from earlier days, rolling temperature averages, month-based cyclic values, season and state. It uses a chronological split to avoid learning from future dates. It compares Linear Regression, Decision Tree, Random Forest and Gradient Boosting with a naive tomorrow-equals-today reference. Gradient Boosting was saved because it had the lowest test RMSE. Its stored test metrics are MAE 0.8760 degrees Celsius, RMSE 1.1854 and R-squared 0.9694.

The React frontend contains Forecast, Weather History, Model Performance and Prediction History pages. It calls a FastAPI backend. For a prediction, FastAPI validates the state and date, reads seven historical PostgreSQL records, builds the same 13 features used in training, runs the saved joblib pipeline, stores the prediction in PostgreSQL, and returns JSON.

The system avoids data leakage by reading only history before the forecast as-of date. PostgreSQL enforces unique weather state-date records. In local checks, data quality, saved model loading and frontend production build passed. Database-dependent tests need a reachable configured PostgreSQL instance. The repository currently documents local deployment only, not a confirmed cloud deployment.

## Five-minute project explanation

This project, Weather Forecasting Using Machine Learning, is a complete local web application for next-day average-temperature forecasting in Indian states. The motivation is to make historical weather data usable through a simple interface rather than requiring a user to manually inspect many records. A user selects a state and forecast date, and the system returns a predicted Temp_Avg value in degrees Celsius, the selected model, a typical error value, the last known temperature used, and a visual history context.

The model uses `PSP_Weather_Merged_EDA_Cleaned.csv` in the repository. The source contains 31,177 rows, 34 state labels and dates from 2023-04-01 to 2025-10-06. The model does not use the electricity-demand columns that exist in the broader dataset. It selects date, state, maximum, minimum and average temperature, humidity, rainfall, month and season. In our check, the required weather fields had zero missing values. The source also had zero duplicate state-date pairs and zero exact duplicates.

The training pipeline first sorts records by state and date. It makes three lags of average temperature, previous-day maximum and minimum temperature, humidity and rainfall, plus three-day and seven-day rolling average temperature. Month becomes sine and cosine values so that December and January remain close numerically. Season and state become categorical inputs. The target is the next-day average temperature. The split is chronological, with the first 80 percent of dates for training and the last 20 percent for testing. This choice is important because random splitting could allow future patterns to influence training.

Four models are trained: Linear Regression, Decision Tree, Random Forest and Gradient Boosting. A naive persistence reference, tomorrow equals today, is also calculated. The selected model is Gradient Boosting Regressor because its test RMSE is the lowest among trained candidates. Saved metrics are MAE 0.8760 degrees Celsius, RMSE 1.1854 degrees Celsius and R-squared 0.9694. These are values stored in the repository metadata, not estimates added for the presentation.

The backend uses FastAPI, SQLAlchemy and psycopg with PostgreSQL. It loads the joblib pipeline once when the application starts. There are endpoints for health, available states, state weather history, recent weather, prediction, stored prediction history and model metadata. The key endpoint is POST `/predict`. It validates the state against database records, calculates the as-of date, loads seven records strictly before that date, rejects insufficient or stale history, builds the 13 features, calls the saved pipeline and saves the result in the predictions table. This design prevents target-date data from leaking into the prediction.

The database has a weather_data table and a predictions table. Weather_data has a unique state-date constraint, so imports cannot duplicate the same daily observation. Predictions retains an audit record for each successful API prediction. The importer also cleans types, removes missing rows, drops duplicate state-date records and skips rows already in the database. SQLite is deliberately rejected, so PostgreSQL is the only supported database.

The React frontend uses TypeScript, Vite and Recharts. Its four tabs are Forecast, Weather History, Model Performance and Prediction History. Forecast includes state and date inputs, result details and a context chart. Weather History has a paginated table and temperature chart. Model Performance presents the selected model, model comparison metrics and grouped features. Prediction History shows stored records with pagination and filtering. A health indicator checks the backend every 30 seconds.

For verification, the source-data checks, saved-model loading and TypeScript plus Vite production build passed. The build reported a chunk-size warning, which is a performance warning rather than a compilation error. The configured local database currently points to an unavailable PostgreSQL port, so current health, live forecast and feature-consistency tests could not complete. This is reported honestly in the testing slide. Finally, deployment configuration confirms a local setup only. The repository contains no evidence of Vercel, Render, Neon, Docker or CI deployment, so this presentation does not claim cloud deployment or real-time forecasting.
