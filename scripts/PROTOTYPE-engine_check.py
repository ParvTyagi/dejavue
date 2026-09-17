"""Bing + Yandex check. Usage: python engine_check.py <caseId> [...]. 2 credits per case. Never prints secrets."""
import hashlib, json, os, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lens_check as L

ENGINES = [
    ("bing_reverse_image", "image_url", {"mkt": "en-US"}),
    ("yandex_images", "url", {"tab": "about"}),
]

def walk_items(res):
    """Yield (section, item) for every list of dicts in the response that looks like results."""
    for k, v in res.items():
        if k in ("search_metadata", "search_parameters", "search_information", "serpapi_pagination", "pagination"): continue
        if isinstance(v, list) and v and isinstance(v[0], dict):
            for it in v: yield k, it
        elif isinstance(v, dict):
            for k2, v2 in v.items():
                if isinstance(v2, list) and v2 and isinstance(v2[0], dict):
                    for it in v2: yield f"{k}.{k2}", it

def run(case):
    data = open(os.path.join(L.ROOT, "test-images", L.CASES[case]), "rb").read()
    sha = hashlib.sha256(data).hexdigest(); in_hash = L.phash(data)
    path = f"engine-check/{sha[:16]}.jpg"
    rep = {"case": case, "engines": {}}
    st, body, _ = L.req("POST", f"{L.SU}/storage/v1/object/upload/sign/{L.BUCKET}/{path}", b"{}",
                        L.sb_headers({"Content-Type": "application/json", "x-upsert": "true"}))
    if st != 200: rep["error"] = f"upload sign HTTP {st}"; return rep
    st, _, _ = L.req("PUT", f"{L.SU}/storage/v1{json.loads(body)['url']}", data, {"Content-Type": "image/jpeg", "x-upsert": "true"})
    if st not in (200, 201): rep["error"] = f"PUT HTTP {st}"; return rep
    st, body, _ = L.req("POST", f"{L.SU}/storage/v1/object/sign/{L.BUCKET}/{path}", json.dumps({"expiresIn": 900}).encode(),
                        L.sb_headers({"Content-Type": "application/json"}))
    signed = f"{L.SU}/storage/v1{json.loads(body)['signedURL']}"
    st, got, _ = L.req("GET", signed, headers={"User-Agent": L.UA})
    rep["signed_identical"] = st == 200 and got == data
    fx_dir = os.path.join(L.ROOT, "fixtures", case); os.makedirs(os.path.join(fx_dir, "thumbs"), exist_ok=True)

    for engine, url_param, extra in ENGINES:
        params = {"engine": engine, url_param: signed, **extra, "api_key": L.SA}
        t0 = time.time()
        st, body, _ = L.req("GET", "https://serpapi.com/search.json?" + urllib.parse.urlencode(params), timeout=120)
        e = {"http": st, "ms": int((time.time() - t0) * 1000)}
        try: res = json.loads(body)
        except Exception: e["error"] = "non-JSON"; rep["engines"][engine] = e; continue
        e["status"] = res.get("search_metadata", {}).get("status"); e["error"] = res.get("error")
        e["top_keys"] = [k for k in res.keys() if k not in ("search_metadata", "search_parameters")]
        key = hashlib.sha256(json.dumps({"engine": engine, **extra, "image_sha256": sha}, sort_keys=True).encode()).hexdigest()[:16]
        fx = L.scrub(res); fx["_dejavue"] = {"recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "image_sha256": sha,
                                            "input_phash": f"{in_hash:016x}", "note": f"{url_param} was a 15-minute Supabase signed URL (token redacted)"}
        f = os.path.join(fx_dir, f"{engine}-{key}.json"); json.dump(fx, open(f, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        e["fixture"] = os.path.relpath(f, L.ROOT)
        sections = {}; items = []
        for sec, it in walk_items(res):
            sections[sec] = sections.get(sec, 0) + 1
            items.append((sec, it))
        e["sections"] = sections
        e["item_keys"] = {sec: sorted({k for s2, it in items if s2 == sec for k in it.keys()}) for sec in sections}
        rows = []; checked = 0
        for sec, it in items:
            thumb = it.get("thumbnail") or it.get("image")
            if isinstance(thumb, dict): thumb = thumb.get("link") or thumb.get("url")
            row = {"sec": sec, "link": it.get("link") or it.get("url"), "source": it.get("source") or it.get("domain") or it.get("displayed_link"),
                   "title": (it.get("title") or "")[:90], "date": it.get("date")}
            if isinstance(thumb, str) and thumb.startswith("http") and checked < 8:
                checked += 1
                s2, tb, _ = L.req("GET", thumb, headers={"User-Agent": L.UA}, timeout=10)
                if s2 == 200:
                    tn = hashlib.sha256(thumb.encode()).hexdigest()[:16] + ".jpg"
                    open(os.path.join(fx_dir, "thumbs", tn), "wb").write(tb)
                    try: row["hamming"] = L.hamming(in_hash, L.phash(tb))
                    except Exception: row["hamming"] = None
            rows.append(row)
        e["rows"] = rows
        rep["engines"][engine] = e
    L.cleanup(path, signed, rep)
    return rep

if __name__ == "__main__":
    before = L.credits_left()
    out = {"credits_before": before, "reports": [run(c) for c in sys.argv[1:]], "credits_after": L.credits_left()}
    txt = json.dumps(out, indent=2, ensure_ascii=False)
    for s in L.SECRETS: txt = txt.replace(s, "<redacted>")
    open(os.path.join(L.ROOT, "fixtures", "engine_report_" + "_".join(sys.argv[1:])[:60] + ".json"), "w", encoding="utf-8").write(txt)
    print("done")
