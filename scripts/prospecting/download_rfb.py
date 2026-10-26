"""Downloads retomáveis por intervalos, no compartilhamento público oficial."""
import base64
import concurrent.futures
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
BASE = 'https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ/'
AUTH = 'Basic ' + base64.b64encode(b'gn672Ad4CF8N6TK:').decode()
HEADERS = {'Authorization': AUTH, 'User-Agent': 'LegalOS-CNPJ-Import/1.0'}
CHUNK = 64 * 1024 * 1024


def fetch_chunk(job):
    url, dest, start, end = job
    expected = end - start + 1
    if dest.exists() and dest.stat().st_size == expected:
        return
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={**HEADERS, 'Range': f'bytes={start}-{end}'})
            with urllib.request.urlopen(req, timeout=180) as response:
                if response.status != 206 or not response.headers.get('Content-Range', '').startswith(f'bytes {start}-{end}/'):
                    raise ValueError('Servidor não respeitou intervalo solicitado')
                with dest.open('wb') as f:
                    while chunk := response.read(1024 * 1024):
                        f.write(chunk)
            if dest.stat().st_size != expected:
                raise ValueError('Download truncado')
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def download_all(directory, month, names, workers=4):
    request = urllib.request.Request(BASE + month + '/', method='PROPFIND', headers={**HEADERS, 'Depth': '1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        root = ET.fromstring(response.read())
    sizes = {}
    for item in root.findall('{DAV:}response'):
        name = (item.findtext('{DAV:}href') or '').split('/')[-1]
        size = item.findtext('.//{DAV:}getcontentlength')
        if name in names and size:
            sizes[name] = int(size)
    if set(sizes) != set(names):
        raise ValueError('Listagem oficial incompleta')
    jobs, plans = [], []
    for name in names:
        dest = directory / name
        if dest.exists() and dest.stat().st_size == sizes[name]:
            continue
        prefix = directory / (Path(name).stem + '.part')
        offset = prefix.stat().st_size if prefix.exists() else 0
        if offset > sizes[name]:
            raise ValueError('Arquivo parcial maior que origem')
        chunks = []
        for start in range(offset, sizes[name], CHUNK):
            end = min(start + CHUNK, sizes[name]) - 1
            chunk = directory / f'{name}.{start}-{end}.chunk'
            chunks.append(chunk)
            jobs.append((BASE + month + '/' + name, chunk, start, end))
        plans.append((dest, prefix, chunks))
    print(f'Download retomável: {len(jobs)} partes, {workers} conexões', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        for i, _ in enumerate(executor.map(fetch_chunk, jobs)):
            print(f'Parte {i + 1}/{len(jobs)} conferida', flush=True)
    for dest, prefix, chunks in plans:
        temp = dest.with_suffix('.assembling')
        with temp.open('wb') as output:
            for part in ([prefix] if prefix.exists() else []) + chunks:
                with part.open('rb') as f:
                    while chunk := f.read(1024 * 1024):
                        output.write(chunk)
        with zipfile.ZipFile(temp) as z:
            if z.testzip() is not None:
                raise ValueError('CRC inválido: ' + dest.name)
        temp.replace(dest)
        for part in ([prefix] if prefix.exists() else []) + chunks:
            part.unlink()
        print('ZIP validado: ' + dest.name, flush=True)
