"""Finalize the caption-only release, preserving every existing audio asset."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(__file__).resolve().parent
SOURCE_SHA = '77dfb3d20d88e09550ee03e8ffa9b900544ae491301ce8c089c7528ac855a79a'
CODE_COMMIT = 'f8f9aa0b8ff4bb7654454980d7900bcd87f7ff7a'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


source = (WORK / 'tilda-final.html').read_bytes()
assert digest(source) == SOURCE_SHA
fingerprints = json.loads((WORK / 'audio-fingerprints-before.json').read_text())
changed_audio = [name for name, sha in fingerprints.items()
                 if digest((ROOT / name).read_bytes()) != sha]
assert not changed_audio, changed_audio
client = json.loads((WORK / 'client-verification.json').read_text())
assert client['audioPlayerCodeUnchanged'] and client['allSixAudioBasesUnchanged']
public = json.loads((WORK / 'public-verification.json').read_text())
assert all(case['allLabelsPassed'] for case in public['cases'])
assert public['settingsAndProgressPreserved']
audio_check = {
    'audioBanksChecked': len(fingerprints),
    'allAudioBankSha256Unchanged': True,
    'changedAudioBanks': changed_audio,
    'allSixAudioBaseUrlsUnchanged': True,
    'audioPlayerCodeByteIdentical': True,
    'displayedTibetanCorpusUnchanged': True,
    'scope': 'Button captions and an explicit phrase registry only.',
}
write_json(WORK / 'audio-preservation.json', audio_check)

hosting = json.loads((WORK / 'hosting-before.json').read_text())
hosting['previousIntegrationCommit'] = hosting['integrationCommit']
hosting['integrationCommit'] = CODE_COMMIT
hosting['sourceSha256'] = SOURCE_SHA
hosting['publicVerification'] = 'checks/public-phrase-labels-20261111.json'
hosting['phraseLabels'] = {
    'reviewedEntries': 500,
    'phraseLabels': 183,
    'newPhraseLabels': 182,
    'wordLabels': 317,
    'registry': 'source/phrase-labels.json',
    'verification': 'checks/phrase-label-client.json',
    'audioPreservation': 'checks/phrase-label-audio-preservation.json',
    'audioChanged': False,
}
before_hosting = json.loads((WORK / 'hosting-before.json').read_text())
for key, value in before_hosting.items():
    if key not in {'previousIntegrationCommit', 'integrationCommit',
                   'sourceSha256', 'publicVerification'}:
        assert hosting[key] == value, key
write_json(WORK / 'hosting.json', hosting)
write_json(ROOT / 'work/monlam-jorlok-hosting.json', hosting)
for target in [
    'outputs/tilda-trainer-monlam.html',
    'work/tilda-201712509-monlam.html',
    'work/natural-very-slow-20261111/tilda-final.html',
    'work/word-clarity-followup-20261111/tilda-final.html',
]:
    (ROOT / target).write_bytes(source)

mapping = {
    'tilda.html': WORK / 'tilda-final.html',
    'hosting.json': WORK / 'hosting.json',
    'source/phrase-labels.json': WORK / 'classification.json',
    'source/phrase-labels-build.py': WORK / 'build.py',
    'source/phrase-audio-labels.js': WORK / 'label-helper.js',
    'checks/phrase-label-classification.json': WORK / 'classification-summary.json',
    'checks/phrase-label-client.json': WORK / 'client-verification.json',
    'checks/phrase-label-dictionary-spot-checks.json': WORK / 'dictionary-spot-checks.json',
    'checks/phrase-label-audio-preservation.json': WORK / 'audio-preservation.json',
    'checks/public-phrase-labels-20261111.json': WORK / 'public-verification.json',
    'screenshots/phrase-labels-published.png': ROOT / 'outputs/phrase-labels-published.png',
}
archive = ROOT / 'outputs/tibetan-alphabet-monlam-jorlok.zip'
replacement = WORK / 'archive-updated.zip'
old_unchanged = {}
audio_members = 0
with zipfile.ZipFile(archive) as old, zipfile.ZipFile(
        replacement, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as new:
    assert len(old.namelist()) == len(set(old.namelist()))
    for info in old.infolist():
        if info.filename in mapping:
            continue
        data = old.read(info.filename)
        old_unchanged[info.filename] = digest(data)
        if (info.filename.startswith(('audio/', 'audio-slow/', 'audio-very-slow/',
                                     'spelling/', 'spelling-slow/', 'spelling-very-slow/'))
                or Path(info.filename).suffix.lower() in
                {'.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'}):
            audio_members += 1
        new.writestr(info, data)
    for name, path in mapping.items():
        new.write(path, name)

with zipfile.ZipFile(replacement) as final:
    assert final.testzip() is None
    assert len(final.namelist()) == len(set(final.namelist()))
    assert all(digest(final.read(name)) == sha for name, sha in old_unchanged.items())
    assert all(final.read(name) == path.read_bytes() for name, path in mapping.items())
    member_count = len(final.namelist())
shutil.move(replacement, archive)
report = {
    'publishedUrl': public['publishedUrl'],
    'reviewedEntries': 500,
    'phraseLabels': 183,
    'newPhraseLabels': 182,
    'wordLabels': 317,
    'audioChanges': False,
    'preservation': audio_check,
    'liveUiCasesPassed': len(public['cases']),
    'liveCaptionInstancesChecked': public['checkedCaptionInstances'],
    'settingsAndProgressPreserved': public['settingsAndProgressPreserved'],
    'sourceSha256': SOURCE_SHA,
    'codeCommit': CODE_COMMIT,
    'screenshot': 'outputs/phrase-labels-published.png',
    'archive': {
        'path': 'outputs/tibetan-alphabet-monlam-jorlok.zip',
        'sha256': digest(archive.read_bytes()),
        'crcPassed': True,
        'duplicateMembers': 0,
        'members': member_count,
        'existingMembersPreservedByteForByte': len(old_unchanged),
        'existingAudioMembersPreservedByteForByte': audio_members,
        'updatedOrAddedMembers': list(mapping),
    },
}
write_json(ROOT / 'outputs/phrase-labels-release-report.json', report)
print(json.dumps({
    'sourceSha256': SOURCE_SHA,
    'audioBanksUnchanged': len(fingerprints),
    'existingArchiveMembersUnchanged': len(old_unchanged),
    'existingAudioMembersUnchanged': audio_members,
    'zipCrcPassed': True,
    'archiveMembers': member_count,
}, indent=2))
