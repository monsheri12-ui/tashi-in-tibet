from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import ast
import base64
import hashlib
import json
import subprocess
import sys
import time
import wave

D = Path(__file__).resolve().parent
R = D.parent
sys.path.insert(0, str(R / 'audio-join-audit/python-libs'))
import numpy as np

C = json.loads((R / 'monlam-corpus.json').read_text())
M = json.loads((D / 'manifest.json').read_text())
P = json.loads((D / 'prefix-manifest.json').read_text())
FF = next((R / 'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
by_text = {e['text']: e['id'] for e in C['entries']}
word_ids = {e['id'] for e in C['entries'] if e['text'].rstrip('་།') in {w.rstrip('་།') for w in C['words']}}
prefix_symbols = {x['symbol'] for x in P['records']}
repairs_path = D / 'native-fragment-repairs.json'
repairs = {(r['voice'], r['id']): r for r in json.loads(repairs_path.read_text())} if repairs_path.exists() else {}
report = {'wholeWordRecordingsWithoutTimeStretch': 0,
          'otherMainRecordingsCopiedFromOrdinary': 0, 'spellingSymbols': 0,
          'plansChecked': 0, 'prefixPlansChecked': 0,
          'clearPrefixVoiceRecordings': len(P['records']),
          'prefixBankVariants': len(P['banks']), 'additionalTimeStretch': False,
          'browserPlaybackRate': 1, 'decoded': 0, 'clippedFiles': [],
          'toneCandidates': [], 'quietIslandCandidates': [],
          'phoneticCertificationOfEntireCorpus': False}
original_fingerprints = json.loads((R / 'word-clarity-followup-20261111/existing-bank-fingerprints.json').read_text())
for path, digest in original_fingerprints.items():
    assert hashlib.sha256((R / path).read_bytes()).hexdigest() == digest, path
report['originalBanksNotMutatedWhileStaging'] = len(original_fingerprints)

jobs = []
for voice in ['male', 'female']:
    main = {k: v for f in sorted((D / 'audio' / voice).glob('*.json')) for k, v in json.loads(f.read_text())['clips'].items()}
    ordinary = {k: v for f in sorted((R / 'monlam-audio' / voice).glob('*.json')) for k, v in json.loads(f.read_text())['clips'].items()}
    assert set(main) == set(ordinary) == {e['id'] for e in C['entries']}
    for ident, encoded in main.items():
        data = base64.b64decode(encoded, validate=True)
        if ident in word_ids:
            source = R / 'word-clarity-followup-20261111/rendered' / voice / (ident + '-level.wav')
            wav = D / 'wav' / voice / (ident + '.wav')
            assert source.read_bytes() == wav.read_bytes(), (voice, ident)
            mp3 = D / 'mp3' / voice / (ident + '.mp3')
            assert mp3.read_bytes() == data
            report['wholeWordRecordingsWithoutTimeStretch'] += 1
        elif (voice, ident) in repairs:
            repair = repairs[voice, ident]
            mp3 = Path(repair['mp3'])
            assert mp3.read_bytes() == data
            assert repair['sampleCountUnchanged'] and not repair['timeStretchApplied']
        else:
            assert encoded == ordinary[ident], (voice, ident)
            mp3 = D / 'copied-mp3' / voice / (ident + '.mp3')
            mp3.parent.mkdir(parents=True, exist_ok=True)
            mp3.write_bytes(data)
            report['otherMainRecordingsCopiedFromOrdinary'] += 1
        jobs.append((voice, ident, mp3))
    for tempo, folder in [('normal', D / 'spelling-normal'), ('slow', D / 'spelling-slow'), ('very-slow', D / 'spelling')]:
        bank = json.loads((folder / (voice + '.json')).read_text())
        original_folder = R / 'male-pronunciation-audit/slow-rendered/spelling' if tempo == 'slow' else R / 'monlam-spelling'
        original = json.loads((original_folder / (voice + '.json')).read_text())
        assert bank['plans'] == original['plans'] and bank['labels'] == original['labels']
        assert bank.get('resultAliases') == original.get('resultAliases')
        assert all(bank['clips'][s] == data for s, data in original['clips'].items() if s not in prefix_symbols)
        for syllable, plan in bank['plans'].items():
            for step in plan['steps']:
                if step['kind'] == 'symbol':
                    assert step['text'] in bank['clips']
                else:
                    assert by_text[bank.get('resultAliases', {}).get(step['text'], step['text'])] in main
            if plan['parts'].get('prefix'):
                assert plan['steps'][0]['stage'] == 'prefix-glide'
                assert plan['steps'][0]['text'] in prefix_symbols
                assert all(step['text'] != '@prefix' for step in plan['steps'])
                report['prefixPlansChecked'] += 1
            report['plansChecked'] += 1
        for record in P['records']:
            if record['voice'] == voice:
                assert bank['clips'][record['symbol']] == base64.b64encode(Path(record['mp3']).read_bytes()).decode()
        if tempo == 'very-slow':
            for i, (symbol, encoded) in enumerate(bank['clips'].items()):
                mp3 = D / 'symbol-mp3' / voice / (str(i).zfill(2) + '.mp3')
                mp3.parent.mkdir(parents=True, exist_ok=True)
                mp3.write_bytes(base64.b64decode(encoded, validate=True))
                jobs.append((voice, symbol, mp3))
                report['spellingSymbols'] += 1

tree = ast.parse((R / 'full-audio-review/acoustics.py').read_text())
module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ['decode', 'features']], type_ignores=[])
ns = {'np': np, 'subprocess': subprocess, 'FF': FF}
exec(compile(module, 'natural-very-slow-acoustics', 'exec'), ns)


def inspect(row):
    voice, ident, path = row
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    cached = cached_details.get((voice, ident))
    if cached and cached.get('encodedSha256') == digest:
        return {**cached, 'path': str(path)}
    x = ns['decode'](path)
    features = ns['features'](x)
    return {'voice': voice, 'id': ident, 'path': str(path), 'encodedSha256': digest,
            **{k: features[k] for k in ['seconds', 'peak', 'tones', 'quietIslands', 'clippedSamples']}}


started = time.monotonic()
details = []
cached_path = D / 'acoustic-details.json'
cached_details = {(row['voice'], row['id']): row for row in json.loads(cached_path.read_text())} if cached_path.exists() else {}
with ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(inspect, row) for row in jobs]
    for n, future in enumerate(as_completed(futures), 1):
        row = future.result()
        details.append(row)
        for key, feature in [('toneCandidates', 'tones'), ('quietIslandCandidates', 'quietIslands'), ('clippedFiles', 'clippedSamples')]:
            if row[feature]:
                report[key].append(row)
        if n % 500 == 0:
            print(json.dumps({'decoded': n, 'total': len(jobs), 'seconds': round(time.monotonic() - started)}), flush=True)
report['decoded'] = len(details)
report['naturalCadenceFragmentRepairs'] = list(repairs.values())
assert report['decoded'] == 2296
assert report['wholeWordRecordingsWithoutTimeStretch'] == 1000
assert report['prefixPlansChecked'] == 116 * 6
(D / 'acoustic-details.json').write_text(json.dumps(details, ensure_ascii=False, indent=2))
(D / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in report.items()}), flush=True)
assert not report['clippedFiles']
