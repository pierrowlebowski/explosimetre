#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Serveur de secours de l'explosimètre d'exercice.
Bibliothèque standard uniquement : aucune installation, aucun accès internet.

Il ne connaît ni les gaz ni les seuils : il ne fait que relayer, en direct, ce
que le pupitre lui envoie. Tous les réglages vivent dans js/config.js.

Lancement :   python serveur.py
              python serveur.py 8080        (pour changer de port)
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

verrou = threading.Lock()
abonnes = []          # une file d'attente par page connectée
etat = {}             # rempli par le pupitre au premier réglage

# Reprise de l'état du dernier exercice, s'il existe.
if os.path.exists(FICHIER_ETAT):
    try:
        with open(FICHIER_ETAT, encoding="utf-8") as f:
            etat = json.load(f)
    except Exception:
        etat = {}


def fusionner(base, ajout):
    """Fusion récursive : le pupitre peut n'envoyer qu'une partie de l'état."""
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
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}
DOSSIERS_AUTORISES = {"", "css", "js"}


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

    def fichier(self, chemin_demande):
        """Sert un fichier de la racine, de css/ ou de js/ — et rien d'autre."""
        morceaux = [m for m in chemin_demande.strip("/").split("/") if m not in ("", ".", "..")]
        if not morceaux or len(morceaux) > 2:
            return self.repondre(404, b"Page introuvable")
        dossier = morceaux[0] if len(morceaux) == 2 else ""
        if dossier not in DOSSIERS_AUTORISES:
            return self.repondre(404, b"Page introuvable")

        chemin = os.path.join(RACINE, *morceaux)
        ext = os.path.splitext(chemin)[1].lower()
        if ext not in TYPES or not os.path.isfile(chemin):
            return self.repondre(404, b"Page introuvable")

        with open(chemin, "rb") as f:
            contenu = f.read()
        self.repondre(200, contenu, TYPES[ext])

    # ---------- routes ----------
    def do_GET(self):
        chemin = self.path.split("?")[0]

        if chemin == "/api/etat":
            with verrou:
                corps = json.dumps(etat, ensure_ascii=False).encode("utf-8")
            return self.repondre(200, corps, "application/json; charset=utf-8")

        if chemin == "/api/flux":
            return self.flux_sse()

        if chemin in PAGES:
            return self.fichier(PAGES[chemin])

        self.fichier(chemin)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/etat":
            return self.repondre(404, b"Route inconnue")
        taille = int(self.headers.get("Content-Length", 0))
        try:
            recu = json.loads(self.rfile.read(taille).decode("utf-8"))
        except Exception:
            return self.repondre(400, b"JSON invalide")
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
                    message = "data: " + file.get(timeout=2) + "\n\n"
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
