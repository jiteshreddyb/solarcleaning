"""Extract the four model inputs from the project's hourly Dubai reference archive."""
import csv
import json
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "solar_weather_CAMS_soiling_2025_hourly.csv"
OUTPUT = ROOT / "public" / "assets" / "dubai-2025.json"


def main():
    rows = []
    start = datetime.fromisoformat("2025-01-01T00:00:00+00:00")
    with SOURCE.open() as source:
        for index, row in enumerate(csv.DictReader(source)):
            if datetime.fromisoformat(row["timestamp_utc"]) != start + timedelta(hours=index):
                raise ValueError(f"Unexpected timestamp at hour {index}")
            clean_dc = float(row["estimated_dc_12_9948MW_kW"]) * 10000 / 12994.8
            rows.append([round(clean_dc, 7), float(row["cams_pm10_ug_m3"]),
                         float(row["cams_pm2_5_ug_m3"]), float(row["PRECTOTCORR"])])
    if len(rows) != 8760:
        raise ValueError("The 2025 reference requires 8,760 hours.")
    OUTPUT.write_text(json.dumps({"start": start.isoformat(), "rows": rows},
                                 separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
