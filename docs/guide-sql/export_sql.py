# -*- coding: utf-8 -*-
"""Écrit toutes les requêtes du guide dans un fichier SQL de validation (chacune annulée par ROLLBACK)."""
import sys
from content import QUERIES

out = ["\\set ON_ERROR_STOP on",
       "-- colonne présente sur Supabase mais absente du stub de test",
       "alter table auth.users add column if not exists last_sign_in_at timestamptz;"]
n = 0
for section, items in QUERIES.items():
    for title, _expl, sql, _kind in items:
        n += 1
        out.append(f"\\echo '[{n}] {section} : {title.replace(chr(39), ' ')}'")
        if sql.lstrip().lower().startswith("begin"):
            out.append(sql)
        else:
            out.append("begin;")
            out.append(sql)
            out.append("rollback;")
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(out) + "\n\\echo 'TOUTES LES REQUETES OK'\n")
print(f"{n} requêtes exportées")
