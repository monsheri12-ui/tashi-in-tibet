"""Clear word audio and approved Jorlok fragments with no extra time stretch.

The very-slow selector is a reading profile. It retains longer pauses between
Jorlok steps, while every speech fragment plays at its source cadence.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import base64
import hashlib
import json
import shutil
import subprocess
import time
import wave

D = Path(__file__).resolve().parent
R = D.parent
W = R / 'word-clarity-followup-20261111'
C = json.loads((R / 'monlam-corpus.json').read_text())
FF = next((R / 'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
key = lambda s: s.strip().rstrip('་།')
words = {key(w) for w in C['words']}
word_ids = {e['id'] for e in C['entries'] if key(e['text']) in words}
assert len(word_ids) == len(words) == 500


def word(voice, entry):
    ident = entry['id']
    source = W / 'rendered' / voice / (ident + '-level.wav')
    # This is the clarity pass BEFORE the previous .78 atempo operation.
    wav = D / 'wav' / voice / (ident + '.wav')
    mp3 = D / 'mp3' / voice / (ident + '.mp3')
    wav.parent.mkdir(parents=True, exist_ok=True)
    mp3.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(source)) as f:
        assert (f.getnchannels(), f.getsampwidth(), f.getframerate()) == (1, 2, 24000)
        raw = f.readframes(f.getnframes())
    shutil.copyfile(source, wav)
    subprocess.run([str(FF), '-v', 'error', '-nostdin', '-y', '-i', str(wav),
                    '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a',
                    '128k', '-map_metadata', '-1', str(mp3)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    return voice, ident, mp3.read_bytes(), {
        'id': ident, 'text': entry['text'], 'source': str(source),
        'sourcePcmSha256': hashlib.sha256(raw).hexdigest(),
        'wavCopiedExactly': True, 'seconds': len(raw) / 48000,
        'timeStretchApplied': False, 'clearWholeWordSource': True,
    }


started = time.monotonic()
rows = {}
with ThreadPoolExecutor(max_workers=4) as pool:
    jobs = [pool.submit(word, v, e) for v in ['male', 'female']
            for e in C['entries'] if e['id'] in word_ids]
    for n, task in enumerate(as_completed(jobs), 1):
        voice, ident, encoded, meta = task.result()
        rows[voice, ident] = (encoded, meta)
        if n % 250 == 0:
            print(json.dumps({'wordsEncoded': n, 'total': len(jobs),
                              'seconds': round(time.monotonic() - started)}), flush=True)

manifest = {'version': 3, 'profile': 'natural-speech-longer-jorlok-pauses',
            'recordedRate': .6, 'tempoValueIsVariantId': True,
            'browserPlaybackRate': 1, 'additionalTimeStretch': False,
            'wholeWordAdditionalTimeStretch': False,
            'wordSource': 'clarity-supported source before time-stretch',
            'fragmentSource': 'approved ordinary recordings copied exactly',
            'jorlokPauses': {'symbol': .21 / .6, 'result': .30 / .6,
                             'betweenSyllables': .65 / .6},
            'ordinaryAndSlowAudioUnchanged': True, 'words': 500,
            'voices': {}, 'spelling': {}, 'prefixChecks': []}
uploads = []
for voice in ['male', 'female']:
    records = []
    for original in sorted((R / 'monlam-audio' / voice).glob('*.json')):
        bank = json.loads(original.read_text())
        bank.update(recordedRate=.6, speechTempo=1,
                    profile=manifest['profile'], additionalTimeStretch=False)
        for ident, encoded in list(bank['clips'].items()):
            if ident in word_ids:
                data, meta = rows[voice, ident]
                bank['clips'][ident] = base64.b64encode(data).decode()
                records.append(meta)
            else:
                records.append({'id': ident, 'clearWholeWordSource': False,
                                'ordinaryClipCopiedExactly': True,
                                'encodedSha256': hashlib.sha256(base64.b64decode(encoded)).hexdigest(),
                                'timeStretchApplied': False})
        dest = D / 'audio' / voice / original.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(bank, separators=(',', ':')))
        uploads.append({'local': str(dest), 'remote': 'alphabet-monlam-201712509/audio-very-slow/' + voice + '/' + original.name, 'encoding': 'utf-8'})
    manifest['voices'][voice] = records
    normal = json.loads((R / 'monlam-spelling' / (voice + '.json')).read_text())
    normal.update(recordedRate=.6, speechTempo=1,
                  profile=manifest['profile'], additionalTimeStretch=False)
    for syllable, plan in normal['plans'].items():
        prefix = plan['parts'].get('prefix')
        if prefix:
            assert plan['steps'][0]['stage'] == 'prefix-glide'
            assert plan['steps'][0]['text'] in normal['clips']
            assert not any(step['text'] == '@prefix' for step in plan['steps'])
            manifest['prefixChecks'].append({'voice': voice, 'syllable': syllable,
                                             'prefix': prefix, 'firstStep': plan['steps'][0]})
    manifest['spelling'][voice] = {'symbols': len(normal['clips']),
                                  'clipsCopiedExactly': True,
                                  'plansUnchanged': True}
    dest = D / 'spelling' / (voice + '.json')
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(normal, ensure_ascii=False, separators=(',', ':')))
    uploads.append({'local': str(dest), 'remote': 'alphabet-monlam-201712509/spelling-very-slow/' + voice + '.json', 'encoding': 'utf-8'})

(D / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
(D / 'upload-files.json').write_text(json.dumps(uploads, ensure_ascii=False, indent=2))
print(json.dumps({'wordVoiceRecordings': len(rows), 'jsonFiles': len(uploads),
                  'prefixPlansChecked': len(manifest['prefixChecks']),
                  'seconds': round(time.monotonic() - started)}), flush=True)
