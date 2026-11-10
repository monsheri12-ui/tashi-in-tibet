"""Render the 0.8x variant once; browser playback remains at 1.0x."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import array
import base64
import hashlib
import json
import subprocess
import sys
import time
import wave

R = Path(__file__).resolve().parent
D = R / 'male-pronunciation-audit/slow-rendered'
FF = next((R / 'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
C = json.loads((R / 'monlam-corpus.json').read_text())
M = json.loads((R / 'monlam-audio-manifest.json').read_text())
SA = json.loads((R / 'monlam-spelling-audit.json').read_text())
RATE = 24000
TEMPO = .8
FORMAT = 'ffmpeg-atempo0.8-libmp3lame-cbr128-24k-mono-v2'
D.mkdir(exist_ok=True)


def read_pcm(path):
    with wave.open(str(path)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, RATE)
        return w.readframes(min(w.getnframes(), path.stat().st_size // 2))


def write_pcm(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as w:
        w.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        w.writeframes(raw)


def render(source, destination, fingerprint):
    destination.parent.mkdir(parents=True, exist_ok=True)
    sidecar = destination.with_suffix('.sha256')
    rendered = destination.with_suffix('.wav')
    if not (destination.exists() and rendered.exists() and sidecar.exists()
            and sidecar.read_text() == fingerprint):
        subprocess.run([str(FF), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                        '-i', str(source), '-af', 'atempo=0.8', '-ar', str(RATE), '-ac', '1',
                        '-c:a', 'pcm_s16le', '-map_metadata', '-1', str(rendered)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        subprocess.run([str(FF), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                        '-i', str(source), '-af', 'atempo=0.8', '-c:a', 'libmp3lame', '-b:a', '128k',
                        '-ar', str(RATE), '-ac', '1', '-map_metadata', '-1', str(destination)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        sidecar.write_text(fingerprint)
    with wave.open(str(rendered)) as w:
        seconds = w.getnframes() / RATE
    return destination.read_bytes(), seconds


def main_record(voice, entry):
    source = R / ('monlam-wav' if voice == 'female' else 'monlam-wav-male') / (entry['id'] + '.wav')
    raw = read_pcm(source)
    digest = hashlib.sha256(raw).hexdigest()
    original = next(x for x in M['voices'][voice] if x['id'] == entry['id'])
    assert digest == original['sha256'], (voice, entry['id'], 'Source changed')
    destination = D / 'mp3' / voice / (entry['id'] + '.mp3')
    encoded, seconds = render(source, destination, FORMAT + ':' + digest)
    metadata = {'id': entry['id'], 'sourcePcmSha256': digest,
                'sourceSeconds': original['seconds'], 'seconds': seconds,
                'encoded_bytes': len(encoded), 'encodedSha256': hashlib.sha256(encoded).hexdigest()}
    return voice, entry['id'], encoded, metadata


started = time.monotonic()
voices = ['female', 'male']
encoded = {v: {} for v in voices}
metadata = {v: {} for v in voices}
with ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(main_record, v, e) for v in voices for e in C['entries']]
    for n, future in enumerate(as_completed(futures), 1):
        voice, ident, data, info = future.result()
        encoded[voice][ident] = data
        metadata[voice][ident] = info
        if n % 400 == 0:
            print(json.dumps({'slowRendered': n, 'total': len(futures),
                              'seconds': round(time.monotonic() - started)}), flush=True)

for voice in voices:
    folder = D / 'audio' / voice
    folder.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(C['entries']), 32):
        clips = {e['id']: base64.b64encode(encoded[voice][e['id']]).decode('ascii')
                 for e in C['entries'][start:start + 32]}
        chunk = {'voice': voice, 'mime': 'audio/mpeg', 'recordedRate': TEMPO, 'clips': clips}
        (folder / f'{start // 32:03}.json').write_text(json.dumps(chunk, separators=(',', ':')))

spelling_audit = {'recordedRate': TEMPO, 'voices': {}}
for voice in voices:
    bank = json.loads((R / 'monlam-spelling' / (voice + '.json')).read_text())
    bank['recordedRate'] = TEMPO
    records = {}
    for symbol, original in SA['voices'][voice]['recordings'].items():
        name = original['source']
        source = (R / ('monlam-wav' if voice == 'female' else 'monlam-wav-male') / name
                  if name.startswith('m0') else R / 'monlam-spelling-extra' / name)
        raw = read_pcm(source)
        digest = hashlib.sha256(raw).hexdigest()
        assert digest == original['sourcePcmSha256'], (voice, symbol, 'Source changed')
        samples = array.array('h', raw)
        if sys.byteorder != 'little':
            samples.byteswap()
        threshold = max(90, max(map(abs, samples)) * .009)
        active = [i for i, x in enumerate(samples) if abs(x) >= threshold]
        kept = samples[max(0, active[0] - 1200):min(len(samples), active[-1] + 1920)]
        if sys.byteorder != 'little':
            kept.byteswap()
        trimmed = D / 'symbol-input' / voice / name
        write_pcm(trimmed, kept.tobytes())
        destination = D / 'symbol-mp3' / voice / (Path(name).stem + '.mp3')
        data, seconds = render(trimmed, destination, FORMAT + ':' + hashlib.sha256(kept.tobytes()).hexdigest())
        bank['clips'][symbol] = base64.b64encode(data).decode('ascii')
        records[symbol] = {**original, 'seconds': seconds, 'encodedSha256': hashlib.sha256(data).hexdigest()}
    folder = D / 'spelling'
    folder.mkdir(exist_ok=True)
    (folder / (voice + '.json')).write_text(json.dumps(bank, ensure_ascii=False, separators=(',', ':')))
    spelling_audit['voices'][voice] = {'recordings': records}

manifest = {'recordedRate': TEMPO, 'encoder': FORMAT, 'sourcePcmUnchanged': True,
            'voices': {v: [metadata[v][e['id']] for e in C['entries']] for v in voices}}
(D / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
(D / 'spelling-audit.json').write_text(json.dumps(spelling_audit, ensure_ascii=False, indent=2))
report = {'records': 2210, 'spellingClips': 76, 'recordedRate': TEMPO, 'browserPlaybackRate': 1,
          'bitRateKbps': 128, 'sourcePcmUnchanged': True, 'ordinaryAudioUnchanged': True,
          'seconds': round(time.monotonic() - started),
          'jsonBytes': sum(p.stat().st_size for p in (D / 'audio').rglob('*.json'))}
(D / 'staging-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report), flush=True)
