from pathlib import Path
import base64
import hashlib
import html
import json
import os
import re
import wave
import zipfile

D = Path(__file__).resolve().parent
R = D.parent
O = R.parent / 'outputs'
H = json.loads((R / 'monlam-jorlok-hosting.json').read_text())
V = json.loads((D / 'verification.json').read_text())
L = json.loads((D / 'public-live-verification.json').read_text())
P = json.loads((D / 'prefix-manifest.json').read_text())
assert L['preferencesAndProgressRestored'] and all(t['playing'] == 1 for t in L['tests'])
assert not V['toneCandidates'] and not V['clippedFiles']
assert V['wholeWordRecordingsWithoutTimeStretch'] == 1000
assert V['originalMainAudioBanksUnchanged'] == 140
assert V['prefixPlansChecked'] == 696
code = (D / 'tilda-final.html').read_bytes()
assert hashlib.sha256(code).hexdigest() == H['sourceSha256']

# Public proof omits the learner's concrete progress values.
public = {k: v for k, v in L.items() if k != 'restored'}
public.update(sourceSha256=H['sourceSha256'], integrationCommit=H['integrationCommit'],
              additionalTimeStretch=False, wordSourceWavsCopiedExactly=1000,
              prefixVoiceRecordings=10, prefixTempos=[1, .8, .6],
              originalWholeWordAudioInNormalAndSlowUnchanged=True,
              phraseReRecordings=0, fullCorpusHumanPhoneticCertification=False,
              horizontalOverflow=L['restored']['horizontalOverflow'],
              pinCounts=L['restored']['pinCounts'])
(D / 'public-live-sanitized.json').write_text(json.dumps(public, ensure_ascii=False, indent=2))

def pcm(p):
    with wave.open(str(p)) as f:
        assert (f.getnchannels(), f.getsampwidth(), f.getframerate()) == (1, 2, 24000)
        return f.readframes(f.getnframes())


for voice in ['male', 'female']:
    data = b'\0' * 33600
    parts = [pcm(D / 'wav' / voice / (ident + '.wav')) for ident in ['m0350', 'm0455', 'm0228']]
    with wave.open(str(O / (voice + '-very-slow-word-samples-20261111.wav')), 'wb') as f:
        f.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        f.writeframes(data.join(parts))

review = O / 'tibetan-very-slow-three-words.html'
old = review.read_text()
font = re.search(r'@font-face\{[^}]+\}', old).group()
body = ['<h1>Чёткое чтение без дополнительного растягивания</h1><p>Три фразы в обоих голосах. Для «Очень медленного» взяты подготовленные записи до обработки скорости. Плееры работают без JavaScript.</p>']
phrases = [('m0350', 'བཟོད་གསོལ་ཞུ'), ('m0455', 'འདེམས་བསྒྲུགས་བྱེད'), ('m0228', 'གོ་རིམ་མེད་པ')]
for ident, text in phrases:
    body.append('<section><h2 lang="bo">' + html.escape(text) + '</h2>')
    if ident == 'm0350':
        body.append('<p>Конечная ལ་ может ослабляться, удлиняя гласный. В разборе по буквам её название произносится как «ла».</p>')
    for voice, label in [('male', 'Мужской'), ('female', 'Женский')]:
        index = int(ident[1:]) - 1
        normal = json.loads((R / 'monlam-audio' / voice / (f'{index // 32:03}.json')).read_text())['clips'][ident]
        current = base64.b64encode((D / 'mp3' / voice / (ident + '.mp3')).read_bytes()).decode()
        body.append('<h3>' + label + ' голос</h3><div class="pair">')
        for caption, encoded in [('Обычный', normal), ('Очень медленный — без дополнительного растягивания', current)]:
            body.append('<div><p>' + caption + '</p><audio controls preload="none" src="data:audio/mpeg;base64,' + encoded + '"></audio></div>')
        body.append('</div>')
    body.append('</section>')
css = font + 'body{max-width:1050px;margin:30px auto;padding:0 18px;background:#faf7ef;color:#28263d;font:16px/1.55 system-ui,sans-serif}section{margin:24px 0;padding:24px;border:1px solid #ddd4c6;border-radius:18px;background:#fffefa}h2{font:38px/1.9 Tib,serif}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}audio{width:100%}p{color:#68636f}@media(max-width:620px){.pair{grid-template-columns:1fr}h2{font-size:30px}}'
review.write_text('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Чёткое чтение без растягивания</title><style>' + css + '</style></head><body>' + ''.join(body) + '</body></html>')
assert review.read_text().count('<audio ') == 12

# Keep the package's ordinary and slow whole-word clips, replace only the
# current profile, approved prefix clips, source, and evidence.
files = {row['remote'].removeprefix('alphabet-monlam-201712509/'): Path(row['local']) for row in json.loads((D / 'final-upload-files.json').read_text())}
files.update({
    'tilda.html': O / 'tilda-trainer-monlam.html',
    'hosting.json': R / 'monlam-jorlok-hosting.json',
    'checks/public-natural-very-slow-20261111.json': D / 'public-live-sanitized.json',
    'checks/natural-very-slow-20261111.json': D / 'verification.json',
    'checks/natural-very-slow-client.json': D / 'client-verification.json',
    'checks/prefix-approvals-20261111.json': D / 'prefix-approvals.json',
    'source/verify-natural-very-slow.py': D / 'verify.py',
    'source/natural-profile-readme.txt': D / 'README.txt',
    'source/finalize-natural-profile.py': D / 'finalize.py',
    'screenshots/natural-prefixes-published.png': O / 'natural-prefixes-published.png',
    'screenshots/natural-slow-phrase-published.png': O / 'natural-slow-phrase-published.png',
    'examples/three-clear-words.html': review,
})
for record in P['records']:
    name = record['voice'] + '-' + record['unit']
    files['source/approved-prefixes/' + name + '.wav'] = D / 'approved-prefixes' / (name + '.wav')
    files['source/' + name + '-prefix.wav'] = Path(record['wav'])
for voice in ['male', 'female']:
    files['examples/' + voice + '-prefixes-approved-20261111.wav'] = O / (voice + '-prefixes-approved-20261111.wav')
    files['examples/' + voice + '-very-slow-word-samples-20261111.wav'] = O / (voice + '-very-slow-word-samples-20261111.wav')

archive = O / 'tibetan-alphabet-monlam-jorlok.zip'
temporary = D / 'trainer-final.zip'
with zipfile.ZipFile(archive) as old_zip, zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as new_zip:
    seen = set()
    for info in old_zip.infolist():
        assert info.filename not in seen
        seen.add(info.filename)
        if info.filename in files:
            new_zip.write(files[info.filename], info.filename)
        elif info.filename == 'README.txt':
            new_zip.writestr(info.filename, old_zip.read(info.filename).decode() + '\n\nCURRENT PROFILE: source/natural-profile-readme.txt. Approved prefix names in all three tempos; no extra Very Slow speech stretching. Current public check: checks/public-natural-very-slow-20261111.json.\n')
        else:
            new_zip.writestr(info, old_zip.read(info.filename))
    for name, path in files.items():
        if name not in seen:
            new_zip.write(path, name)
with zipfile.ZipFile(temporary) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == len(set(z.namelist()))
    assert all(z.read(name) == path.read_bytes() for name, path in files.items())
    count = len(z.namelist())
os.replace(temporary, archive)
report = {
    'published': True, 'url': H['publishedUrl'], 'assetCommit': H['verySlowAudioCommit'],
    'integrationCommit': H['integrationCommit'], 'sourceSha256': H['sourceSha256'],
    'wholeWords': 500, 'voices': ['male', 'female'],
    'wholeWordSourcesCopiedWithoutTimeStretch': 1000,
    'prefixVoiceRecordings': 10, 'prefixTempos': [1, .8, .6],
    'prefixPlanVariantChecks': 696, 'userApprovedPrefixSamples': True,
    'verySlowAdditionalTimeStretch': False, 'browserPlaybackRate': 1,
    'ordinaryAndSlowWholeWordAudioUnchanged': True,
    'wordAndJorlokControlsRetained': True,
    'phraseButton': {'text': 'ཤ་བཙིར་རྒྱག་', 'label': 'Словосочетание'},
    'phraseRecordingsCreated': 0, 'shortPhraseClassificationConfirmed': False,
    'technicalAudioFilesChecked': 2296, 'toneCandidates': 0, 'clippedFiles': 0,
    'livePlaybackTests': len(L['tests']), 'learnerProgressPreserved': True,
    'wholeCorpusHumanPhoneticCertification': False,
    'reviewFile': str(review),
    'archive': {'bytes': archive.stat().st_size, 'files': count,
                'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'crcPassed': True},
}
for name in ['natural-slow-prefix-release-report.json', 'very-slow-word-release-report.json']:
    (O / name).write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False), flush=True)
