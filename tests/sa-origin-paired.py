#!/usr/bin/env python3
"""Read-only paired HTTP benchmark of Cloudflare edge vs GitHub Pages origin.

600 randomized, matched comparisons = 1,200 GET requests (default). Results are specific
to the device/network on which it is executed, public pages, and current caching state.
Does not sign in, write student data, or test Supabase API throughput.
"""
import collections
import csv
import datetime
import json
import math
import os
import random
import statistics
import subprocess
import tempfile
import time
import urllib.parse

HOST = "snabilalwahy.com"
ORIGIN_IP = "185.199.108.153"
SEED = 14481022
ROUTES = [
    ("root", "/", "html"),
    ("welcome", "/welcome.html", "html"),
    ("manifest", "/manifest.webmanifest", "config"),
    ("service_worker", "/sanabil-offline-sw.js", "config"),
    ("offline_app", "/sanabil-offline-app.js", "static"),
    ("mobile_css", "/mobile-v11.css", "static"),
    ("honor_roll", "/sanabil-honor-roll.js", "static"),
    ("performance_deep", "/sanabil-performance-deep.js", "static"),
    ("live_main_large", "/sanabil-live-v12.js", "large"),
    ("fixes_large", "/fixes.js", "large"),
    ("identity_css_large", "/sanabil-identity.css", "large"),
    ("guardian_large", "/guardian.html", "large"),
]
TRIALS_PER_ROUTE = int(os.environ.get('SANABIL_PAIRS_PER_ROUTE', '50'))
if not 1 <= TRIALS_PER_ROUTE <= 50:
    raise SystemExit('SANABIL_PAIRS_PER_ROUTE must be 1-50')
DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36"
MOBILE_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/155.0.0.0 Mobile Safari/537.36"
rng = random.Random(SEED)


def pct(values, percent):
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, max(0, math.ceil(len(ordered) * percent / 100) - 1))], 2)


def median(values):
    return round(statistics.median(values), 2) if values else None


def request(route, mode, user_agent, side):
    url = f"https://{HOST}{route}"
    cmd = ["curl", "-sS", "-L", "--max-redirs", "2", "--proto", "=https",
           "--connect-timeout", "6", "--max-time", "18", "--compressed",
           "--noproxy", "*", "-A", user_agent, "-o", os.devnull,
           "-w", "%{time_starttransfer}|%{time_total}|%{http_code}|%{size_download}|%{remote_ip}"]
    if side == "origin":
        cmd += ["--resolve", f"{HOST}:443:{ORIGIN_IP}"]
    if mode == "revalidate":
        cmd += ["-H", "Cache-Control: no-cache"]
    with tempfile.NamedTemporaryFile(prefix="edge-headers-", delete=False) as f:
        header_path = f.name
    cmd += ["-D", header_path, url]
    start = time.monotonic()
    try:
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=22)
        elapsed = time.monotonic() - start
        parts = completed.stdout.strip().split("|")
        hdr = open(header_path, "r", encoding="iso-8859-1").read().lower()
        latest = hdr.split("\r\n\r\n")[-2] if "\r\n\r\n" in hdr else hdr
        status_vals = [line.strip().split(":", 1)[1].strip() for line in hdr.splitlines()
                       if line.lower().startswith("cf-cache-status:")]
        cache = status_vals[-1] if status_vals else "not-edge"
        code = int(parts[2]) if len(parts) >= 3 and parts[2].isdigit() else 0
        return {"ttfb_ms": round(float(parts[0]) * 1000, 3) if len(parts) >= 1 else None,
                "total_ms": round(float(parts[1]) * 1000, 3) if len(parts) >= 2 else None,
                "code": code, "bytes": int(float(parts[3])) if len(parts) >= 4 else 0,
                "remote_ip": parts[4] if len(parts) >= 5 else "", "cf_cache": cache,
                "curl_exit": completed.returncode,
                "failure": completed.stderr.strip()[:140] if completed.returncode else "",
                "subprocess_elapsed_s": round(elapsed, 3)}
    except Exception as e:
        return {"ttfb_ms": None, "total_ms": None, "code": 0, "bytes": 0,
                "remote_ip": "", "cf_cache": "unknown", "curl_exit": -1,
                "failure": str(e)[:140], "subprocess_elapsed_s": None}
    finally:
        os.unlink(header_path)


def summarize(rows):
    valid = [x for x in rows if x["edge_code"] == 200 and x["origin_code"] == 200
             and x["edge_total_ms"] is not None and x["origin_total_ms"] is not None]
    out = {"paired_trials": len(rows), "valid_pairs": len(valid),
           "edge_errors": sum(x["edge_code"] != 200 for x in rows),
           "origin_errors": sum(x["origin_code"] != 200 for x in rows),
           "edge_cache_status": dict(collections.Counter(x["edge_cf_cache"] for x in rows))}
    if not valid:
        return out
    for metric in ["ttfb_ms", "total_ms"]:
        a = [x["edge_" + metric] for x in valid]
        b = [x["origin_" + metric] for x in valid]
        delta = [bb - aa for aa, bb in zip(a, b)]
        positive = sum(d > 0 for d in delta)
        out[metric] = {
            "edge_median_ms": median(a), "origin_median_ms": median(b),
            "edge_p95_ms": pct(a, 95), "origin_p95_ms": pct(b, 95),
            "edge_mean_ms": round(statistics.mean(a), 2),
            "origin_mean_ms": round(statistics.mean(b), 2),
            "paired_median_saving_ms": median(delta),
            "edge_faster_pairs": positive,
            "edge_faster_pct": round(100 * positive / len(valid), 2),
            "mean_paired_saving_ms": round(statistics.mean(delta), 2),
        }
    return out


def main():
    trials = []
    for name, path, category in ROUTES:
        for n in range(TRIALS_PER_ROUTE):
            # 30 warm / 15 cache-busting URLs / 5 cache revalidation headers
            mode = "warm" if n < 30 else "cold_unique_query" if n < 45 else "revalidate"
            route = path
            if mode == "cold_unique_query":
                separator = "&" if "?" in path else "?"
                route += separator + urllib.parse.urlencode({"bench": f"cf-{SEED}-{name}-{n}"})
            trials.append({"name": name, "category": category, "path": route,
                           "mode": mode, "ua": "mobile" if n % 2 else "desktop"})
    rng.shuffle(trials)
    output = []
    for idx, trial in enumerate(trials, 1):
        sides = ("edge", "origin") if idx % 2 else ("origin", "edge")
        results = {}
        for side in sides:
            results[side] = request(trial["path"], trial["mode"],
                                    MOBILE_UA if trial["ua"] == "mobile" else DESKTOP_UA, side)
        row = {"id": idx, **trial}
        for side in ("edge", "origin"):
            row.update({side + "_" + key: value for key, value in results[side].items()})
        output.append(row)
        if idx % 50 == 0:
            print(f"Progress: {idx}/{len(trials)} matched pairs ({idx * 2} HTTP GETs)", flush=True)
        time.sleep(rng.uniform(0.015, 0.045))
    with open("sa-compare-pairs.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=output[0].keys())
        w.writeheader()
        w.writerows(output)
    summary = {"timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "runner": os.environ.get("RUNNER_NAME", "local-device"),
               "origin_ipv4": ORIGIN_IP,
               "methodology": f"{len(trials)} randomized paired cases ({len(trials)*2} public GETs) from this device/network; same HTTPS Host/SNI, origin bypassed using curl --resolve; {len(ROUTES)} routes x {TRIALS_PER_ROUTE} cases; standard warm/cold/revalidation cases when 50 per route; user agents balanced; order alternated",
               "overall": summarize(output),
               "by_category": {cat: summarize([x for x in output if x["category"] == cat]) for cat in ["html", "config", "static", "large"]},
               "by_mode": {mode: summarize([x for x in output if x["mode"] == mode]) for mode in ["warm", "cold_unique_query", "revalidate"]},
               "by_route": {route[0]: summarize([x for x in output if x["name"] == route[0]]) for route in ROUTES},
               "status_counts": {"edge": dict(collections.Counter(x["edge_code"] for x in output)),
                                 "origin": dict(collections.Counter(x["origin_code"] for x in output))},
               "limitations": ["Measures public static web traffic, not authenticated teacher actions or Supabase throughput.",
                               "Results describe this local device or network, not all Saudi operators or devices.",
                               "Direct GitHub origin pin is a same-time counterfactual, not an observed before-Cloudflare historical baseline.",
                               "Cache-busting and revalidate request variants approximate HTTP scenarios, not a full browser navigation."]}
    with open("sa-compare-summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print("BENCHMARK_SUMMARY_BEGIN", flush=True)
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True), flush=True)
    print("BENCHMARK_SUMMARY_END", flush=True)
    if summary["overall"]["valid_pairs"] < min(500,len(trials)):
        raise SystemExit("Insufficient valid paired comparisons: incomplete benchmark")


if __name__ == "__main__":
    main()
