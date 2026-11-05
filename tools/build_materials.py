"""Builds LocalPaint's scanned-materials release from ambientCG (all CC0).

Also builds the grunge library the mask generators use (grunges-catalog.json + grunge-*.jpg): ambientCG's
surface imperfections, scratches, fingerprints, smears, leaks, chips, rust and concrete, each turned into one
tileable grayscale map. materials/config.json "build" says which of the two to make.

For each category in materials/config.json it takes the most popular scans that have colour, roughness
and normal maps, repacks the maps into one small zip per material (Name_Color.jpg, Name_Roughness.jpg …)
and writes materials-catalog.json with a preview picture of each. Output goes to ./out.
"""
import base64, io, json, os, re, sys, time, urllib.parse, urllib.request, zipfile
from PIL import Image

API = 'https://ambientcg.com/api/v2/full_json'
UA = {'User-Agent': 'LocalPaint-materials-builder (github.com/LeoDevRX/LocalPaint)'}
MAPS = {  # ambientCG suffix -> name LocalPaint understands
    'Color': 'Color', 'Roughness': 'Roughness', 'Metalness': 'Metalness', 'NormalGL': 'NormalGL',
    'Displacement': 'Displacement', 'AmbientOcclusion': 'AmbientOcclusion', 'Opacity': None, 'NormalDX': None,
}

def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:
            print('  retry', url, e, flush=True); time.sleep(3 + 4 * k)
    raise RuntimeError('failed ' + url)

def search(q, limit):
    url = API + '?' + urllib.parse.urlencode({'type': 'Material', 'q': q, 'sort': 'Popular', 'limit': limit, 'include': 'downloadData,tagData,displayData'})
    d = json.loads(get(url))
    return d.get('foundAssets') or d.get('assets') or []

def link(asset, attr):
    for cat in (asset.get('downloadFolders') or {}).values():
        for cat2 in (cat.get('downloadFiletypeCategories') or {}).values():
            for d in cat2.get('downloads', []):
                if d.get('attribute') == attr: return d.get('downloadLink'), d.get('size', 0)
    # Older API answers: build the usual download link.
    if attr in (asset.get('downloadAttributes') or [attr]): return f"https://ambientcg.com/get?file={asset['assetId']}_{attr}.zip", 0
    return None, 0

def clean_name(a):
    return re.sub(r'\s+', ' ', a.get('displayName') or a['assetId']).strip()

def materials(cfg):
    size = cfg.get('size', '2K-JPG')
    os.makedirs('out', exist_ok=True)
    used, catalog = set(), []
    for c in cfg['categories']:
        picked = []
        per = max(1, -(-c['count'] // len(c['queries'])))
        for q in c['queries']:
            n = 0
            for a in search(q, per * 4):
                if len(picked) >= c['count'] or n >= per: break
                aid = a['assetId']
                if aid in used: continue
                url, _ = link(a, size)
                if not url: continue
                used.add(aid); picked.append((a, url)); n += 1
        # top up from the first query when a later one ran short
        if len(picked) < c['count']:
            for a in search(c['queries'][0], c['count'] * 4):
                if len(picked) >= c['count']: break
                if a['assetId'] in used: continue
                url, _ = link(a, size)
                if url: used.add(a['assetId']); picked.append((a, url))
        for a, url in picked:
            aid, name = a['assetId'], clean_name(a)
            print(c['cat'], '|', aid, name, flush=True)
            try:
                src = zipfile.ZipFile(io.BytesIO(get(url)))
            except Exception as e:
                print('  skip', e); continue
            out = io.BytesIO(); maps = []
            with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as z:
                for n in src.namelist():
                    m = re.search(r'_([A-Za-z]+)\.(jpg|jpeg|png)$', n)
                    if not m or MAPS.get(m.group(1)) is None: continue
                    im = Image.open(io.BytesIO(src.read(n)))
                    im = im.convert('L') if m.group(1) in ('Roughness', 'Metalness', 'Displacement', 'AmbientOcclusion') else im.convert('RGB')
                    b = io.BytesIO(); im.save(b, 'JPEG', quality=88 if m.group(1) != 'NormalGL' else 92, optimize=True)
                    z.writestr(f'{name}_{MAPS[m.group(1)]}.jpg', b.getvalue()); maps.append(MAPS[m.group(1)])
            if not ({'Color', 'Roughness'} <= set(maps)):
                print('  skip, missing maps', maps); continue
            fn = f'mat-{aid}.zip'
            open(os.path.join('out', fn), 'wb').write(out.getvalue())
            thumb = ''
            try:
                im = Image.open(io.BytesIO(get(f'https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/256-PNG/{aid}.png'))).convert('RGBA')
                bg = Image.new('RGBA', im.size, (27, 26, 32, 255)); bg.alpha_composite(im)
                b = io.BytesIO(); bg.convert('RGB').resize((128, 128), Image.LANCZOS).save(b, 'JPEG', quality=82)
                thumb = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
            except Exception as e:
                print('  no preview', e)
            tags = [t for t in (a.get('tags') or []) if not t.isdigit()][:10]
            catalog.append({'id': aid, 'name': name, 'cat': c['cat'], 'tags': tags, 'file': fn, 'size': len(out.getvalue()),
                            'maps': sorted(set(maps)), 'thumb': thumb, 'source': f'https://ambientcg.com/a/{aid}'})
            time.sleep(0.4)
    json.dump({'format': 'lmp-materials-catalog', 'version': 1, 'updated': time.strftime('%Y-%m-%d'),
               'license': 'CC0 1.0 (ambientCG.com)', 'materials': catalog}, open('out/materials-catalog.json', 'w'))
    print('materials:', len(catalog), 'total MB:', round(sum(m['size'] for m in catalog) / 1e6, 1))

def search_any(q, limit):
    url = API + '?' + urllib.parse.urlencode({'type': 'Material', 'q': q, 'sort': 'Popular', 'limit': limit, 'include': 'downloadData,tagData'})
    d = json.loads(get(url))
    return d.get('foundAssets') or d.get('assets') or []

def to_grunge(src):
    """Pick the map with the most variation, stretch it to the full range and make the minority value white."""
    from PIL import ImageOps, ImageStat
    best = None
    for n in src.namelist():
        m = re.search(r'_([A-Za-z]+)\.(jpg|jpeg|png)$', n)
        if not m or m.group(1) not in ('Opacity', 'Displacement', 'Roughness', 'Color', 'AmbientOcclusion'): continue
        im = Image.open(io.BytesIO(src.read(n))).convert('L')
        im.thumbnail((1024, 1024), Image.LANCZOS)
        sd = ImageStat.Stat(im).stddev[0] * (1.15 if m.group(1) == 'Opacity' else 1.0)
        if best is None or sd > best[0]: best = (sd, m.group(1), im)
    if best is None or best[0] < 4: return None, None
    im = ImageOps.autocontrast(best[2], cutoff=1)
    if ImageStat.Stat(im).mean[0] > 127: im = ImageOps.invert(im)
    if im.size != (1024, 1024): im = im.resize((1024, 1024), Image.LANCZOS)
    return im, best[1]

def grunges(cfg):
    os.makedirs('out', exist_ok=True)
    size = cfg.get('grunge_size', '2K-JPG')
    used, catalog = set(), []
    for c in cfg['grunges']:
        picked = []
        for q in c['queries']:
            for a in search_any(q, 60):
                if len(picked) >= c['count']: break
                aid = a['assetId']
                if aid in used: continue
                if c.get('prefix') and not any(aid.startswith(x) for x in c['prefix']): continue
                if any(aid.startswith(x) for x in c.get('exclude', [])): continue
                tags = {t.lower() for t in (a.get('tags') or [])}
                if c.get('tags') and not tags & set(c['tags']): continue
                url, _ = link(a, size)
                if url: used.add(aid); picked.append((a, url))
        for a, url in picked:
            aid, name = a['assetId'], clean_name(a)
            try:
                im, used_map = to_grunge(zipfile.ZipFile(io.BytesIO(get(url))))
            except Exception as e:
                print('  skip', aid, e); continue
            if im is None: print('  skip, flat', aid); continue
            fn = f'grunge-{aid}.jpg'
            b = io.BytesIO(); im.save(b, 'JPEG', quality=90, optimize=True)
            open(os.path.join('out', fn), 'wb').write(b.getvalue())
            t = io.BytesIO(); im.resize((96, 96), Image.LANCZOS).save(t, 'JPEG', quality=80)
            catalog.append({'id': aid, 'name': name, 'cat': c['cat'], 'file': fn, 'size': len(b.getvalue()), 'map': used_map,
                            'thumb': 'data:image/jpeg;base64,' + base64.b64encode(t.getvalue()).decode(), 'source': f'https://ambientcg.com/a/{aid}'})
            print('grunge', c['cat'], '|', aid, used_map, flush=True)
            time.sleep(0.4)
    json.dump({'format': 'localpaint-grunges', 'version': 1, 'updated': time.strftime('%Y-%m-%d'),
               'license': 'CC0 1.0 (ambientCG.com)', 'grunges': catalog}, open('out/grunges-catalog.json', 'w'))
    print('grunges:', len(catalog), 'total MB:', round(sum(g['size'] for g in catalog) / 1e6, 1))

def main():
    cfg = json.load(open('materials/config.json'))
    build = cfg.get('build', ['materials', 'grunges'])
    if 'grunges' in build and cfg.get('grunges'): grunges(cfg)
    if 'materials' in build: materials(cfg)

if __name__ == '__main__':
    main()
