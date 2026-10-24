#!/usr/bin/env python3
"""Bouwt de demo (demo/index.html) uit de gebouwde app (index.html).

Draaien, ná build.py:  python3 bron/build_demo.py

De demo is dezelfde app, met vóór alle andere code:
  - bron/demo/demo-backend.js   eigen opslag + een database in het geheugen (zie de uitleg daar)
  - bron/test/fakefb-page.js    de nagemaakte Firebase uit de tests
  - de voorbeeldrecepten uit bron/demo/recepten-demo.json
Er gaat niets naar Firebase en er staan geen echte recepten, namen of notities in.
Bewerken, toevoegen en beheren zijn verborgen; het kookboek is alleen-lezen.
"""
import json
import pathlib
import re
import shutil
import urllib.parse

hier = pathlib.Path(__file__).resolve().parent
root = hier.parent
uit_map = root / "demo"

app = (root / "index.html").read_text(encoding="utf-8")
data = json.loads((hier / "demo" / "recepten-demo.json").read_text(encoding="utf-8"))
backend = (hier / "demo" / "demo-backend.js").read_text(encoding="utf-8")
fakefb = (hier / "test" / "fakefb-page.js").read_text(encoding="utf-8")

# ── ingrediënten in het formaat van de database: {q, u, n}, zoals parseIng() in de app ──
EENHEDEN = {"g", "kg", "ml", "l", "el", "tl", "snufje", "teentje", "teentjes", "blik", "potje", "handje", "scheutje", "zakjes"}
NAAR = {"teentjes": "teentje", "zakjes": "zakje"}


def ing(regel):
    m = re.match(r"^(\d+(?:[.,]\d+)?)\s+(\S+)\s+(.*)$", regel)
    if m and m.group(2) in EENHEDEN:
        return {"q": float(m.group(1).replace(",", ".")), "u": NAAR.get(m.group(2), m.group(2)), "n": m.group(3)}
    m = re.match(r"^(\d+(?:[.,]\d+)?)\s+(.*)$", regel)
    if m:
        return {"q": float(m.group(1).replace(",", ".")), "u": "", "n": m.group(2)}
    return {"q": None, "u": "", "n": regel}


EMOJI = {"Bakgerechten": "🧁", "Bijgerecht": "🥗", "Dips en Sauzen": "🥣", "Drankjes": "🥤", "Hoofdgerecht": "🍲",
         "Lunch": "🥪", "Nagerecht": "🍰", "Ontbijt": "🥣", "Voorgerecht": "🍜"}


def foto(r):
    """Een eenvoudige getekende 'foto': kleurverloop met de emoji van het type."""
    k = r["kleur"]
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">'
           f'<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">'
           f'<stop offset="0" stop-color="{k}" stop-opacity=".55"/><stop offset="1" stop-color="{k}"/></linearGradient></defs>'
           f'<rect width="800" height="600" fill="url(#a)"/>'
           f'<circle cx="400" cy="300" r="170" fill="#fff" fill-opacity=".18"/>'
           f'<text x="400" y="300" font-size="190" text-anchor="middle" dominant-baseline="central">{EMOJI.get(r["type"], "🍽️")}</text></svg>')
    return "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(svg)


DAG = 864e5
NU = 1791000000000  # vast moment (okt. 2026), zodat elke build dezelfde demo oplevert
docs = {}
for i, r in enumerate(data["recepten"]):
    t = NU - (len(data["recepten"]) - i) * 3 * DAG
    docs["recipes/" + r["id"]] = {
        "titel": r["titel"], "type": r["type"], "tijd": r["tijd"], "porties": r["porties"],
        "foto": foto(r), "url": "", "bron": "Demo",
        "ingredienten": [ing(x) for x in r["ingredienten"]], "stappen": r["stappen"],
        "benodigdheden": r.get("benodigdheden", []), "tags": r.get("tags", []),
        "createdBy": r["door"], "updatedBy": r["door"],
        "createdAt": {"__ts": t}, "updatedAt": {"__ts": t},
    }
docs["gezin/leden"] = dict(data["gezin"])
for uid, g in data["gedeeld"].items():
    docs["gedeeld/" + uid] = {"naam": data["gezin"][uid], **g, "updatedAt": {"__ts": NU}}
    docs["users/" + uid] = {"naam": data["gezin"][uid]}

KOP = """<meta name="robots" content="noindex">
<script>window.__DEMO_DOCS=%s;</script>
<script>%s</script>
<script>%s</script>
<style>
/* Demo: alleen bekijken — alles wat het kookboek wijzigt of beheert is weg */
#addRecipe,#addRecipe2,#dedit,#dphoto,#dphotodel,#drestore,#logoutBtn,#openAdmin,#adminBox,#syncNow,
.box:has(#addRecipe2),.box:has(#doImport),.box:has(#logoutBtn){display:none!important}
#demoPil{position:fixed;left:50%%;transform:translateX(-50%%);bottom:calc(74px + env(safe-area-inset-bottom));z-index:900;
  background:#2f5d50;color:#fff;font:600 13px/1.2 system-ui,-apple-system,sans-serif;padding:7px 14px;border-radius:999px;
  box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap;border:0;cursor:pointer}
body:has(#detail.open) #demoPil,body:has(#editor.open) #demoPil{display:none}
#demoUitleg{position:fixed;inset:0;z-index:950;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
#demoUitleg[hidden]{display:none}
#demoUitleg div{background:#fff;color:#222;max-width:420px;border-radius:16px;padding:20px 20px 16px;font:15px/1.45 system-ui,-apple-system,sans-serif}
#demoUitleg h3{margin:0 0 8px;font-size:18px}
#demoUitleg p{margin:0 0 10px}
#demoUitleg button{background:#2f5d50;color:#fff;border:0;border-radius:10px;padding:10px 16px;font:600 15px system-ui,sans-serif;width:100%%}
</style>
"""

STAART = """<button id="demoPil" type="button">Demo · view only — tap for info</button>
<div id="demoUitleg" hidden><div>
<h3>Recipes — demo</h3>
<p>This is Robert's family recipe app with made-up example recipes and family members (Anna, Tom, Sophie).
The real app holds the family's own recipes and needs a login.</p>
<p>You can browse, search by ingredients (try <i>tomaat, feta</i>), open cooking mode, add things to your
favourites and shopping list, and make a PDF cookbook. The cookbook itself is read-only, and everything you do
stays in this browser only.</p>
<p style="font-size:13px;color:#666">De app zelf is in het Nederlands.</p>
<button type="button" id="demoOk">Got it</button></div></div>
<script>(()=>{const u=document.getElementById("demoUitleg");const toon=v=>{u.hidden=!v};
document.getElementById("demoPil").onclick=()=>toon(true);document.getElementById("demoOk").onclick=()=>{toon(false);try{localStorage.setItem("demoGezien","1")}catch(e){}};
u.onclick=e=>{if(e.target===u)toon(false)};try{if(!localStorage.getItem("demoGezien"))toon(true)}catch(e){toon(true)}})();</script>
"""

kop = KOP % (json.dumps(docs, ensure_ascii=False), backend, fakefb)
merk = '<meta charset="utf-8">'
i = app.lower().find(merk)
if i < 0:
    raise SystemExit("<meta charset> niet gevonden in index.html")
i += len(merk)
demo = app[:i] + "\n" + kop + app[i:]
demo = demo.replace("<title>Recepten</title>", "<title>Recepten — demo</title>", 1)
if "</body>" not in demo:
    raise SystemExit("</body> niet gevonden in index.html")
demo = demo.replace("</body>", STAART + "</body>", 1)

uit_map.mkdir(exist_ok=True)
(uit_map / "index.html").write_text(demo, encoding="utf-8")
# eigen versiebestand, zodat de demo zijn eigen versie vergelijkt (niet die van de echte app)
shutil.copy(root / "version.json", uit_map / "version.json")
manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
manifest.update({"name": "Recepten — demo", "short_name": "Recepten demo"})
for ic in manifest.get("icons", []):
    ic["src"] = "../" + ic["src"]
(uit_map / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"demo/index.html geschreven — {len(data['recepten'])} voorbeeldrecepten, {len(demo):,} tekens".replace(",", "."))
