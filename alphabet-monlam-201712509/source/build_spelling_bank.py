from pathlib import Path
import array
import base64
import hashlib
import json
import sys
import wave
from ao_glide_plans import AO_SYMBOL, with_ao_glide

ROOT = Path(__file__).resolve().parent
corpus = json.loads((ROOT / 'monlam-corpus.json').read_text())
RATE = 24000
sys.path.insert(0, str(ROOT / 'python-libs'))
import lameenc
EXTRAS = {'ི': ('gigu', 'gigu'), 'ུ': ('zhabkyu', 'zhabkyu'),
          'ེ': ('drengbu', 'drengbu'), 'ོ': ('naro', 'naro'),
          'ཱ': ('achung', 'a chung')}


def pcm(path):
    with wave.open(str(path), 'rb') as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, RATE)
        raw = wav.readframes(min(wav.getnframes(), path.stat().st_size // 2))
    samples = array.array('h', raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    peak = max(map(abs, samples))
    assert peak > 500, (path, peak)
    threshold = max(90, peak * .009)
    active = [i for i, sample in enumerate(samples) if abs(sample) >= threshold]
    start = max(0, active[0] - int(.05 * RATE))
    end = min(len(samples), active[-1] + int(.08 * RATE))
    kept = samples[start:end]
    if sys.byteorder != 'little':
        kept.byteswap()
    return kept.tobytes(), {'source': path.name, 'seconds': len(kept) / RATE,
                            'sourcePcmSha256': hashlib.sha256(raw).hexdigest()}


def encoded(audio, bit_rate=48):
    encoder=lameenc.Encoder()
    encoder.set_bit_rate(bit_rate);encoder.set_in_sample_rate(RATE)
    encoder.set_channels(1);encoder.set_quality(2)
    return base64.b64encode(encoder.encode(audio)+encoder.flush()).decode('ascii')

out = ROOT / 'monlam-spelling'
out.mkdir(exist_ok=True)
audit = {'coverageWords': len(corpus['words']), 'voices': {}, 'examples': {}}
aliases = {alias: item['base'] for item in corpus['letters'] for alias in item['aliases']}
for voice, folder in [('female', 'monlam-wav'), ('male', 'monlam-wav-male')]:
    bank = {'version': 1, 'voice': voice, 'sampleRate': RATE, 'sampleWidth': 2,
            'channels': 1, 'encoding': 'mp3', 'labels': {}, 'clips': {}}
    # These prefixes do not change the sound of ca/kha. Use an unprefixed
    # recording for the incomplete construction; retain the written label.
    # This does not alias completed words or their final syllable results.
    if voice == 'male':
        bank['resultAliases'] = {'བཅོ': 'ཅོ', 'འཁྱ': 'ཁྱ'}
    else:
        # The isolated rga source has the wrong vowel. dga' supplies the same
        # voiced ga sound, while the spelling label stays the written root.
        bank['resultAliases'] = {'རྒ': 'དགའ'}
    records = {}
    for index, item in enumerate(corpus['letters']):
        symbol, label = item['base'], item['name']
        assert corpus['entries'][index]['text'] == symbol
        path = ROOT / folder / f'm{index+1:04d}.wav'
        audio, metadata = pcm(path)
        bank['clips'][symbol] = encoded(audio)
        bank['labels'][symbol] = label
        records[symbol] = metadata
    for key, filename, label in [('@prefix', 'prefix', 'o'), ('@tags', 'tags', 'ta'), ('@wasur', 'wasur', 'wa zur')]:
        audio, metadata = pcm(ROOT / 'monlam-spelling-extra' / f'{voice}-{filename}.wav')
        bank['clips'][key] = encoded(audio)
        bank['labels'][key] = label
        records[key] = metadata
    for symbol, (extra, label) in EXTRAS.items():
        audio, metadata = pcm(ROOT / 'monlam-spelling-extra' / f'{voice}-{extra}.wav')
        bank['clips'][symbol] = encoded(audio)
        bank['labels'][symbol] = label
        records[symbol] = metadata
    for word in corpus['words']:
        for ch in word:
            if ch in '་།༎༏༐༑༔ \n\r\t':
                continue
            assert aliases.get(ch, ch) in bank['clips'], (word, ch)
    if voice == 'male':
        audio, metadata = pcm(ROOT / 'monlam-spelling-extra/male-ao-prefix.wav')
        bank['clips'][AO_SYMBOL] = encoded(audio, bit_rate=128)
        bank['labels'][AO_SYMBOL] = 'ao'
        records[AO_SYMBOL] = metadata
    bank['plans'] = with_ao_glide(
        json.loads((ROOT / 'monlam-jorlok-plans.json').read_text()), voice)
    for item in bank['plans'].values():
        for step in item['steps']:
            if step['kind'] == 'symbol':
                assert step['text'] in bank['clips'], step
    file = out / f'{voice}.json'
    file.write_text(json.dumps(bank, ensure_ascii=False, separators=(',', ':')))
    audit['voices'][voice] = {'symbols': len(bank['clips']), 'bytes': file.stat().st_size,
                              'fileSha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                              'recordings': records}
    for word in ['ཀོ་ཐག་', 'སྐད་ཅོར་', 'དཀའ་ལས་']:
        labels = [bank['labels'][aliases.get(ch, ch)] for ch in word if ch not in '་། ']
        audit['examples'][word] = labels

(ROOT / 'monlam-spelling-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
print(json.dumps({k: {a: b for a, b in v.items() if a != 'recordings'}
                  for k, v in audit['voices'].items()}, ensure_ascii=False))
