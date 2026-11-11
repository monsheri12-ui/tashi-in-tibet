"""Prepare reversible auditions; never silently replace the published bank.

Prefix names retain a single original voicing track. Only the smooth vowel
envelope moves from A to O, avoiding a second A attack or a separate O clip.
NY candidates retain all original phonemes and strengthen the nasal onset.
"""
from pathlib import Path
import hashlib, json, subprocess, sys, wave

D = Path(__file__).resolve().parent
R = D.parent
O = R.parent / 'outputs'
sys.path.insert(0, str(R / 'audio-join-audit/python-libs'))
import numpy as np

RATE = 24000
FF = next((R / 'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
OUT = D / 'clear-units'
OUT.mkdir(exist_ok=True)
N, W, H = 2048, 768, 120
WIN = np.hanning(W)

def read(p):
    with wave.open(str(p)) as f:
        assert (f.getnchannels(), f.getsampwidth(), f.getframerate()) == (1, 2, RATE)
        return np.frombuffer(f.readframes(min(f.getnframes(), p.stat().st_size // 2)), '<i2').astype(float) / 32768

def write(p, x):
    assert np.isfinite(x).all() and np.max(abs(x)) < .999
    raw = np.rint(x * 32767).astype('<i2').tobytes()
    with wave.open(str(p), 'wb') as f:
        f.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        f.writeframes(raw)
    return hashlib.sha256(raw).hexdigest()

def fade(x, ms=8):
    x = x.copy()
    k = round(RATE * ms / 1000)
    ramp = np.sin(np.linspace(0, np.pi/2, k)) ** 2
    x[:k] *= ramp
    x[-k:] *= ramp[::-1]
    return x

def trim(x):
    a = np.flatnonzero(abs(x) > max(.0018, np.max(abs(x)) * .009))
    return x[max(0, a[0] - 480):min(len(x), a[-1] + 720)]

def stretch(x, rate, name):
    p = OUT / (name + '-input.wav')
    q = OUT / (name + '-stretched.wav')
    write(p, x)
    subprocess.run([str(FF), '-v', 'error', '-nostdin', '-y', '-i', str(p),
                    '-af', 'atempo=' + str(rate), '-ar', str(RATE), '-ac', '1',
                    '-c:a', 'pcm_s16le', str(q)], check=True)
    return read(q)

def envelope(x):
    frames = np.lib.stride_tricks.sliding_window_view(x, W)[::H]
    logmag = np.log(np.maximum(np.mean(abs(np.fft.rfft(frames * WIN, n=N)), axis=0), 1e-6))
    cep = np.fft.irfft(logmag, n=N)
    q = np.minimum(np.arange(N), N-np.arange(N))
    lift = np.zeros(N)
    lift[q <= 30] = 1
    taper = (q > 30) & (q < 52)
    lift[taper] = .5 * (1 + np.cos((q[taper]-30) / 22 * np.pi))
    return np.fft.rfft(cep * lift).real

def smooth(x, k=481):
    return np.convolve(np.pad(x, (k//2, k//2), mode='edge'), np.ones(k)/k, mode='valid')

def prefix(x, reference_o, name):
    x = trim(x)
    x = stretch(x, max(.5, min(1., len(x)/RATE/.64)), name)
    # Use the stable vowel region, after the initial consonant/nasal attack.
    ea = envelope(x[round(.18*RATE):round(.36*RATE)])
    eo = envelope(reference_o)
    f = np.fft.rfftfreq(N, 1/RATE)
    delta = eo-ea
    delta -= np.mean(delta[(f >= 250) & (f <= 3500)])
    delta = np.clip(delta, -np.log(4), np.log(4))
    delta *= np.clip((f-60)/100, 0, 1) * np.clip((7000-f)/1500, 0, 1)
    pad = W//2
    padded = np.pad(x, (pad, pad), mode='reflect')
    y, weight = np.zeros(len(padded)), np.zeros(len(padded))
    for pos in range(0, len(padded)-W+1, H):
        t = (pos+W/2-pad)/RATE
        a = float(np.clip((t-.13)/.22, 0, 1))
        a = a*a*(3-2*a)
        spec = np.fft.rfft(padded[pos:pos+W]*WIN, n=N)
        frame = np.fft.irfft(spec*np.exp(a*delta), n=N)[:W]
        y[pos:pos+W] += frame*WIN
        weight[pos:pos+W] += WIN*WIN
    y = y[pad:pad+len(x)] / np.maximum(weight[pad:pad+len(x)], 1e-12)
    rms = np.sqrt(smooth(y*y, 481) + 1e-12)
    active = rms > max(.003, rms.max()*.04)
    desired = np.median(rms[active])
    # Keep the O audible instead of following the old A's early decay. This
    # is a smooth gain, not a new oscillator, vowel attack, or inserted clip.
    gain = np.clip(desired / np.maximum(rms, .002), .7, 2.7)
    gain = smooth(gain, 961)
    t = np.arange(len(y))/RATE
    ramp = np.clip((t-.08)/.10, 0, 1) * np.clip((len(y)/RATE-.03-t)/.07, 0, 1)
    y *= 1 + (gain-1)*ramp
    active = abs(y) > .003
    y *= min(.82/np.max(abs(y)), .12 / np.sqrt(np.mean(y[active]**2)))
    return np.r_[np.zeros(720), fade(y), np.zeros(1200)]

def ny(x, name):
    x = trim(x)
    # Stretch all speech together: do not drop, re-synthesize or splice the
    # palatal nasal, which is part of the consonant rather than an added Y.
    x = stretch(x, min(.87, max(.58, len(x)/RATE/.58)), name)
    t = np.arange(len(x))/RATE
    gain = 1 + .45*np.clip((.24-t)/.15, 0, 1)*np.clip(t/.025, 0, 1)
    x *= smooth(gain)
    active = abs(x) > .002
    x *= min(.82/np.max(abs(x)), .12/np.sqrt(np.mean(x[active]**2)))
    return np.r_[np.zeros(720), fade(x), np.zeros(1200)]

report = {'status': 'audition', 'published': False, 'humanPhoneticCertification': False,
          'prefixMethod': 'one original voicing; continuous A-to-O spectral-envelope transition; no internal O clip',
          'nyMethod': 'preserve original palatal-nasal phonemes; gentle onset gain and pitch-preserving time stretch',
          'clips': []}
corpus = json.loads((R/'monlam-corpus.json').read_text())
ids = {e['text']: e['id'] for e in corpus['entries']}
plans = json.loads((R/'monlam-jorlok-plans.json').read_text())
ny_results = {st['text'] for p in plans.values()
              if p['parts'].get('root') == 'ཉ' and p['parts'].get('vowel', '') in ('', 'ི', 'ེ')
              for st in p['steps'] if st['kind'] == 'result'}
base_ny_ids = {'m0008', 'm0059', 'm0061', 'm0697', 'm0700'}
for voice, folder in [('male', 'monlam-wav-male'), ('female', 'monlam-wav')]:
    opath = R/folder/('m0542.wav' if voice == 'male' else 'm0150.wav')
    a, b = ((.65, .86) if voice == 'male' else (.35, .62))
    ref = read(opath)[round(a*RATE):round(b*RATE)]
    sequences = {'prefixes': [], 'ny': []}
    for name, ident in [('gao','m0003'), ('dao','m0011'), ('bao','m0015'), ('mao','m0016'), ('ao','m0023')]:
        src = R/folder/(ident+'.wav')
        x = prefix(read(src), ref, voice+'-'+name)
        p = OUT/(voice+'-'+name+'.wav')
        sha = write(p, x)
        blocks = x[round(.09*RATE):round((len(x)/RATE-.12)*RATE)]
        rms = np.sqrt(np.mean(blocks[:len(blocks)//240*240].reshape(-1, 240)**2, axis=1))
        report['clips'].append({'voice':voice, 'unit':name, 'path':str(p), 'source':str(src),
                               'pcmSha256':sha, 'seconds':len(x)/RATE, 'peak':float(np.max(abs(x))),
                               'internalSilent10msBlocks':int(np.count_nonzero(rms < .001))})
        sequences['prefixes'] += [x, np.zeros(12000)]
    for name, ident in [('nya','m0008'), ('nye','m0061'), ('nyi','m0059'), ('nyin','m0697'), ('nyes','m0700')]:
        src = R/folder/(ident+'.wav')
        x = ny(read(src), voice+'-'+name)
        p = OUT/(voice+'-'+name+'.wav')
        sha = write(p, x)
        report['clips'].append({'voice':voice, 'unit':name, 'sourceId':ident, 'path':str(p),
                               'source':str(src), 'pcmSha256':sha, 'seconds':len(x)/RATE,
                               'peak':float(np.max(abs(x)))})
        sequences['ny'] += [x, np.zeros(12000)]
    for text in sorted(ny_results):
        ident = ids[text]
        if ident in base_ny_ids:
            continue
        src = R/folder/(ident+'.wav')
        x = ny(read(src), voice+'-'+ident)
        p = OUT/(voice+'-'+ident+'.wav')
        sha = write(p, x)
        report['clips'].append({'voice':voice, 'unit':ident, 'text':text,
                               'sourceId':ident, 'path':str(p), 'source':str(src),
                               'pcmSha256':sha, 'seconds':len(x)/RATE,
                               'peak':float(np.max(abs(x))),
                               'originalToneAndVowelPreserved':True})
    for name, seq in sequences.items():
        write(O/(voice+'-'+name+'-clear-20261111.wav'), np.concatenate(seq[:-1]))
(D/'clear-units-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({'clips':len(report['clips']), 'prefixesWithoutInternalGaps':all(c['internalSilent10msBlocks']==0 for c in report['clips'] if 'internalSilent10msBlocks' in c), 'status':report['status']}))
