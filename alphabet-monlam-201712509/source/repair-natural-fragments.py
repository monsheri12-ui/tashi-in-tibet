"""Keep source timing; remove one known detached tone and two codec overshoots."""
from pathlib import Path
import base64
import hashlib
import json
import subprocess
import sys
import wave

D = Path(__file__).resolve().parent
R = D.parent
sys.path.insert(0, str(R / 'audio-join-audit/python-libs'))
import numpy as np

FF = next((R / 'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
C = json.loads((R / 'monlam-corpus.json').read_text())
indices = {e['id']: i for i, e in enumerate(C['entries'])}
repairs = []
for voice, ident in [('male', 'm0677'), ('female', 'm0137'), ('female', 'm0146')]:
    source = R / ('monlam-wav-male' if voice == 'male' else 'monlam-wav') / (ident + '.wav')
    with wave.open(str(source)) as f:
        assert (f.getnchannels(), f.getsampwidth(), f.getframerate()) == (1, 2, 24000)
        raw = f.readframes(min(f.getnframes(), source.stat().st_size // 2))
    x = np.frombuffer(raw, '<i2').astype(float) / 32768
    original = x.copy()
    if ident == 'm0677':
        # Earlier audit established that the spoken syllable ends around .55 s.
        # Its detached, pure 656-Hz tail lies after .9 s at the natural cadence.
        a = round(.90 * 24000)
        n = min(192, len(x) - a)
        x[a:a + n] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
        x[a + n:] = 0
        assert np.array_equal(x[:a], original[:a])
        method = 'known detached tone after speech; original PCM before .9 s preserved'
    else:
        x *= min(1, .82 / np.max(abs(x)))
        method = 'source level headroom to prevent codec overshoot'
    target = D / 'repaired-wav' / voice / (ident + '.wav')
    target.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(target), 'wb') as f:
        f.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        f.writeframes(np.rint(x * 32768).astype('<i2').tobytes())
    mp3 = target.with_suffix('.mp3')
    subprocess.run([str(FF), '-v', 'error', '-nostdin', '-y', '-i', str(target),
                    '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a',
                    '128k', '-map_metadata', '-1', str(mp3)], check=True)
    chunk = D / 'audio' / voice / (f'{indices[ident] // 32:03}.json')
    bank = json.loads(chunk.read_text())
    bank['clips'][ident] = base64.b64encode(mp3.read_bytes()).decode()
    chunk.write_text(json.dumps(bank, separators=(',', ':')))
    repairs.append({'voice': voice, 'id': ident, 'wav': str(target), 'mp3': str(mp3),
                    'method': method, 'sampleCountUnchanged': len(x) == len(original),
                    'timeStretchApplied': False,
                    'sourcePcmSha256': hashlib.sha256(raw).hexdigest()})
(D / 'native-fragment-repairs.json').write_text(json.dumps(repairs, indent=2))
print(json.dumps({'naturalCadenceRepairs': len(repairs), 'timeStretchApplied': False}))
