import sys
import time
import json
import urllib.request
import urllib.parse
from datetime import datetime, date, timedelta
from pathlib import Path

# Make `app` importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.database import SessionLocal
from app.models import WeatherData
from sqlalchemy import select, func

STATE_COORDS = {
    'Andhra Pradesh': (15.9129, 79.7400),
    'Arunachal Pradesh': (28.2180, 94.7278),
    'Assam': (26.2006, 92.9376),
    'Bihar': (25.0961, 85.3131),
    'Chandigarh': (30.7333, 76.7794),
    'Chhattisgarh': (21.2787, 81.8661),
    'Dadra And Nagar Haveli And Daman And Diu': (20.3974, 72.8328),
    'Delhi': (28.7041, 77.1025),
    'Goa': (15.2993, 74.1240),
    'Gujarat': (22.2587, 71.1924),
    'Haryana': (29.0588, 76.0856),
    'Himachal Pradesh': (31.1048, 77.1666),
    'Jammu And Kashmir': (33.7782, 76.5762),
    'Jharkhand': (23.6102, 85.2799),
    'Karnataka': (15.3173, 75.7139),
    'Kerala': (10.8505, 76.2711),
    'Madhya Pradesh': (22.9734, 78.6569),
    'Maharashtra': (19.7515, 75.7139),
    'Manipur': (24.6637, 93.9063),
    'Meghalaya': (25.4670, 91.3662),
    'Mizoram': (23.1645, 92.9376),
    'Nagaland': (26.1584, 94.5624),
    'Odisha': (20.9517, 85.0985),
    'Other': (20.5937, 78.9629),
    'Puducherry': (11.9416, 79.8083),
    'Punjab': (31.1471, 75.3412),
    'Rajasthan': (27.0238, 74.2179),
    'Sikkim': (27.5330, 88.5122),
    'Tamil Nadu': (11.1271, 78.6569),
    'Telangana': (18.1124, 79.0193),
    'Tripura': (23.9408, 91.9882),
    'Uttar Pradesh': (26.8467, 80.9462),
    'Uttarakhand': (30.0668, 79.0193),
    'West Bengal': (22.9868, 87.8550)
}

def get_coords(state: str):
    if state in STATE_COORDS:
        return STATE_COORDS[state]
    return 20.5937, 78.9629

def main():
    print("Starting weather update...")
    session = SessionLocal()
    
    # 1. Get all states and their max dates
    states_data = session.execute(
        select(WeatherData.state, func.max(WeatherData.date))
        .group_by(WeatherData.state)
    ).all()
    
    today = date.today()
    
    added_total = 0
    for state, max_date in states_data:
        if max_date >= today:
            print(f"[{state}] Already up to date (Latest: {max_date})")
            continue
            
        start_date = max_date + timedelta(days=1)
        end_date = today # we try to fetch up to today
        
        # If the gap is huge or invalid, just log
        if start_date > end_date:
            continue
            
        print(f"[{state}] Fetching from {start_date} to {end_date}...")
        lat, lon = get_coords(state)
        time.sleep(0.5) # respect rate limit
        
        # Fetch from open-meteo archive
        url = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude={lat}&longitude={lon}&"
            f"start_date={start_date}&end_date={end_date}&"
            f"daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean&"
            f"timezone=auto"
        )
        try:
            res = urllib.request.urlopen(url).read()
            data = json.loads(res)
        except Exception as e:
            print(f"[{state}] Failed to fetch data: {e}")
            continue
            
        if "daily" not in data:
            print(f"[{state}] No daily data in response")
            continue
            
        daily = data["daily"]
        times = daily["time"]
        t_max = daily["temperature_2m_max"]
        t_min = daily["temperature_2m_min"]
        t_mean = daily["temperature_2m_mean"]
        precip = daily["precipitation_sum"]
        humid = daily["relative_humidity_2m_mean"]
        
        buffer = []
        for i in range(len(times)):
            # If any value is null, skip
            if t_max[i] is None or t_min[i] is None or t_mean[i] is None or precip[i] is None or humid[i] is None:
                continue
                
            d = datetime.strptime(times[i], "%Y-%m-%d").date()
            if d < start_date or d > end_date:
                continue
                
            # Check if exists just in case
            exists = session.execute(
                select(func.count()).select_from(WeatherData)
                .where(WeatherData.state == state, WeatherData.date == d)
            ).scalar_one()
            
            if exists == 0:
                record = WeatherData(
                    state=state,
                    date=d,
                    temp_max=float(t_max[i]),
                    temp_min=float(t_min[i]),
                    temp_avg=float(t_mean[i]),
                    humidity=float(humid[i]),
                    rainfall=float(precip[i])
                )
                buffer.append(record)
                
        if buffer:
            session.add_all(buffer)
            session.commit()
            added_total += len(buffer)
            print(f"[{state}] Inserted {len(buffer)} records.")
        else:
            print(f"[{state}] No new valid records found.")
            
        time.sleep(0.5) # respect rate limit

    print(f"Weather update completed. Total new records: {added_total}")
    session.close()

if __name__ == "__main__":
    main()
