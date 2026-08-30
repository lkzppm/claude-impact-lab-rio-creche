"""Geocodificação de CEP e distância — só APIs públicas (regra do evento), com fallback por bairro.

Ordem de tentativa:
  1. BrasilAPI CEP v2  (https://brasilapi.com.br/api/cep/v2/{cep}) — só o endereço (a coordenada dela é o centro da cidade)
  2. Nominatim/OpenStreetMap com logradouro + bairro + "Rio de Janeiro" (1 req/s; User-Agent obrigatório)
  3. Centroide das unidades escolares do mesmo bairro (nossa própria base — sempre disponível)
Cache em memória por CEP. Nunca lança exceção: devolve `fonte='nao_encontrado'`.
"""
from __future__ import annotations

import json
import math
import re
import threading
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass

UA = "InscricaoCreche-SME-Rio/0.1 (hackathon; contato: eventos@taicor.ai)"
TIMEOUT = 4.0
_cache: dict[str, Endereco] = {}
_lock = threading.Lock()
_ultimo_nominatim = 0.0


@dataclass
class Endereco:
    cep: str
    logradouro: str | None = None
    bairro: str | None = None
    cidade: str | None = None
    uf: str | None = None
    lat: float | None = None
    lon: float | None = None
    fonte: str = "nao_encontrado"

    def dict(self) -> dict:
        return asdict(self)


def normalizar_cep(cep: str) -> str | None:
    d = re.sub(r"\D", "", cep or "")
    return d if len(d) == 8 else None


def _get_json(url: str) -> dict | list | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read())


def _brasilapi(cep: str) -> Endereco | None:
    try:
        r = _get_json(f"https://brasilapi.com.br/api/cep/v2/{cep}")
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(r, dict) or "cep" not in r:
        return None
    e = Endereco(cep=cep, logradouro=r.get("street") or None, bairro=r.get("neighborhood") or None,
                 cidade=r.get("city") or None, uf=r.get("state") or None, fonte="brasilapi")
    # A BrasilAPI devolve o centro da cidade quando não geocodifica a rua — coordenada dela é descartada;
    # a posição vem do Nominatim (rua + bairro) ou do centroide do bairro na nossa base.
    return e


def _nominatim(e: Endereco) -> bool:
    """Completa lat/lon a partir do logradouro+bairro. Respeita 1 req/s."""
    global _ultimo_nominatim
    partes = [p for p in (e.logradouro, e.bairro, "Rio de Janeiro", "RJ", "Brasil") if p]
    if len(partes) < 3:
        return False
    with _lock:
        espera = 1.05 - (time.time() - _ultimo_nominatim)
        if espera > 0:
            time.sleep(espera)
        _ultimo_nominatim = time.time()
    q = urllib.parse.quote(", ".join(partes))
    try:
        r = _get_json(f"https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q={q}")
    except Exception:  # noqa: BLE001
        return False
    if isinstance(r, list) and r:
        try:
            e.lat, e.lon = float(r[0]["lat"]), float(r[0]["lon"])
            e.fonte = "nominatim"
            return True
        except (KeyError, ValueError):
            return False
    return False


def geocodificar(cep: str, centroide_bairro=None) -> Endereco:
    """`centroide_bairro(bairro) -> (lat, lon) | None` é injetado pelo router (consulta a tabela `unidade`)."""
    n = normalizar_cep(cep)
    if not n:
        return Endereco(cep=cep or "")
    if n in _cache:
        return _cache[n]
    e = _brasilapi(n) or Endereco(cep=n)
    if e.lat is None:
        _nominatim(e)
    if e.lat is None and e.bairro and centroide_bairro:
        c = centroide_bairro(e.bairro)
        if c:
            e.lat, e.lon = c
            e.fonte = "bairro_centroide"
    if e.lat is None:
        e.fonte = "nao_encontrado" if not e.bairro else "sem_coordenada"
    _cache[n] = e
    return e


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
