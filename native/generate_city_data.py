import gzip, json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / "assets" / "data" / "cities15000.json.gz"
target = root / "native" / "ui" / "cities.js"
with gzip.open(source, "rt", encoding="utf-8") as stream:
    rows = json.load(stream)
# id, English, Russian, country, IANA, aliases, population, WGS84 latitude/longitude
if any(len(row) < 9 for row in rows):
    raise RuntimeError("City source is missing WGS84 coordinates")
payload = [[f"{r[4]}@@{r[0]}", r[1], r[2], r[3], r[5], r[6], r[7], r[8]] for r in rows]
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text("window.CITIES=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
