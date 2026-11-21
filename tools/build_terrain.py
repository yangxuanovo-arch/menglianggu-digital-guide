"""Reproduce the small real-elevation asset. Python standard library only.

Run: python tools/build_terrain.py [--hgt /path/to/N35E118.hgt]
Never generates artificial hills or downloads tiles in the visitor's browser.
"""
import argparse
import array
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import urllib.request

URL = 'https://elevation-tiles-prod.s3.amazonaws.com/skadi/N35/N35E118.hgt.gz'
parser = argparse.ArgumentParser()
parser.add_argument('--hgt', type=Path)
args = parser.parse_args()
if args.hgt:
    raw = args.hgt.read_bytes()
else:
    raw = gzip.decompress(urllib.request.urlopen(URL, timeout=120).read())
n = math.isqrt(len(raw) // 2)
assert n == 3601 and len(raw) == n*n*2, 'Unexpected source tile layout'
west, south, east, north = 118.07, 35.49, 118.30, 35.72
size = 257
def sample(lat, lon):
    x, y = (lon-118)*(n-1), (36-lat)*(n-1)
    ix, iy = int(x), int(y)
    dx, dy = x-ix, y-iy
    h = [struct.unpack_from('>h', raw, ((iy+j)*n+ix+i)*2)[0] for j in range(2) for i in range(2)]
    assert all(v != -32768 for v in h), 'Source contains an unresolved elevation void'
    return round((h[0]*(1-dx)+h[1]*dx)*(1-dy)+(h[2]*(1-dx)+h[3]*dx)*dy)
values = [sample(north-(north-south)*y/(size-1), west+(east-west)*x/(size-1)) for y in range(size) for x in range(size)]
out = Path(__file__).resolve().parents[1] / 'web/terrain/assets'
out.mkdir(parents=True, exist_ok=True)
binary = struct.pack('<' + 'h'*len(values), *values)
(out/'elevation.i16').write_bytes(binary)
metadata = {
    'size': size, 'bounds': [west, south, east, north], 'encoding': 'int16-little-endian',
    'rowOrder': 'north-to-south', 'heightUnit': 'metres', 'horizontalCRS': 'EPSG:4326',
    'verticalDatum': 'EGM96', 'min': min(values), 'max': max(values),
    'source': 'Mapzen / Tilezen Terrain Tiles, Skadi N35E118 (SRTM-derived in this region)',
    'sourceUrl': URL, 'sourceRawSha256': hashlib.sha256(raw).hexdigest(),
    'assetSha256': hashlib.sha256(binary).hexdigest(), 'retrieved': '2026-11-21',
    'sourceSpacingArcSeconds': 1, 'resampling': 'bilinear, then rounded to nearest metre',
    'credit': 'SRTM data courtesy of the U.S. Geological Survey. Terrain Tiles by Mapzen / Tilezen.',
    'attributionUrl': 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
    'note': 'Modern terrain, not a reconstruction of the ground surface in 1947. Display vertical exaggeration is separate from stored elevations.'
}
(out/'elevation.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(f'{size} x {size}, {len(binary):,} bytes, {min(values)}–{max(values)} m; {metadata["assetSha256"]}')
