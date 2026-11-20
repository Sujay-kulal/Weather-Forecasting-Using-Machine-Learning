"""Audit source coverage and verify a frozen rainfall candidate against a short external window.

The archive response is saved separately for offline replay. Source rows are never written to PostgreSQL.
"""
import argparse
from datetime import date, timedelta
import gzip
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

from app.database_url import postgres_url
from app.services import rainfall as rain
import experiment_rainfall as exp
import train_rainfall as v1
from update_weather import STATE_COORDS

SOURCE = "https://archive-api.open-meteo.com/v1/archive"
FRESH_START = date(2026, 11, 11)
FRESH_END = date(2026, 11, 18)
REQUEST_FIELDS = ["precipitation_sum", "relative_humidity_2m_mean", "temperature_2m_mean",
                  "temperature_2m_max", "temperature_2m_min"]


def retrieve(states, start, end, model):
    coords = [STATE_COORDS[s] for s in states]
    params = dict(latitude=",".join(str(lat) for lat, _ in coords),
                  longitude=",".join(str(lon) for _, lon in coords), start_date=str(start), end_date=str(end),
                  daily=",".join(REQUEST_FIELDS), timezone="Asia/Kolkata", models=model)
    url = SOURCE + "?" + urlencode(params)
    with urlopen(url, timeout=45) as response:
        pages = json.load(response)
    if isinstance(pages, dict):
        pages = [pages]
    records = []
    for state, (lat, lon), page in zip(states, coords, pages, strict=True):
        if abs(lat - page["latitude"]) > .4 or abs(lon - page["longitude"]) > .4:
            raise ValueError("Archive location mismatch.")
        daily = page["daily"]
        if (page["utc_offset_seconds"] != 19800 or
                [page["daily_units"][k] for k in REQUEST_FIELDS] != ["mm", "%", "°C", "°C", "°C"]):
            raise ValueError("Archive daily units/timezone mismatch.")
        if daily["time"] != list(pd.date_range(start, end).strftime("%Y-%m-%d")):
            raise ValueError("Archive returned a different date window.")
        for values in zip(daily["time"], *(daily[k] for k in REQUEST_FIELDS), strict=True):
            records.append(dict(zip(["date", *rain.MEASUREMENTS], values), state=state))
    return dict(url=url, records=records)


def database_extent(states):
    load_dotenv(v1.ROOT / "backend/.env")
    engine = create_engine(postgres_url(os.environ["DATABASE_URL"]))
    try:
        with engine.begin() as conn:
            conn.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
            rows = conn.execute(text("""
                SELECT min(date), max(date), count(*), count(*) FILTER (WHERE date < '2023-04-01'),
                       count(*) FILTER (WHERE date > '2026-11-10')
                FROM weather_data WHERE state=ANY(:states) AND district='' AND location=''
            """), dict(states=states)).one()
            return dict(first=str(rows[0]), last=str(rows[1]), rows=rows[2], earlier_rows=rows[3], newer_rows=rows[4])
    finally:
        engine.dispose()


def ranges(dates):
    dates = sorted(dates)
    grouped = []
    for d in dates:
        if grouped and d == grouped[-1][-1] + timedelta(days=1):
            grouped[-1].append(d)
        else:
            grouped.append([d])
    return [[str(group[0]), str(group[-1]), len(group)] for group in grouped]


def source_audit(clean, states):
    out = {"database_extent": database_extent(states)}
    all_dates = set(pd.date_range(clean.date.min(), clean.date.max()).date)
    state_data = {}
    for state, group in clean.groupby("state"):
        missing = all_dates - set(group.date)
        dry_spells = ranges(group.loc[group.rainfall <= rain.RAIN_THRESHOLD, "date"])
        state_data[state] = dict(missing=ranges(missing),
            missing_monsoon_days=sum(6 <= d.month <= 9 for d in missing),
            longest_dry_run=max(dry_spells, key=lambda seq: seq[2]), max_mm=group.rainfall.max(),
            below_minus30_c=int((group.temp_min < -30).sum()), heavy_days=int((group.rainfall >= 25).sum()))
    out["states"] = state_data
    out["seasonal_observations"] = {}
    for season, group in clean.groupby(exp.season(pd.to_datetime(clean.date).dt.month)):
        out["seasonal_observations"][season] = dict(n=len(group), wet_fraction=(group.rainfall > .1).mean(),
                                                   heavy_fraction=(group.rainfall >= 25).mean(), mean_mm=group.rainfall.mean())
    csv = v1.ROOT / "data/archive_c/PSP_Weather_Merged_EDA_Cleaned.csv"
    if csv.exists():
        local = pd.read_csv(csv)
        local.columns = local.columns.str.lower()
        local.date = pd.to_datetime(local.date).dt.date
        overlap = clean.merge(local, on=["state", "date"], validate="one_to_one", suffixes=("", "_csv"))
        out["csv"] = dict(sha256=hashlib.sha256(csv.read_bytes()).hexdigest(), rows=len(local), overlap=len(overlap),
            matching={k: int(np.isclose(overlap[k], overlap[k+"_csv"]).sum()) for k in rain.MEASUREMENTS})
    return out


def as_frame(batch):
    data = pd.DataFrame(batch["records"])
    data.date = pd.to_datetime(data.date).dt.date
    return data


def compare_sources(db, probe):
    subset = db.merge(probe, on=["state", "date"], suffixes=("", "_archive"))
    return {state: {k: dict(pairs=int(group[k+"_archive"].count()),
                            mean_abs_difference=(group[k] - group[k+"_archive"]).abs().mean())
                    for k in rain.MEASUREMENTS} for state, group in subset.groupby("state")}


def external_check(clean, states, recent, models, source_sha):
    base = rain.loaded_bundle().models
    rain_obs = recent.dropna(subset=["rainfall"]).set_index(["state", "date"]).rainfall
    panel = []
    for state, group in clean.groupby("state"):
        rows = {r.date: r for r in group.itertuples(index=False)}
        for origin in pd.date_range(FRESH_START - timedelta(days=1), FRESH_END - timedelta(days=7)).date:
            history = [rows.get(origin - timedelta(days=i)) for i in range(1, 8)]
            keys = [(state, origin + timedelta(days=h)) for h in range(1, 8)]
            if any(r is None for r in history) or not all(k in rain_obs.index for k in keys):
                continue
            labels = [rain_obs.at[key] for key in keys]
            if not np.isfinite(labels).all() or min(labels) < 0:
                continue
            values = rain.feature_values(history, state, origin, states, extended=True)
            panel.append([state, origin, *values, *labels])
    frame = pd.DataFrame(panel, columns=["state", "origin", *exp.EXTENDED, *rain.TARGETS])
    out = dict(verification_source="Open-Meteo best_match point reanalysis, separate from stored target series",
               input_source="Frozen PostgreSQL snapshot only", input_snapshot_sha256=source_sha,
               eligible_state_origins=len(frame), release_eligible=False)
    if frame.empty:
        return out
    fit = clean[clean.date.between(*map(date.fromisoformat, v1.PERIODS["train"]))]
    forecasts = v1.baseline_predictions(frame, fit)
    forecasts.update(v1=exp.prediction(base, frame), candidate=exp.prediction(models, frame))
    out.update(samples=v1.period_summary(frame), unique_state_target_days=len({
        (r.state, r.origin + timedelta(days=h)) for r in frame.itertuples() for h in range(1, 8)}),
        metrics=exp.breakdown(frame, forecasts))
    return out


def run(experiment, cache, output):
    meta = json.loads((experiment / "rainfall_v2_info.json").read_text())
    states = meta["states"]
    models = rain.loaded_bundle().models
    if meta["artifact_sha256"]:
        payload = (experiment / "rainfall_v2.json.gz").read_bytes()
        models = exp.thaw(payload, meta["artifact_sha256"])["models"]
    clean, audit = v1.clean_snapshot(v1.snapshot(states), states)
    if audit["snapshot_sha256"] != meta["source_sha256"]:
        raise ValueError("Frozen benchmark inputs required.")
    if cache.exists():
        archive = json.loads(gzip.decompress(cache.read_bytes()))
    else:
        probes = ["Karnataka", "Jammu And Kashmir"]
        archive = dict(older=retrieve(probes, "2015-01-01", "2015-01-03", "era5"),
                       overlap=retrieve(probes, "2024-07-01", "2024-07-31", "era5"),
                       recent=[retrieve(states[i:i+6], "2026-11-01", FRESH_END, "best_match")
                               for i in range(0, len(states), 6)])
        cache.write_bytes(gzip.compress(json.dumps(archive, separators=(",", ":")).encode(), mtime=0))
    recent = pd.concat([as_frame(batch) for batch in archive["recent"]], ignore_index=True)
    out = source_audit(clean, states)
    out.update(archive_sha256=hashlib.sha256(cache.read_bytes()).hexdigest(),
               evaluated_artifact_sha256=meta["artifact_sha256"] or meta["baseline_artifact_sha256"],
               old_archive_complete_rows=len(as_frame(archive["older"]).dropna()),
               july_2024_archive_overlap=compare_sources(clean, as_frame(archive["overlap"])),
               november_2026_archive_overlap=compare_sources(clean, recent),
               external=external_check(clean, states, recent, models, audit["snapshot_sha256"]))
    output.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False)+"\n")
    print(out["database_extent"], out["external"]["eligible_state_origins"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment", type=Path)
    parser.add_argument("cache", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    run(args.experiment, args.cache, args.output)
