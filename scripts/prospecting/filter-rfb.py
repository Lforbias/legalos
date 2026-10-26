"""Filtra arquivos oficiais, sem extrair ZIPs nem ler sócios. Saída NDJSON + manifesto.
Uso: python3 scripts/prospecting/filter-rfb.py --month 2026-10 --directory .storage/cnpj/2026-10 --download
"""
import argparse
import csv
import io
import json
import re
import urllib.request
import base64
import zipfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

CNAE = '6911701'
BASE = 'https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ/'
# Identificador do compartilhamento PÚBLICO do portal da Receita, não uma credencial privada.
SHARE = 'gn672Ad4CF8N6TK'


def rows(path):
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if name.endswith('/'):
                continue
            with z.open(name) as f:
                yield from csv.reader(io.TextIOWrapper(f, encoding='latin-1', newline=''), delimiter=';')


def eligible(row, city):
    return len(row) >= 30 and row[5] == '02' and row[19] == 'SP' and row[20] == city and (row[11] == CNAE or CNAE in row[12].split(','))


def download(directory, month, name):
    dest = directory / name
    if dest.exists():
        with zipfile.ZipFile(dest) as z:
            if z.testzip() is None:
                return
    request = urllib.request.Request(BASE + month + '/' + name, headers={
        'Authorization': 'Basic ' + base64.b64encode((SHARE + ':').encode()).decode(),
        'User-Agent': 'LegalOS-CNPJ-Import/1.0',
    })
    temp = dest.with_suffix('.part')
    print('Baixando ' + name, flush=True)
    with urllib.request.urlopen(request, timeout=180) as response, temp.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    with zipfile.ZipFile(temp) as z:
        if z.testzip() is not None:
            raise ValueError('ZIP inválido: ' + name)
    temp.replace(dest)
    print('Concluído ' + name, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--month', required=True)
    ap.add_argument('--directory', required=True, type=Path)
    ap.add_argument('--download', action='store_true')
    ap.add_argument('--workers', type=int, choices=range(1, 9), default=4)
    args = ap.parse_args()
    if not re.fullmatch(r'20\d{2}-(0[1-9]|1[0-2])', args.month):
        ap.error('Mês inválido')
    directory = args.directory
    directory.mkdir(parents=True, exist_ok=True)
    files = ['Municipios.zip', 'Naturezas.zip'] + [f'Estabelecimentos{i}.zip' for i in range(10)] + [f'Empresas{i}.zip' for i in range(10)]
    if args.download:
        from download_rfb import download_all
        download_all(directory, args.month, files, args.workers)
    missing = [f for f in files if not (directory / f).exists()]
    if missing:
        raise SystemExit('Carga incompleta. Faltam: ' + ', '.join(missing))
    cities = [r[0] for r in rows(directory / 'Municipios.zip') if len(r) > 1 and r[1].upper() == 'SAO PAULO']
    if len(cities) != 1:
        raise ValueError('Município da capital não identificado unicamente na tabela RFB')
    nature = dict(rows(directory / 'Naturezas.zip'))
    prospects = {}
    for i in range(10):
        print(f'Filtrando estabelecimentos {i}/9', flush=True)
        for r in rows(directory / f'Estabelecimentos{i}.zip'):
            if not eligible(r, cities[0]):
                continue
            cnpj = ''.join(r[:3])
            prospects[cnpj] = dict(cnpj=cnpj, legalName='', tradeName=r[4], openedOn=r[10],
                address=' '.join(x for x in [r[13], r[14], r[15], r[16]] if x), neighborhood=r[17],
                postalCode=r[18], phone=r[21] + r[22], email=r[27], cnae=CNAE,
                sourceMonth=args.month, city='SAO PAULO', state='SP', situation='02')
    roots = {k[:8] for k in prospects}
    companies = {}
    for i in range(10):
        print(f'Cruzando empresas {i}/9', flush=True)
        for r in rows(directory / f'Empresas{i}.zip'):
            if len(r) >= 6 and r[0] in roots:
                companies[r[0]] = dict(legalName=r[1], legalNature=nature.get(r[2], r[2]), companySize=r[5])
    unmatched = roots - companies.keys()
    if unmatched:
        raise ValueError(f'{len(unmatched)} empresas sem razão social; carga não finalizada')
    out = directory / 'advocacia-sp.ndjson'
    with out.with_suffix('.tmp').open('w', encoding='utf-8') as f:
        for cnpj, p in sorted(prospects.items()):
            p.update(companies[cnpj[:8]])
            f.write(json.dumps(p, ensure_ascii=False) + '\n')
    out.with_suffix('.tmp').replace(out)
    manifest = dict(month=args.month, source=BASE + args.month + '/', municipalityCode=cities[0], count=len(prospects), complete=True,
                    filter='SP / São Paulo / ativa / CNAE principal ou secundário 6911701', files=files)
    (directory / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
