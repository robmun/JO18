#!/usr/bin/env python3
"""Bouwt index.html (de app) uit bron/src.html.

Draaien:  python3 bron/build.py
De twee iconen worden als base64 in de pagina gezet, zodat index.html
één bestand is dat ook zonder internet volledig werkt.
"""
import base64
import pathlib

hier = pathlib.Path(__file__).resolve().parent
tekst = (hier / "src.html").read_text(encoding="utf-8")

for merk, bestand in (("__ATI__", "apple-touch-icon.png"), ("__FAV__", "favicon.png")):
    data = base64.b64encode((hier / bestand).read_bytes()).decode()
    if merk not in tekst:
        raise SystemExit(f"Merkteken {merk} niet gevonden in src.html")
    tekst = tekst.replace(merk, data)

uit = hier.parent / "index.html"
uit.write_text(tekst, encoding="utf-8")
print(f"{uit} geschreven — {len(tekst):,} tekens".replace(",", "."))
