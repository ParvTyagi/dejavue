"""Redact Supabase signed URLs (plain or percent-encoded) from fixtures, then scan. Exit 1 if anything remains."""
import glob, os, re, sys

ROOT = r"C:\Users\legen\Downloads\DejaVue"
os.chdir(ROOT)
env = {}
for line in open(".env.local", encoding="utf-8"):
    m = re.match(r"^([A-Z_]+)=(.+)$", line.strip())
    if m: env[m.group(1)] = m.group(2).strip()
ref = re.search(r"https://([a-z0-9]+)\.supabase\.co", env["SUPABASE_URL"]).group(1)
secrets = [env[k] for k in ("SERPAPI_API_KEY", "SUPABASE_SECRET_KEY", "GEMINI_API_KEY") if env.get(k)]

# URL in any encoding: http(s) + (: or %3A) + (// or %2F%2F) + host, then everything up to a quote, whitespace or backslash
url_pat = re.compile(r"https?(?::|%3A)(?://|%2F%2F)[a-z0-9]+\.supabase\.co[^\"\s\\]*", re.I)
jwt_pat = re.compile(r"eyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){0,2}")

files = glob.glob("fixtures/**/*.json", recursive=True)
if "--apply" in sys.argv:
    for f in files:
        s = open(f, encoding="utf-8").read()
        t, c1 = url_pat.subn("<redacted-signed-url>", s)
        t, c2 = jwt_pat.subn("<redacted-jwt>", t)
        t = t.replace(ref, "<redacted-project>")
        if t != s:
            open(f, "w", encoding="utf-8").write(t)
            print(f"redacted {f}: urls={c1} jwts={c2}")

bad = 0
for f in files + glob.glob("scripts/*"):
    s = open(f, encoding="utf-8").read()
    reasons = []
    if any(x in s for x in secrets): reasons.append("api secret")
    if ref in s: reasons.append("project ref")
    if jwt_pat.search(s): reasons.append("jwt")
    if re.search(r"(?:token|api_key)(?:=|%3D)(?!<redacted)[^\"&<%\s]{8,}", s): reasons.append("token param")
    if reasons: print("FLAGGED", f, reasons); bad += 1
print("scan issues:", bad)
sys.exit(1 if bad else 0)
