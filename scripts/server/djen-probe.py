#!/usr/bin/env python3
"""
Sonda do DJEN (somente leitura), sem dependências: só precisa do Python 3.9+.

Faz uma consulta PÚBLICA real por OAB e imprime só o FORMATO da resposta.
Não usa banco de dados, não grava nada e NÃO imprime texto de publicação,
nomes de partes nem números de processo. A "assinatura" final pode ser colada
no chat: só tem contagens, nomes de campos e siglas de tribunal.

Rode num servidor NO BRASIL (o DJEN recusa acessos de fora):
    python3 djen-probe.py NUMERO_OAB UF [dias] [paginas] [TRIBUNAL]
    exemplo: python3 djen-probe.py 12345 BA 7 5
"""
import collections
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

BASE = os.environ.get("DJEN_API_BASE", "https://comunicaapi.pje.jus.br/api/v1").rstrip("/")
PAGE_SIZE = 50


def usage():
    print("Uso: python3 djen-probe.py NUMERO_OAB UF [dias=7] [paginas=5] [TRIBUNAL]")
    sys.exit(1)


if len(sys.argv) < 3:
    usage()
oab = "".join(c for c in sys.argv[1] if c.isdigit()).lstrip("0")
uf = sys.argv[2].strip().upper()
days = min(30, max(1, int(sys.argv[3]))) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 7
max_pages = min(40, max(1, int(sys.argv[4]))) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 5
tribunal = sys.argv[5].strip().upper() if len(sys.argv) > 5 else None
if not oab or len(oab) > 7 or len(uf) != 2 or not uf.isalpha():
    usage()

tz = ZoneInfo("America/Sao_Paulo")
now = datetime.datetime.now(tz)
fim = now.date().isoformat()
inicio = (now - datetime.timedelta(days=days)).date().isoformat()


def fetch(page):
    params = {
        "numeroOab": oab,
        "ufOab": uf,
        "dataDisponibilizacaoInicio": inicio,
        "dataDisponibilizacaoFim": fim,
        "pagina": str(page),
        "itensPorPagina": str(PAGE_SIZE),
    }
    if tribunal:
        params["siglaTribunal"] = tribunal
    url = f"{BASE}/comunicacao?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "LegalOS/1.0"})
    for attempt in range(4):
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read().decode("utf-8", "replace"), int((time.time() - t0) * 1000)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(min(8, 0.5 * 2**attempt))
                continue
            return e.code, body, int((time.time() - t0) * 1000)
        except Exception as e:  # rede, DNS, tempo esgotado
            if attempt < 3:
                time.sleep(min(8, 0.5 * 2**attempt))
                continue
            return 0, f"{type(e).__name__}: {e}", int((time.time() - t0) * 1000)
    return 0, "sem resposta", 0


def pick(o, *keys):
    for k in keys:
        v = o.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return str(v)
    return None


def cnj_valido(digits):
    d = "".join(c for c in (digits or "") if c.isdigit())
    return len(d) == 20 and int(d[:7] + d[9:] + d[7:9]) % 97 == 1


def norm_oab(v):
    return "".join(c for c in (v or "") if c.isdigit()).lstrip("0")


def bump(counter, key):
    counter[(key or "(vazio)")[:60]] += 1


print(f"DJEN real: {BASE}")
print(f"Consulta: OAB {uf} {oab}, de {inicio} a {fim}" + (f", tribunal {tribunal}" if tribunal else "") + ".")

field_presence = collections.Counter()
field_types = {}
top_keys = []
tipos, docs, tribunais = collections.Counter(), collections.Counter(), collections.Counter()
raw_count = parsed = skipped = cancelled = com_cnj = com_adv = com_oab = ids_repetidos = 0
reported_total = None
pages_read = 0
complete = False
latency_first = None
http_first = None
ids = set()
min_date = max_date = None

for page in range(1, max_pages + 1):
    status, body, ms = fetch(page)
    if page == 1:
        latency_first, http_first = ms, status
        print(f"HTTP {status} em {ms} ms.")
    if status < 200 or status >= 300:
        low = body.lower()
        if status == 403:
            geo = any(w in low for w in ("country", "país", "cloudfront"))
            print(f"FALHOU (403{' GEO_BLOCKED' if geo else ''}): o DJEN recusou o acesso.")
            print("Dica: rode no servidor do Brasil, não no computador fora do país.")
        elif status == 429:
            print("FALHOU (429): o DJEN limitou as consultas. Tente de novo em alguns minutos.")
        elif status == 0:
            print(f"FALHOU (sem conexão): {body[:160]}")
        else:
            print(f"FALHOU (HTTP {status}).")
        if page == 1:
            sys.exit(2)
        break
    try:
        data = json.loads(body)
    except ValueError:
        print("FALHOU: a resposta não é JSON. O formato do DJEN mudou ou o endereço está errado.")
        sys.exit(2)
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        print("FALHOU: a resposta não traz a lista `items`. O formato do DJEN mudou.")
        sys.exit(2)
    if page == 1:
        top_keys = list(data.keys())
        print(f"Campos de topo: {', '.join(top_keys) or '(nenhum)'}.")
    items = data["items"]
    pages_read += 1
    raw_count += len(items)
    total = data.get("count")
    if isinstance(total, int) and not isinstance(total, bool) and total >= 0:
        reported_total = total
    for it in items:
        if not isinstance(it, dict):
            skipped += 1
            continue
        for k, v in it.items():
            field_presence[k] += 1
            field_types.setdefault(k, "array" if isinstance(v, list) else "null" if v is None else type(v).__name__)
        ident = pick(it, "id", "numeroComunicacao", "numero_comunicacao")
        texto = pick(it, "texto", "conteudo")
        if not ident or not texto:
            skipped += 1
            continue
        parsed += 1
        if ident in ids:
            ids_repetidos += 1
        ids.add(ident)
        status_txt = (pick(it, "status") or "").lower()
        if it.get("ativo") is False or "cancel" in status_txt:
            cancelled += 1
        if cnj_valido(pick(it, "numero_processo", "numeroProcesso")):
            com_cnj += 1
        advs = it.get("destinatarioadvogados") or it.get("destinatarios_advogados") or []
        lista = [a.get("advogado") for a in advs if isinstance(a, dict) and isinstance(a.get("advogado"), dict)]
        if lista:
            com_adv += 1
        if any(norm_oab(pick(a, "numero_oab", "numeroOab")) == oab and (pick(a, "uf_oab", "ufOab") or "").upper() == uf for a in lista):
            com_oab += 1
        bump(tipos, pick(it, "tipoComunicacao", "tipo_comunicacao"))
        bump(docs, pick(it, "tipoDocumento", "tipo_documento"))
        bump(tribunais, pick(it, "siglaTribunal", "sigla_tribunal"))
        d = pick(it, "data_disponibilizacao", "dataDisponibilizacao", "datadisponibilizacao")
        d = d[:10] if d and len(d) >= 10 and d[4] == "-" else None
        if d:
            min_date = d if not min_date or d < min_date else min_date
            max_date = d if not max_date or d > max_date else max_date
    if len(items) < PAGE_SIZE:
        complete = True
        break
    time.sleep(0.5)

conta_confere = (raw_count == reported_total) if (complete and reported_total is not None) else None
assinatura = {
    "quando": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "janela": {"inicio": inicio, "fim": fim},
    "http": http_first,
    "latenciaMs": latency_first,
    "camposDeTopo": top_keys,
    "camposDosItens": {k: {"emItens": n, "tipo": field_types.get(k)} for k, n in field_presence.items()},
    "paginas": {"lidas": pages_read, "janelaCompleta": complete},
    "itens": {"brutos": raw_count, "interpretados": parsed, "naoInterpretados": skipped, "idsRepetidos": ids_repetidos, "cancelados": cancelled},
    "totalInformadoPelaFonte": reported_total,
    "contagemConfere": conta_confere,
    "comNumeroCnjValido": com_cnj,
    "comAdvogadosListados": com_adv,
    "comAdvogadoIgualAOab": com_oab,
    "datas": {"primeira": min_date, "ultima": max_date},
    "tiposDeComunicacao": dict(tipos.most_common(12)),
    "tiposDeDocumento": dict(docs.most_common(12)),
    "tribunais": dict(tribunais.most_common(12)),
}
print()
if parsed:
    print(f"OK: {parsed} comunicação(ões) interpretadas em {pages_read} página(s); {skipped} não interpretadas.")
else:
    print("A consulta funcionou, mas não há comunicações nessa janela para essa OAB.")
if conta_confere is False:
    print(f"ATENÇÃO: a fonte informou {reported_total} e entregou {raw_count}. O sistema trataria a janela como incompleta.")
if not complete and pages_read >= max_pages:
    print(f"Parou em {max_pages} páginas (limite da sonda); há mais resultados.")
print()
print("=== ASSINATURA (pode colar no chat; sem dados pessoais) ===")
print(json.dumps(assinatura, ensure_ascii=False, indent=2))
print("=== FIM ===")
