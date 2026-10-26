"""Amostra limitada de estabelecimentos elegíveis, lendo o fluxo ZIP só até o necessário.
Não representa censo nem amostra estatística. Não lê sócios.
"""
import argparse
import contextlib
import csv
import importlib.util
import json
import struct
import urllib.request
import zlib
from pathlib import Path
from download_rfb import BASE, HEADERS

spec = importlib.util.spec_from_file_location('filter_rfb', Path(__file__).with_name('filter-rfb.py'))
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)


def zip_stream_rows(stream):
    header = stream.read(30)
    if len(header) != 30:
        raise ValueError('Cabeçalho ZIP incompleto')
    v = struct.unpack('<IHHHHHIIIHH', header)
    if v[0] != 0x04034b50 or v[3] != 8 or v[2] & 1:
        raise ValueError('ZIP não suportado')
    stream.read(v[-2] + v[-1])
    decoder = zlib.decompressobj(-15)
    def lines():
        pending = ''
        while not decoder.eof:
            chunk = stream.read(65536)
            if not chunk:
                raise ValueError('Fluxo encerrou antes dos registros necessários')
            pending += decoder.decompress(chunk).decode('latin1')
            parts = pending.split('\n')
            pending = parts.pop()
            for part in parts:
                yield part + '\n'
        if pending:
            yield pending
    yield from csv.reader(lines(), delimiter=';')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--month', required=True)
    ap.add_argument('--directory', required=True, type=Path)
    ap.add_argument('--limit', type=int, default=200)
    args = ap.parse_args()
    if not 1 <= args.limit <= 200:
        ap.error('Amostra limitada a 200 registros')
    folder = args.directory
    folder.mkdir(parents=True, exist_ok=True)
    for name in ['Municipios.zip', 'Naturezas.zip']:
        if not (folder / name).exists():
            f.download(folder, args.month, name)
    city = next(r[0] for r in f.rows(folder / 'Municipios.zip') if r[1] == 'SAO PAULO')
    nature = dict(f.rows(folder / 'Naturezas.zip'))
    partial = folder / 'Estabelecimentos0.part'
    request = urllib.request.Request(BASE + args.month + '/Estabelecimentos0.zip', headers=HEADERS)
    prospects = {}
    with (partial.open('rb') if partial.exists() else urllib.request.urlopen(request, timeout=90)) as stream:
        for r in zip_stream_rows(stream):
            if not f.eligible(r, city):
                continue
            cnpj = ''.join(r[:3])
            prospects[cnpj] = dict(cnpj=cnpj, legalName='', tradeName=r[4], openedOn=r[10],
                address=' '.join(x for x in [r[13],r[14],r[15],r[16]] if x), neighborhood=r[17],
                postalCode=r[18], phone=r[21]+r[22], email=r[27], cnae='6911701', sourceMonth=args.month,
                city='SAO PAULO', state='SP', situation='02')
            if len(prospects) == args.limit:
                break
    if len(prospects) != args.limit:
        raise ValueError('Não foram encontrados registros suficientes no primeiro arquivo')
    roots = {cnpj[:8] for cnpj in prospects}
    companies = {}
    for i in range(10):
        print(f'Cruzando razões sociais: Empresas{i}.zip; faltam {len(roots - companies.keys())}', flush=True)
        request = urllib.request.Request(BASE + args.month + f'/Empresas{i}.zip', headers=HEADERS)
        with urllib.request.urlopen(request, timeout=90) as stream:
            for r in zip_stream_rows(stream):
                if len(r) >= 6 and r[0] in roots:
                    companies[r[0]] = dict(legalName=r[1], legalNature=nature.get(r[2],r[2]), companySize=r[5])
                if roots <= companies.keys():
                    break
        if roots <= companies.keys():
            break
    if roots - companies.keys():
        raise ValueError('Razões sociais faltantes; amostra não finalizada')
    sample = folder / 'sample-200'
    sample.mkdir(exist_ok=True)
    with (sample / 'advocacia-sp.ndjson').open('w', encoding='utf-8') as output:
        for cnpj, record in prospects.items():
            record.update(companies[cnpj[:8]])
            output.write(json.dumps(record,ensure_ascii=False)+'\n')
    manifest = dict(month=args.month, source=BASE+args.month+'/', count=len(prospects), complete=True, scope='sample', limit=args.limit, municipalityCode=city,
                    filter='Primeiros 200 elegíveis de Estabelecimentos0: capital/SP, ativa, CNAE principal ou secundário 6911701')
    (sample / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(f'Amostra concluída: {len(prospects)} cadastros, sem coordenadas inventadas.',flush=True)

if __name__ == '__main__': main()
