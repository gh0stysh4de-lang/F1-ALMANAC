"""
F1 Encyclopedia — Weekly Season Update
Fetches current season data from Jolpica API and updates BigQuery.
Runs via GitHub Actions every Sunday evening after races.
"""
import os
import time
import json
import logging
from datetime import datetime

import requests
import pandas as pd
from google.cloud import bigquery

# ============ Config ============
PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "f1-encyclopedia-498914")
DATASET = "f1"
BASE_URL = "https://api.jolpi.ca/ergast/f1"
CURRENT_YEAR = datetime.now().year
REQUEST_DELAY = 4.0  # seconds between API calls
# ================================

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")
log = logging.getLogger(__name__)

# Authenticate: either from GOOGLE_APPLICATION_CREDENTIALS env var
# or from service account JSON passed as GCP_SA_KEY secret
def get_bq_client():
    sa_key = os.environ.get("GCP_SA_KEY")
    if sa_key:
        # GitHub Actions: credentials from secret
        key_path = "/tmp/sa_key.json"
        with open(key_path, "w") as f:
            f.write(sa_key)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path
    return bigquery.Client(project=PROJECT_ID)


client = get_bq_client()


# ============ API Fetcher ============
def fetch(endpoint):
    """Fetch all pages from Jolpica API endpoint."""
    offset = 0
    while True:
        url = f"{BASE_URL}/{endpoint}.json?limit=100&offset={offset}"
        for attempt in range(10):
            try:
                r = requests.get(url, timeout=30)
                r.raise_for_status()
                break
            except requests.RequestException as e:
                if attempt == 9:
                    log.error(f"Skip after 10 retries: {url}")
                    return
                wait = 15 * (attempt + 1)
                log.warning(f"Retry {attempt+1} in {wait}s: {e}")
                time.sleep(wait)
        data = r.json()["MRData"]
        total = int(data.get("total", 0))
        yield data
        offset += 100
        if offset >= total:
            break
        time.sleep(REQUEST_DELAY)


# ============ ID Mappings ============
def build_mappings():
    """Build lookup dicts from BigQuery reference tables."""
    log.info("Building ID mappings from BigQuery...")

    drivers = {}  # driverRef -> driverId (numeric)
    for row in client.query(f"SELECT driverId, driverRef FROM `{PROJECT_ID}.{DATASET}.drivers`").result():
        drivers[row.driverRef] = row.driverId

    constructors = {}  # constructorRef -> constructorId (numeric)
    for row in client.query(f"SELECT constructorId, constructorRef FROM `{PROJECT_ID}.{DATASET}.constructors`").result():
        constructors[row.constructorRef] = row.constructorId

    races = {}  # (year, round) -> raceId (numeric)
    race_ids_current = set()
    for row in client.query(f"SELECT raceId, year, round FROM `{PROJECT_ID}.{DATASET}.races`").result():
        races[(row.year, row.round)] = row.raceId
        if row.year == CURRENT_YEAR:
            race_ids_current.add(row.raceId)

    statuses = {}  # status string -> statusId (numeric)
    for row in client.query(f"SELECT statusId, status FROM `{PROJECT_ID}.{DATASET}.status`").result():
        statuses[row.status] = row.statusId

    log.info(f"  Drivers: {len(drivers)}, Constructors: {len(constructors)}, "
             f"Races: {len(races)}, Current season raceIds: {len(race_ids_current)}")

    return drivers, constructors, races, race_ids_current, statuses


def ensure_driver(driver_data, drivers_map):
    """Add new driver to BQ if not in mapping."""
    ref = driver_data["driverId"]
    if ref in drivers_map:
        return drivers_map[ref]

    # Get next available ID
    result = list(client.query(f"SELECT MAX(driverId) AS max_id FROM `{PROJECT_ID}.{DATASET}.drivers`").result())
    new_id = (result[0].max_id or 0) + 1

    row = {
        "driverId": new_id,
        "driverRef": ref,
        "number": int(driver_data.get("permanentNumber")) if driver_data.get("permanentNumber", "").isdigit() else None,
        "code": driver_data.get("code"),
        "forename": driver_data.get("givenName"),
        "surname": driver_data.get("familyName"),
        "dob": driver_data.get("dateOfBirth"),
        "nationality": driver_data.get("nationality"),
        "url": driver_data.get("url"),
    }
    df = pd.DataFrame([row])
    client.load_table_from_dataframe(
        df, f"{PROJECT_ID}.{DATASET}.drivers",
        job_config=bigquery.LoadJobConfig(write_disposition=bigquery.WriteDisposition.WRITE_APPEND)
    ).result()
    drivers_map[ref] = new_id
    log.info(f"  New driver: {driver_data.get('givenName')} {driver_data.get('familyName')} -> ID {new_id}")
    return new_id


def ensure_constructor(cons_data, constructors_map):
    """Add new constructor to BQ if not in mapping."""
    ref = cons_data["constructorId"]
    if ref in constructors_map:
        return constructors_map[ref]

    result = list(client.query(f"SELECT MAX(constructorId) AS max_id FROM `{PROJECT_ID}.{DATASET}.constructors`").result())
    new_id = (result[0].max_id or 0) + 1

    row = {
        "constructorId": new_id,
        "constructorRef": ref,
        "name": cons_data.get("name"),
        "nationality": cons_data.get("nationality"),
        "url": cons_data.get("url"),
    }
    df = pd.DataFrame([row])
    client.load_table_from_dataframe(
        df, f"{PROJECT_ID}.{DATASET}.constructors",
        job_config=bigquery.LoadJobConfig(write_disposition=bigquery.WriteDisposition.WRITE_APPEND)
    ).result()
    constructors_map[ref] = new_id
    log.info(f"  New constructor: {cons_data.get('name')} -> ID {new_id}")
    return new_id


# ============ Fetch Current Season ============
def fetch_results(drivers_map, constructors_map, races_map, statuses_map):
    """Fetch race results for current season."""
    rows = []
    result_id_start = list(client.query(
        f"SELECT COALESCE(MAX(resultId), 0) AS max_id FROM `{PROJECT_ID}.{DATASET}.results`"
    ).result())[0].max_id + 1

    for page in fetch(f"{CURRENT_YEAR}/results"):
        for race in page["RaceTable"]["Races"]:
            rnd = int(race["round"])
            race_id = races_map.get((CURRENT_YEAR, rnd))
            if not race_id:
                continue
            for res in race.get("Results", []):
                drv = res["Driver"]
                cons = res["Constructor"]
                driver_id = ensure_driver(drv, drivers_map)
                constructor_id = ensure_constructor(cons, constructors_map)
                time_obj = res.get("Time", {})
                fl = res.get("FastestLap", {})
                status_text = res.get("status", "")
                status_id = statuses_map.get(status_text)

                rows.append({
                    "resultId": result_id_start,
                    "raceId": race_id,
                    "driverId": driver_id,
                    "constructorId": constructor_id,
                    "number": int(res.get("number")) if res.get("number", "").isdigit() else None,
                    "grid": int(res.get("grid")) if res.get("grid", "").isdigit() else None,
                    "position": int(res["position"]) if res.get("position", "").isdigit() else None,
                    "positionText": res.get("positionText"),
                    "positionOrder": int(res.get("position", 0)) if res.get("position", "").isdigit() else 99,
                    "points": float(res.get("points", 0)),
                    "laps": int(res.get("laps", 0)),
                    "time": time_obj.get("time"),
                    "milliseconds": int(time_obj["millis"]) if time_obj.get("millis") else None,
                    "fastestLap": int(fl.get("lap")) if fl.get("lap", "").isdigit() else None,
                    "rank": int(fl.get("rank")) if fl.get("rank", "").isdigit() else None,
                    "fastestLapTime": fl.get("Time", {}).get("time"),
                    "fastestLapSpeed": fl.get("AverageSpeed", {}).get("speed"),
                    "statusId": status_id,
                })
                result_id_start += 1
    return rows


def fetch_qualifying(drivers_map, constructors_map, races_map):
    """Fetch qualifying for current season."""
    rows = []
    qual_id_start = list(client.query(
        f"SELECT COALESCE(MAX(qualifyId), 0) AS max_id FROM `{PROJECT_ID}.{DATASET}.qualifying`"
    ).result())[0].max_id + 1

    for page in fetch(f"{CURRENT_YEAR}/qualifying"):
        for race in page["RaceTable"]["Races"]:
            rnd = int(race["round"])
            race_id = races_map.get((CURRENT_YEAR, rnd))
            if not race_id:
                continue
            for q in race.get("QualifyingResults", []):
                driver_id = ensure_driver(q["Driver"], drivers_map)
                constructor_id = ensure_constructor(q["Constructor"], constructors_map)
                rows.append({
                    "qualifyId": qual_id_start,
                    "raceId": race_id,
                    "driverId": driver_id,
                    "constructorId": constructor_id,
                    "number": int(q.get("number")) if q.get("number", "").isdigit() else None,
                    "position": int(q.get("position")) if q.get("position", "").isdigit() else None,
                    "q1": q.get("Q1") if q.get("Q1") != "" else None,
                    "q2": q.get("Q2") if q.get("Q2") != "" else None,
                    "q3": q.get("Q3") if q.get("Q3") != "" else None,
                })
                qual_id_start += 1
    return rows


def fetch_sprint(drivers_map, constructors_map, races_map, statuses_map):
    """Fetch sprint results for current season."""
    rows = []
    result_id_start = list(client.query(
        f"SELECT COALESCE(MAX(resultId), 0) AS max_id FROM `{PROJECT_ID}.{DATASET}.sprint_results`"
    ).result())[0].max_id + 1

    try:
        for page in fetch(f"{CURRENT_YEAR}/sprint"):
            for race in page["RaceTable"]["Races"]:
                rnd = int(race["round"])
                race_id = races_map.get((CURRENT_YEAR, rnd))
                if not race_id:
                    continue
                for s in race.get("SprintResults", []):
                    driver_id = ensure_driver(s["Driver"], drivers_map)
                    constructor_id = ensure_constructor(s["Constructor"], constructors_map)
                    time_obj = s.get("Time", {})
                    fl = s.get("FastestLap", {})
                    status_text = s.get("status", "")
                    status_id = statuses_map.get(status_text)
                    rows.append({
                        "resultId": result_id_start,
                        "raceId": race_id,
                        "driverId": driver_id,
                        "constructorId": constructor_id,
                        "number": int(s.get("number")) if s.get("number", "").isdigit() else None,
                        "grid": int(s.get("grid")) if s.get("grid", "").isdigit() else None,
                        "position": int(s["position"]) if s.get("position", "").isdigit() else None,
                        "positionText": s.get("positionText"),
                        "positionOrder": int(s.get("position", 0)) if s.get("position", "").isdigit() else 99,
                        "points": float(s.get("points", 0)),
                        "laps": int(s.get("laps", 0)),
                        "time": time_obj.get("time"),
                        "milliseconds": int(time_obj["millis"]) if time_obj.get("millis") else None,
                        "fastestLap": int(fl.get("lap")) if fl.get("lap", "").isdigit() else None,
                        "fastestLapTime": fl.get("Time", {}).get("time"),
                        "statusId": status_id,
                        "rank": int(fl.get("rank")) if fl.get("rank", "").isdigit() else None,
                    })
                    result_id_start += 1
    except Exception as e:
        log.warning(f"Sprint fetch error (may not exist yet): {e}")
    return rows


def fetch_driver_standings(drivers_map, races_map):
    """Fetch driver standings for current season (final standings only)."""
    rows = []
    ds_id_start = list(client.query(
        f"SELECT COALESCE(MAX(driverStandingsId), 0) AS max_id FROM `{PROJECT_ID}.{DATASET}.driver_standings`"
    ).result())[0].max_id + 1

    # Get total rounds with results
    total_rounds = 0
    for page in fetch(f"{CURRENT_YEAR}/results"):
        for race in page["RaceTable"]["Races"]:
            rnd = int(race["round"])
            if rnd > total_rounds:
                total_rounds = rnd

    for rnd in range(1, total_rounds + 1):
        race_id = races_map.get((CURRENT_YEAR, rnd))
        if not race_id:
            continue
        for page in fetch(f"{CURRENT_YEAR}/{rnd}/driverstandings"):
            lists = page["StandingsTable"]["StandingsLists"]
            if not lists:
                continue
            for s in lists[0]["DriverStandings"]:
                driver_id = ensure_driver(s["Driver"], drivers_map)
                pos = s.get("position", "")
                rows.append({
                    "driverStandingsId": ds_id_start,
                    "raceId": race_id,
                    "driverId": driver_id,
                    "points": float(s.get("points", 0)),
                    "position": int(pos) if pos.isdigit() else None,
                    "positionText": s.get("positionText", pos),
                    "wins": int(s.get("wins", 0)),
                })
                ds_id_start += 1
    return rows


def fetch_constructor_standings(constructors_map, races_map):
    """Fetch constructor standings for current season."""
    rows = []
    cs_id_start = list(client.query(
        f"SELECT COALESCE(MAX(constructorStandingsId), 0) AS max_id FROM `{PROJECT_ID}.{DATASET}.constructor_standings`"
    ).result())[0].max_id + 1

    total_rounds = 0
    for page in fetch(f"{CURRENT_YEAR}/results"):
        for race in page["RaceTable"]["Races"]:
            rnd = int(race["round"])
            if rnd > total_rounds:
                total_rounds = rnd

    for rnd in range(1, total_rounds + 1):
        race_id = races_map.get((CURRENT_YEAR, rnd))
        if not race_id:
            continue
        for page in fetch(f"{CURRENT_YEAR}/{rnd}/constructorstandings"):
            lists = page["StandingsTable"]["StandingsLists"]
            if not lists:
                continue
            for s in lists[0]["ConstructorStandings"]:
                constructor_id = ensure_constructor(s["Constructor"], constructors_map)
                pos = s.get("position", "")
                rows.append({
                    "constructorStandingsId": cs_id_start,
                    "raceId": race_id,
                    "constructorId": constructor_id,
                    "points": float(s.get("points", 0)),
                    "position": int(pos) if pos.isdigit() else None,
                    "positionText": s.get("positionText", pos),
                    "wins": int(s.get("wins", 0)),
                })
                cs_id_start += 1
    return rows


def fetch_pitstops(drivers_map, races_map):
    """Fetch pit stops for current season."""
    rows = []
    total_rounds = 0
    for page in fetch(f"{CURRENT_YEAR}/results"):
        for race in page["RaceTable"]["Races"]:
            rnd = int(race["round"])
            if rnd > total_rounds:
                total_rounds = rnd

    for rnd in range(1, total_rounds + 1):
        race_id = races_map.get((CURRENT_YEAR, rnd))
        if not race_id:
            continue
        try:
            for page in fetch(f"{CURRENT_YEAR}/{rnd}/pitstops"):
                for race in page["RaceTable"]["Races"]:
                    for p in race.get("PitStops", []):
                        ref = p["driverId"]
                        driver_id = drivers_map.get(ref)
                        if not driver_id:
                            continue
                        rows.append({
                            "raceId": race_id,
                            "driverId": driver_id,
                            "stop": int(p.get("stop", 0)),
                            "lap": int(p.get("lap", 0)),
                            "time": p.get("time"),
                            "duration": p.get("duration"),
                            "milliseconds": int(float(p["duration"]) * 1000) if p.get("duration") and p["duration"].replace(".", "").isdigit() else None,
                        })
        except Exception as e:
            log.warning(f"Pitstop error round {rnd}: {e}")
    return rows


def fetch_constructor_results(constructors_map, races_map):
    """Build constructor results from race results."""
    rows = []
    cr_id_start = list(client.query(
        f"SELECT COALESCE(MAX(constructorResultsId), 0) AS max_id FROM `{PROJECT_ID}.{DATASET}.constructor_results`"
    ).result())[0].max_id + 1

    for page in fetch(f"{CURRENT_YEAR}/results"):
        for race in page["RaceTable"]["Races"]:
            rnd = int(race["round"])
            race_id = races_map.get((CURRENT_YEAR, rnd))
            if not race_id:
                continue
            # Aggregate points per constructor per race
            cons_points = {}
            for res in race.get("Results", []):
                cons_ref = res["Constructor"]["constructorId"]
                cons_id = constructors_map.get(cons_ref)
                if not cons_id:
                    continue
                pts = float(res.get("points", 0))
                if cons_id not in cons_points:
                    cons_points[cons_id] = 0
                cons_points[cons_id] += pts

            for cons_id, pts in cons_points.items():
                rows.append({
                    "constructorResultsId": cr_id_start,
                    "raceId": race_id,
                    "constructorId": cons_id,
                    "points": pts,
                    "status": None,
                })
                cr_id_start += 1
    return rows


# ============ Write to BigQuery ============
def merge_and_write(table, new_rows, race_ids_current):
    """Replace current season data in table, keep historical."""
    if not new_rows:
        log.info(f"  Skip {table}: no new data")
        return

    # Get historical data (everything except current season)
    race_ids_str = ",".join(str(r) for r in race_ids_current)
    query = f"SELECT * FROM `{PROJECT_ID}.{DATASET}.{table}` WHERE raceId NOT IN ({race_ids_str})"
    historical_df = client.query(query).to_dataframe()

    # Combine
    new_df = pd.DataFrame(new_rows)
    # Align types
    for col in new_df.columns:
        if col in historical_df.columns:
            try:
                new_df[col] = new_df[col].astype(historical_df[col].dtype)
            except (ValueError, TypeError):
                pass
    full_df = pd.concat([historical_df, new_df], ignore_index=True)

    # Write back with TRUNCATE
    table_id = f"{PROJECT_ID}.{DATASET}.{table}"
    client.load_table_from_dataframe(
        full_df, table_id,
        job_config=bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        )
    ).result()
    log.info(f"  -> {table}: {len(historical_df)} historical + {len(new_rows)} new = {len(full_df)} total")


# ============ Main ============
def main():
    log.info(f"=== F1 Weekly Update: {CURRENT_YEAR} season ===")

    drivers_map, constructors_map, races_map, race_ids_current, statuses_map = build_mappings()

    if not race_ids_current:
        log.info("No races found for current season. Exiting.")
        return

    log.info("Fetching results...")
    results = fetch_results(drivers_map, constructors_map, races_map, statuses_map)
    merge_and_write("results", results, race_ids_current)

    log.info("Fetching qualifying...")
    qualifying = fetch_qualifying(drivers_map, constructors_map, races_map)
    merge_and_write("qualifying", qualifying, race_ids_current)

    log.info("Fetching sprint results...")
    sprint = fetch_sprint(drivers_map, constructors_map, races_map, statuses_map)
    merge_and_write("sprint_results", sprint, race_ids_current)

    log.info("Fetching constructor results...")
    cons_results = fetch_constructor_results(constructors_map, races_map)
    merge_and_write("constructor_results", cons_results, race_ids_current)

    log.info("Fetching driver standings...")
    d_standings = fetch_driver_standings(drivers_map, races_map)
    merge_and_write("driver_standings", d_standings, race_ids_current)

    log.info("Fetching constructor standings...")
    c_standings = fetch_constructor_standings(constructors_map, races_map)
    merge_and_write("constructor_standings", c_standings, race_ids_current)

    log.info("Fetching pit stops...")
    pitstops = fetch_pitstops(drivers_map, races_map)
    merge_and_write("pit_stops", pitstops, race_ids_current)

    log.info(f"=== DONE ===")


if __name__ == "__main__":
    main()
