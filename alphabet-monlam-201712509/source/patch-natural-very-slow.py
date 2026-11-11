from pathlib import Path
import hashlib
import json

D = Path(__file__).resolve().parent
R = D.parent
source = R / 'word-clarity-followup-20261111/tilda-final.html'
before = source.read_text()
baseline = D / 'tilda-before.html'
if not baseline.exists():
    baseline.write_text(before)
text = baseline.read_text()
old = 'tools.appendChild(makeAudioButton(word,"Послушать слово целиком "+word,"Слово"));'
new = 'var unitLabel=audioUnitLabel(word);tools.appendChild(makeAudioButton(word,"Послушать "+unitLabel.toLowerCase()+" целиком "+word,unitLabel));'
assert text.count(old) == 1
text = text.replace(old, new)
needle = 'function renderWordRows(partsFunction,buttonClass){'
helper = '''function audioUnitLabel(word){
 return audioKey(word)==="ཤ་བཙིར་རྒྱག"?"Словосочетание":"Слово";
}
'''
assert text.count(needle) == 1
text = text.replace(needle, helper + needle)
text = text.replace('.tw-word-audio{display:flex;flex-basis:', '.tw-word-audio{display:flex;flex-wrap:wrap;flex-basis:')
for variable, folder in [('MONLAM_SPELLING_BASE', 'spelling'), ('MONLAM_SLOW_SPELLING_BASE', 'spelling-slow'), ('MONLAM_VERY_SLOW_AUDIO_BASE', 'audio-very-slow'), ('MONLAM_VERY_SLOW_SPELLING_BASE', 'spelling-very-slow')]:
    start = text.index('var ' + variable + '=')
    end = text.index(';', start)
    text = text[:start] + 'var ' + variable + '="__NATURAL_ASSET_BASE__/' + folder + '/"' + text[end:]
(D / 'tilda-template.html').write_text(text)
(D / 'phrase-label-evidence.json').write_text(json.dumps({
    'labelledPhrase': 'ཤ་བཙིར་རྒྱག', 'label': 'Словосочетание',
    'classification': 'structural analysis: nominal component plus the verbalizer རྒྱག',
    'classificationIsInference': True,
    'grammarSource': 'https://tibetanlanguage.school/learn/standard-tibetan/unit-8/#6-complex-verbs',
    'shortForm': 'ཤ་བཙིར', 'shortFormLabelChanged': False,
    'shortFormExactDictionaryEntryFound': False,
    'dictionaryChecked': 'https://dictionary.christian-steinert.de/#/search/tib/sha%20btsir?sidebar=true',
    'phraseRecordingRequestsCancelled': True, 'newPhraseRecordings': 0,
    'displayedTibetanTextAndJorlokPlansUnchanged': True,
}, ensure_ascii=False, indent=2))
print(json.dumps({'templateSha256': hashlib.sha256(text.encode()).hexdigest(), 'phraseLabelChanged': True, 'phraseRecordingsCreated': 0}))
