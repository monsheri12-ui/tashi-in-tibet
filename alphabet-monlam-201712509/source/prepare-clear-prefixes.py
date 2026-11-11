"""Make the O endpoint clearer while retaining the approved connected voice.

Preserves sample count, consonant onset, and one continuous voicing track.
No time stretching, extra vowel recording, oscillator, or second A attack.
"""
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

RATE = 24000
N, W, H = 2048, 768, 120
WIN = np.hanning(W)
FF = next((R / 'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
PREFIXES = {'gao': '@ga-prefix', 'dao': '@da-prefix', 'bao': '@ba-prefix',
            'mao': '@ma-prefix', 'ao': '@achung-prefix'}


def read(p):
    with wave.open(str(p)) as f:
        assert (f.getnchannels(), f.getsampwidth(), f.getframerate()) == (1, 2, RATE)
        raw = f.readframes(min(f.getnframes(), p.stat().st_size // 2))
    return np.frombuffer(raw, '<i2').astype(float) / 32768, raw


def write(p, x):
    assert np.isfinite(x).all() and np.max(abs(x)) < .98
    p.parent.mkdir(parents=True, exist_ok=True)
    raw = np.rint(x * 32768).astype('<i2').tobytes()
    with wave.open(str(p), 'wb') as f:
        f.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        f.writeframes(raw)
    return raw


def envelope(x):
    frames = np.lib.stride_tricks.sliding_window_view(x, W)[::H]
    lm = np.log(np.maximum(np.mean(abs(np.fft.rfft(frames * WIN, n=N)), axis=0), 1e-6))
    cep = np.fft.irfft(lm, n=N)
    q = np.minimum(np.arange(N), N - np.arange(N))
    lift = np.zeros(N)
    lift[q <= 30] = 1
    taper = (q > 30) & (q < 52)
    lift[taper] = .5 * (1 + np.cos((q[taper] - 30) / 22 * np.pi))
    return np.fft.rfft(cep * lift).real


def smooth(x, n):
    return np.convolve(np.pad(x, (n // 2, n // 2), mode='edge'), np.ones(n) / n, mode='valid')


records = []
for voice in ['male', 'female']:
    reference = R / ('monlam-wav-male/m0542.wav' if voice == 'male' else 'monlam-wav/m0150.wav')
    ref, _ = read(reference)
    a, b = (.65, .86) if voice == 'male' else (.35, .62)
    eo = envelope(ref[round(a * RATE):round(b * RATE)])
    f = np.fft.rfftfreq(N, 1 / RATE)
    active_f = (f >= 250) & (f <= 3500)
    samples = []
    for name, symbol in PREFIXES.items():
        approved = D / 'approved-prefixes' / (voice + '-' + name + '.wav')
        if approved.exists():
            x, raw = read(approved)
            target = D / 'prefixes' / (voice + '-' + name + '.wav')
            copied = write(target, x)
            assert copied == raw
            mp3 = target.with_suffix('.mp3')
            subprocess.run([str(FF), '-v', 'error', '-nostdin', '-y', '-i', str(target),
                            '-ar', str(RATE), '-ac', '1', '-c:a', 'libmp3lame', '-b:a',
                            '128k', '-map_metadata', '-1', str(mp3)], check=True)
            records.append({'voice': voice, 'unit': name, 'symbol': symbol,
                            'source': str(approved), 'wav': str(target), 'mp3': str(mp3),
                            'seconds': len(raw) / 48000,
                            'sourcePcmSha256': hashlib.sha256(raw).hexdigest(),
                            'pcmSha256': hashlib.sha256(raw).hexdigest(),
                            'approvedPcmCopiedExactly': True, 'userApproved': True,
                            'sampleCountUnchanged': True, 'timeStretchApplied': False})
            samples.extend([x, np.zeros(12000)])
            continue
        source = R / 'monlam-spelling-extra' / (voice + '-' + name + '-prefix.wav')
        x, original_raw = read(source)
        current_o = envelope(x[round(.39 * RATE):round(.56 * RATE)])
        delta = eo - current_o
        delta -= np.mean(delta[active_f])
        delta = np.clip(delta, -np.log(6), np.log(6))
        delta *= np.clip((f - 60) / 100, 0, 1) * np.clip((7000 - f) / 1500, 0, 1)
        pad = W // 2
        padded = np.pad(x, (pad, pad), mode='reflect')
        y = np.zeros(len(padded))
        weight = np.zeros(len(padded))
        for pos in range(0, len(padded) - W + 1, H):
            t = (pos + W / 2 - pad) / RATE
            mix = float(np.clip((t - .16) / .18, 0, 1))
            mix = mix * mix * (3 - 2 * mix)
            spectrum = np.fft.rfft(padded[pos:pos + W] * WIN, n=N)
            frame = np.fft.irfft(spectrum * np.exp(mix * delta), n=N)[:W]
            y[pos:pos + W] += frame * WIN
            weight[pos:pos + W] += WIN * WIN
        y = y[pad:pad + len(x)] / np.maximum(weight[pad:pad + len(x)], 1e-12)
        t = np.arange(len(x)) / RATE
        rms = np.sqrt(smooth(y * y, 481) + 1e-12)
        goal = np.sqrt(np.mean(x[round(.12 * RATE):round(.24 * RATE)] ** 2))
        gain = smooth(np.clip(goal / np.maximum(rms, .002), .8, 1.8), 961)
        mix = np.clip((t - .20) / .12, 0, 1) * np.clip((len(x) / RATE - .07 - t) / .10, 0, 1)
        y *= 1 + (gain - 1) * mix
        peak = np.max(abs(y))
        if peak > .86:
            y *= 1 + (.86 / peak - 1) * np.clip((t - .14) / .10, 0, 1)
        # Keep the initial consonant and A attack exactly as approved.
        y[:round(.14 * RATE)] = x[:round(.14 * RATE)]
        y[:720] = x[:720]
        y[-1200:] = x[-1200:]
        target = D / 'prefixes' / (voice + '-' + name + '.wav')
        raw = write(target, y)
        assert len(raw) == len(original_raw)
        assert raw[:round(.14 * RATE) * 2] == original_raw[:round(.14 * RATE) * 2]
        mp3 = target.with_suffix('.mp3')
        subprocess.run([str(FF), '-v', 'error', '-nostdin', '-y', '-i', str(target),
                        '-ar', str(RATE), '-ac', '1', '-c:a', 'libmp3lame', '-b:a',
                        '128k', '-map_metadata', '-1', str(mp3)], check=True)
        records.append({'voice': voice, 'unit': name, 'symbol': symbol,
                        'source': str(source), 'wav': str(target), 'mp3': str(mp3),
                        'seconds': len(raw) / 48000,
                        'sourcePcmSha256': hashlib.sha256(original_raw).hexdigest(),
                        'pcmSha256': hashlib.sha256(raw).hexdigest(),
                        'onsetPcmUnchanged': True, 'sampleCountUnchanged': True,
                        'timeStretchApplied': False})
        samples.extend([y, np.zeros(12000)])
    write(R.parent / 'outputs' / (voice + '-prefixes-approved-20261111.wav'),
          np.concatenate(samples[:-1]))

old_banks = {'normal': R / 'monlam-spelling',
             'slow': R / 'male-pronunciation-audit/slow-rendered/spelling',
             'very-slow': D / 'spelling'}
checks = []
for tempo, folder in old_banks.items():
    for voice in ['male', 'female']:
        source = folder / (voice + '.json')
        bank = json.loads(source.read_text())
        original = json.loads(source.read_text())
        for record in records:
            if record['voice'] == voice:
                bank['clips'][record['symbol']] = base64.b64encode(Path(record['mp3']).read_bytes()).decode()
        bank['prefixReading'] = 'clear-connected-a-to-o'
        bank['prefixAdditionalTimeStretch'] = False
        assert bank['plans'] == original['plans']
        assert bank['labels'] == original['labels']
        assert bank.get('resultAliases') == original.get('resultAliases')
        assert all(bank['clips'][s] == clip for s, clip in original['clips'].items() if s not in PREFIXES.values())
        dest = (D / 'spelling' if tempo == 'very-slow' else D / ('spelling-' + tempo)) / (voice + '.json')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(bank, ensure_ascii=False, separators=(',', ':')))
        checks.append({'tempo': tempo, 'voice': voice, 'prefixClipsChanged': 5,
                       'otherSymbolsAndPlansUnchanged': True, 'path': str(dest)})

(D / 'prefix-manifest.json').write_text(json.dumps({'records': records, 'banks': checks}, ensure_ascii=False, indent=2))
uploads = json.loads((D / 'upload-files.json').read_text())
for row in checks:
    if row['tempo'] == 'very-slow':
        continue
    folder = 'spelling' if row['tempo'] == 'normal' else 'spelling-slow'
    uploads.append({'local': row['path'], 'remote': 'alphabet-monlam-201712509/' + folder + '/' + row['voice'] + '.json', 'encoding': 'utf-8'})
(D / 'upload-files.json').write_text(json.dumps(list({r['remote']: r for r in uploads}.values()), ensure_ascii=False, indent=2))
print(json.dumps({'prefixRecordings': len(records), 'bankVariants': len(checks),
                  'plansUnchanged': True, 'additionalTimeStretch': False}))
