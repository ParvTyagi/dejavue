"""Lens check for the wayfinder ticket. Usage: python lens_check.py <caseId> [<caseId> ...]
Never prints secrets. Spends 1 SerpApi credit per case (only if Supabase steps succeed)."""
import hashlib, io, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
import numpy as np
from PIL import Image

ROOT = r"C:\Users\legen\Downloads\DejaVue"
CASES = {
    "c1-kharkiv-prayer": "c1-kharkiv-prayer.jpg",
    "c2-uttarakhand-flood": "c2-uttarakhand-flood.jpg",
    "c3-japan-tsunami": "c3-japan-tsunami-frame.jpg",
    "c6-kolkata-lathicharge": "c6-kolkata-lathicharge-frame.jpg",
}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"

env = {}
for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
    m = re.match(r"^([A-Z_]+)=(.*)$", line.strip())
    if m: env[m.group(1)] = m.group(2).strip()
SU, SK, BUCKET, SA = env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"], env["SUPABASE_BUCKET"], env["SERPAPI_API_KEY"]
SECRETS = [SK, SA]

def req(method, url, data=None, headers=None, timeout=60):
    r = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)

def sb_headers(extra=None):
    h = {"apikey": SK, "Authorization": f"Bearer {SK}"}
    h.update(extra or {}); return h

def phash(img_bytes):
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    a = np.asarray(im, dtype=np.float64)
    g = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    g = np.asarray(Image.fromarray(g).resize((32, 32), Image.BOX), dtype=np.float64)
    n = 32; k = np.arange(n)
    basis = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n))
    d = basis @ g @ basis.T
    block = d[:8, :8].flatten()[1:]
    med = np.median(block)
    bits = [1 if c > med else 0 for c in d[:8, :8].flatten()]
    bits[0] = 0
    return int("".join(map(str, bits)), 2)

def hamming(a, b): return bin(a ^ b).count("1")

def scrub(obj):
    """Remove search ids and anything carrying a key or signed token."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in ("id", "json_endpoint", "raw_html_file", "prettify_html_file") and isinstance(v, str):
                continue
            out[k] = scrub(v)
        return out
    if isinstance(obj, list): return [scrub(x) for x in obj]
    if isinstance(obj, str):
        for s in SECRETS:
            if s and s in obj: obj = obj.replace(s, "<redacted>")
        obj = re.sub(r"([?&](api_key|token)=)[^&\"]+", r"\1<redacted>", obj)
        # engines echo the input image URL inside their own links, sometimes percent-encoded
        obj = re.sub(r"https?(?::|%3A)(?://|%2F%2F)[a-z0-9]+\.supabase\.co[^\"\s\\]*", "<redacted-signed-url>", obj, flags=re.I)
        return obj
    return obj

def run(case):
    local = os.path.join(ROOT, "test-images", CASES[case])
    data = open(local, "rb").read()
    sha = hashlib.sha256(data).hexdigest()
    in_hash = phash(data)
    path = f"lens-check/{sha[:16]}.jpg"
    rep = {"case": case, "bytes": len(data), "sha256": sha, "phash": f"{in_hash:016x}"}

    # 1. signed upload URL + PUT
    st, body, _ = req("POST", f"{SU}/storage/v1/object/upload/sign/{BUCKET}/{path}", b"{}",
                      sb_headers({"Content-Type": "application/json", "x-upsert": "true"}))
    if st != 200: rep["error"] = f"createSignedUploadUrl HTTP {st}: {body[:200]!r}"; return rep
    up_url = f"{SU}/storage/v1{json.loads(body)['url']}"
    st, body, _ = req("PUT", up_url, data, {"Content-Type": "image/jpeg", "x-upsert": "true"})
    if st not in (200, 201): rep["error"] = f"signed PUT HTTP {st}: {body[:200]!r}"; return rep

    # 2. 15-minute signed GET URL
    st, body, _ = req("POST", f"{SU}/storage/v1/object/sign/{BUCKET}/{path}", json.dumps({"expiresIn": 900}).encode(),
                      sb_headers({"Content-Type": "application/json"}))
    if st != 200: rep["error"] = f"createSignedUrl HTTP {st}: {body[:200]!r}"; return rep
    signed = f"{SU}/storage/v1{json.loads(body)['signedURL']}"
    rep["signed_url_len"] = len(signed)

    # 3. free check: bytes identical when fetched anonymously
    st, got, hdr = req("GET", signed, headers={"User-Agent": UA})
    rep["signed_get"] = {"status": st, "identical_bytes": got == data, "content_type": hdr.get("Content-Type")}
    if st != 200 or got != data: rep["error"] = "signed GET did not return identical bytes"; cleanup(path, signed, rep); return rep

    # 4. SerpApi google_lens (1 credit)
    params = {"engine": "google_lens", "type": "exact_matches", "url": signed, "api_key": SA}
    t0 = time.time()
    st, body, _ = req("GET", "https://serpapi.com/search.json?" + urllib.parse.urlencode(params), timeout=90)
    rep["lens_ms"] = int((time.time() - t0) * 1000)
    rep["lens_http"] = st
    try: res = json.loads(body)
    except Exception: rep["error"] = f"non-JSON Lens response HTTP {st}"; cleanup(path, signed, rep); return rep
    rep["lens_status"] = res.get("search_metadata", {}).get("status")
    rep["lens_error"] = res.get("error")

    # 5. fixture: fixtures/<caseId>/google_lens-<paramsHash>.json
    #    paramsHash uses image sha256 instead of the per-audit signed URL (cache key is an open ticket).
    phash_key = hashlib.sha256(json.dumps({"engine": "google_lens", "type": "exact_matches", "image_sha256": sha}, sort_keys=True).encode()).hexdigest()[:16]
    fx_dir = os.path.join(ROOT, "fixtures", case)
    os.makedirs(os.path.join(fx_dir, "thumbs"), exist_ok=True)
    fixture = scrub(res)
    fixture["_dejavue"] = {"recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "image_sha256": sha, "input_phash": rep["phash"],
                           "note": "search_parameters.url was a 15-minute Supabase signed URL (token redacted)"}
    fx_file = os.path.join(fx_dir, f"google_lens-{phash_key}.json")
    json.dump(fixture, open(fx_file, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    rep["fixture"] = os.path.relpath(fx_file, ROOT)

    # 6. thumbnails + pHash confirmation (max 8, like design §10.3)
    matches = res.get("exact_matches", []) or []
    rep["exact_matches"] = len(matches)
    rows = []
    for i, m in enumerate(matches):
        row = {"i": i, "source": m.get("source"), "link": m.get("link"), "title": (m.get("title") or "")[:90],
               "date": m.get("date"), "has_thumbnail": bool(m.get("thumbnail"))}
        if i < 8 and m.get("thumbnail"):
            st, tb, _ = req("GET", m["thumbnail"], headers={"User-Agent": UA}, timeout=10)
            if st == 200:
                tname = hashlib.sha256(m["thumbnail"].encode()).hexdigest()[:16] + ".jpg"
                open(os.path.join(fx_dir, "thumbs", tname), "wb").write(tb)
                try:
                    h = hamming(in_hash, phash(tb)); row.update(thumb=tname, hamming=h, confirmed=h <= 10)
                except Exception as e: row.update(thumb=tname, hamming=None, confirmed=False, thumb_error=str(e)[:80])
            else: row.update(thumb_http=st, confirmed=False)
        rows.append(row)
    rep["matches"] = rows
    rep["match_keys"] = sorted({k for m in matches for k in m.keys()})
    cleanup(path, signed, rep)
    return rep

def cleanup(path, signed, rep):
    st, body, _ = req("DELETE", f"{SU}/storage/v1/object/{BUCKET}", json.dumps({"prefixes": [path]}).encode(),
                      sb_headers({"Content-Type": "application/json"}))
    st2, _, _ = req("GET", signed, headers={"User-Agent": UA})
    rep["cleanup"] = {"delete_http": st, "signed_get_after_delete": st2}

def credits_left():
    st, body, _ = req("GET", "https://serpapi.com/account.json?api_key=" + SA)
    d = json.loads(body); return d.get("total_searches_left", d.get("plan_searches_left"))

if __name__ == "__main__":
    before = credits_left()
    reports = [run(c) for c in sys.argv[1:]]
    after = credits_left()
    out = {"credits_before": before, "credits_after": after, "reports": reports}
    txt = json.dumps(out, indent=2, ensure_ascii=False)
    for s in SECRETS: txt = txt.replace(s, "<redacted>")
    rp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lens_report_" + "_".join(sys.argv[1:])[:60] + ".json")
    open(rp, "w", encoding="utf-8").write(txt)
    print(txt)
