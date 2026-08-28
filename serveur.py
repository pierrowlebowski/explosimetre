#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Serveur de l'explosimètre d'exercice.
Bibliothèque standard uniquement : aucune installation, aucun accès Internet.

Lancement :   python serveur.py
              python serveur.py 8080        (pour changer de port)

Puis, sur les téléphones du réseau :
    pupitre de contrôle  ->  http://<adresse-affichée>:8000/controle.html
    écran du détecteur   ->  http://<adresse-affichée>:8000/explo.html
"""

import json
import os
import queue
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RACINE = os.path.dirname(os.path.abspath(__file__))
FICHIER_ETAT = os.path.join(RACINE, "etat.json")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

ETAT_DEFAUT = {
    "cibles": {"h2s": 0, "co": 0, "o2": 20.9, "lel": 0},
    "seuils": {"h2s": [10, 15], "co": [35, 200], "o2": [19.5, 23.5], "lel": [10, 20]},
    "gamme": {"h2s": 100, "co": 500, "o2": 30, "lel": 100},
    "reponse": 20,
    "bruit": True,
    "raz": 0,
}

verrou = threading.Lock()
abonnes = []          # une file d'attente par page connectée
etat = json.loads(json.dumps(ETAT_DEFAUT))

# Reprise de l'état du dernier exercice, s'il existe.
if os.path.exists(FICHIER_ETAT):
    try:
        with open(FICHIER_ETAT, encoding="utf-8") as f:
            etat.update(json.load(f))
    except Exception:
        pass


def fusionner(base, ajout):
    """Fusion récursive : la page de contrôle peut n'envoyer qu'une partie de l'état."""
    for cle, valeur in ajout.items():
        if isinstance(valeur, dict) and isinstance(base.get(cle), dict):
            fusionner(base[cle], valeur)
        else:
            base[cle] = valeur


def diffuser():
    """Envoie l'état courant à toutes les pages connectées."""
    charge = json.dumps(etat, ensure_ascii=False)
    for file in list(abonnes):
        try:
            file.put_nowait(charge)
        except Exception:
            pass


def enregistrer():
    try:
        with open(FICHIER_ETAT, "w", encoding="utf-8") as f:
            json.dump(etat, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


PAGES = {"/": "index.html", "/controle": "controle.html", "/explo": "explo.html"}
TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
         ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon"}


class Gestionnaire(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass  # console silencieuse

    # ---------- utilitaires ----------
    def repondre(self, code, corps=b"", type_mime="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", type_mime)
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if corps:
            self.wfile.write(corps)

    def fichier(self, nom):
        chemin = os.path.join(RACINE, os.path.basename(nom))
        if not os.path.isfile(chemin):
            self.repondre(404, b"Page introuvable")
            return
        with open(chemin, "rb") as f:
            contenu = f.read()
        ext = os.path.splitext(chemin)[1].lower()
        self.repondre(200, contenu, TYPES.get(ext, "application/octet-stream"))

    # ---------- routes ----------
    def do_GET(self):
        chemin = self.path.split("?")[0]

        if chemin == "/api/etat":
            with verrou:
                corps = json.dumps(etat, ensure_ascii=False).encode("utf-8")
            self.repondre(200, corps, "application/json; charset=utf-8")
            return

        if chemin == "/api/flux":
            self.flux_sse()
            return

        if chemin in PAGES:
            self.fichier(PAGES[chemin])
            return

        self.fichier(chemin.lstrip("/"))

    def do_POST(self):
        if self.path.split("?")[0] != "/api/etat":
            self.repondre(404, b"Route inconnue")
            return
        taille = int(self.headers.get("Content-Length", 0))
        try:
            recu = json.loads(self.rfile.read(taille).decode("utf-8"))
        except Exception:
            self.repondre(400, b"JSON invalide")
            return
        with verrou:
            fusionner(etat, recu)
            diffuser()
            enregistrer()
        self.repondre(200, b'{"ok":true}', "application/json; charset=utf-8")

    # ---------- flux temps reel ----------
    def flux_sse(self):
        file = queue.Queue(maxsize=32)
        with verrou:
            abonnes.append(file)
            depart = json.dumps(etat, ensure_ascii=False)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        try:
            self.wfile.write(f"retry: 2000\ndata: {depart}\n\n".encode("utf-8"))
            self.wfile.flush()
            while True:
                try:
                    charge = file.get(timeout=2)
                    message = f"data: {charge}\n\n"
                except queue.Empty:
                    message = ": battement\n\n"   # maintient le voyant vert
                self.wfile.write(message.encode("utf-8"))
                self.wfile.flush()
        except Exception:
            pass
        finally:
            with verrou:
                if file in abonnes:
                    abonnes.remove(file)


def adresse_locale():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    ip = adresse_locale()
    print("\n  Explosimètre d'exercice — serveur démarré")
    print("  " + "-" * 46)
    print(f"  Pupitre de contrôle : http://{ip}:{PORT}/controle.html")
    print(f"  Écran du détecteur  : http://{ip}:{PORT}/explo.html")
    print("\n  Arrêt : Ctrl+C\n")
    try:
        ThreadingHTTPServer(("0.0.0.0", PORT), Gestionnaire).serve_forever()
    except KeyboardInterrupt:
        print("  Serveur arrêté.\n")
