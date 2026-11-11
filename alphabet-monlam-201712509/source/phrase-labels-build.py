"""Reviewed learner-facing word/phrase labels; changes no Tibetan or audio.

The whitelist is explicit. Runtime labels never depend on syllable count or
on a generic 'ends in byed' heuristic. Sources support the structural types;
the individual classifications are a review of this trainer's fixed corpus.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re

D = Path(__file__).resolve().parent
R = D.parent
C = json.loads((R / 'monlam-corpus.json').read_text())
key = lambda text: text.strip().rstrip('་།')
words = C['words']
assert len(words) == len(set(map(key, words))) == 500
sources = {
    'verbs': 'https://tibetanlanguage.school/learn/standard-tibetan/unit-8/#6-verbalizers',
    'adjectives': 'https://tibetanlanguage.school/learn/standard-tibetan/unit-6/#1-1-simple-and-complex-adjectives',
    'phrases': 'https://tibetanlanguage.school/learn/standard-tibetan/unit-7/',
}
reviewed = {}


def add(text, category, parts, reason, source):
    text = key(text)
    assert text in set(map(key, words)), text
    assert text not in reviewed, text
    assert '་'.join(parts) == text, (text, parts)
    reviewed[text] = {'label': 'Словосочетание', 'category': category,
                      'components': parts, 'reason': reason,
                      'structuralSource': sources[source],
                      'classificationIsStructuralReview': True}


# All 134 candidates below were reviewed in context of the complete 500-item
# list, including the base entries paired with longer verb constructions.
verbal = '''
ཀོ་བ་གཏོང་ ཁ་གཏོང་ ཁ་ཆད་བྱེད་ ཁ་རྒྱག་ ཁ་རྡུང་གཏོང་
ཁབ་རྒྱག་ ཁོང་ཁྲོ་ཟ་བ་ ཁྱབ་བསྒྲགས་བྱེད་ ཁྲི་རྒྱག་ ཁྲིད་བྱེད་
གངས་ཤུད་གཏོང་ གཅིན་པ་གཏོང་ གདན་རྒྱག་ གཟེར་རྒྱག་
གཤག་བཅོས་བྱེད་ གསོལ་ཚིགས་གཏོང་ གུར་རྒྱག་ གུས་ཞབས་བྱེད་
གྲ་སྒྲིག་བྱེད་ གྲུ་གཏོང་ གྲྭ་པ་བྱེད་ གླིང་བུ་གཏོང་ གླུ་གཏོང་
གློ་རྒྱག་ གློག་རྒྱག་ ང་རྒྱལ་བྱེད་ ངོ་རྒོལ་བྱེད་ ངོ་རྒོལ་རྒྱག་
ཆབ་སྒྲོག་རྒྱག་ ཆམ་པ་རྒྱག་ ཆུ་གཏོང་ ཆུ་རྒྱག་ ཇ་གཏོང་
ཇག་པ་རྒྱག་ ཉེས་འཛུགས་བྱེད་ ཐོག་རྒྱག་ དཀའ་ངལ་མྱོང་
དཀའ་པོ་བྱེད་ དཀའ་ལས་རྒྱག་ དགག་བྱ་བྱེད་
དགོངས་དག་ཐུགས་བདེན་ཞུ་ དགོངས་སེལ་ཞུ་ དམག་རྒྱག་
དམའ་འབེབས་གཏོང་ ནང་ཤ་རྒྱག་ པར་རྒྱག་ བཀག་བསྐྱིལ་བྱེད་
བཀའ་གཏོང་ བཀའ་སྐྱོན་གཏོང་ བཀོད་པ་གཏོང་ བང་ཆེན་གཏོང་
བཙན་འཛུལ་བྱེད་ བཙོག་པ་གཏོང་ བཟོད་གསོལ་ཞུ་ བར་འཛུལ་བྱེད་
བསམ་བློ་གཏོང་ བསྐོ་བཞག་བྱེད་ བསྐོར་ར་རྒྱག་ བསླབ་བྱ་བྱེད་
བུ་ལོན་གཏོང་ བྱམས་པ་བྱེད་ བྲོ་བ་མྱོང་ བློས་གཏོང་
མཆོད་པ་བྱེད་ མཐུ་རྒྱག་ མདུད་པ་རྒྱག་ མེ་གཏོང་ མེ་མདའ་རྒྱག་
མོས་མཐུན་བྱེད་པ་ ཚབ་བྱེད་ ཚབ་ཚུབ་བྱེད་ ཚེམ་བུ་རྒྱག་
ཚོང་རྒྱག་ ཚོན་གཏོང་ ཚོར་བ་མྱོང་ ཚྭ་རྒྱག་ ཞབས་བྲོ་རྒྱག་
ཞྭ་ཐག་རྒྱག་ ཟ་གཡའ་རྒྱག་ འཁྱག་པ་རྒྱག་ འཁྱགས་པ་གཏོང་
འཁྱགས་ཤུད་གཏོང་ འགྲུལ་རྒྱག་ འཆམས་པོ་བྱེད་ འཇིབ་རྒྱག་
འཐབ་ར་རྒྱག་ འདེམས་བསྒྲུགས་བྱེད་ འཕྱ་སྨོད་རྒྱག་
འཚོ་བ་མྱོང་ འོས་འདེམས་བྱེད་ ཡར་རྒྱས་གཏོང་ རབ་རྒྱག་
རིག་པ་གཏོང་ རོ་མྱོང་ རྐུབ་ཀྱག་རྒྱག་ རྒྱན་པོ་རྒྱག་
རྟ་གཏོང་ རྟགས་རྒྱག་ རྡེབ་པ་རྒྱག་ རྣག་རྒྱག་ རྩོད་པ་རྒྱག་
རླུང་པ་རྒྱག་ ལ་རྒྱག་ ལན་བུ་རྒྱག་ ལན་རྒྱག་ ལུད་རྒྱག་
ལོ་ཏོག་རྒྱག་ ལྐོག་རྔན་བྱེད་ ལྷན་པ་རྒྱག་ ཤ་བཙིར་རྒྱག་
ཤུ་རྒྱག་ ཤུགས་རྒྱག་ ཤུལ་རྒྱག་ སེམས་གསོ་གཏོང་ སོ་གཏོང་
སོ་རྒྱག་ སོ་ཤད་རྒྱག་ སྐད་གཏོང་ སྐད་ཅོར་རྒྱག་ སྐད་རྒྱག་
སྐྱིགས་པ་རྒྱག་ སྐྱིད་པོ་གཏོང་བ་ སྐྱོར་རྒྱག་ སྒུག་རྒྱག་
སྒོ་ཡོལ་རྒྱག་ སྒོམ་པ་བྱེད་ སྡུག་པོ་མྱོང་བ་ སྡུག་བསྔལ་མྱོང་
སྣོན་སྐྱེད་རྒྱག་ སྤོབས་པ་བྱེད་ སྤྲོ་སྐྱིད་གཏོང་ སླེ་པ་རྒྱག་
ཧམ་པ་བྱེད་ ཨུ་ཚུགས་བྱེད་
'''.split()
assert len(verbal) == len(set(verbal)) == 134
tails = sorted(['གཏོང', 'རྒྱག', 'བྱེད', 'ཞུ', 'མྱོང',
                'གཏོང་བ', 'བྱེད་པ', 'མྱོང་བ', 'ཟ་བ'], key=len, reverse=True)
for text in verbal:
    clean = key(text)
    tail = next(tail for tail in tails if clean.endswith('་' + tail))
    add(clean, 'verbal_combination', [clean[:-len(tail) - 1], tail],
        'Именной/описательный компонент или дополнение + глагольный компонент.', 'verbs')

other_verbs = [
    ['ཁ', 'གཅོད'], ['ནང་ཟོག', 'ཕྱི་འདྲེན'],
    ['ཕྱི་ཟོག', 'ནང་འདྲེན'], ['འགོ', 'འཛུགས'],
    ['ཡར', 'བརྩེགས་པ'], ['རང་སྐྱོན', 'སྦས་པ'],
    ['ལག་པ', 'གཡུག'], ['བྱེད་ལ', 'ལེ་ལོ'],
]
for parts in other_verbs:
    add('་'.join(parts), 'other_verbal_combination', parts,
        'Глагольное/предикативное сочетание с самостоятельным зависимым компонентом.', 'verbs')

adjectives = [
    ['ཁ', 'ཁུ་སིམ་པོ'], ['ཁ', 'གསང་པོ'], ['གཏིང', 'རིང་པོ'],
    ['གུ', 'ཡངས་པོ'], ['གོང', 'ཆེན་པོ'], ['དཀའ་ལས', 'ཁག་པོ'],
    ['བྲེལ་བ', 'ཚ་པོ'], ['མཐོང་རྒྱ', 'ཆེན་པོ'], ['མདོག', 'ཉེས་པོ'],
    ['རྒྱ', 'ཆུང་ཆུང'], ['རྒྱ', 'ཆེན་པོ'],
    ['སྐད་གྲགས', 'ཆུང་ངུས'], ['སྐད་གྲགས', 'ཆེན་པོས'],
    ['སྤུས་ཀ', 'ཞན་པ'], ['སྤུས་ཀ', 'ཞན་པོ'], ['ཐག', 'ཉེ'], ['ཐག', 'རིང'],
]
for parts in adjectives:
    add('་'.join(parts), 'nominal_adjectival_combination', parts,
        'Существительное + самостоятельное прилагательное; у некоторых форм есть падежное окончание.', 'adjectives')

negatives = [
    ['གང་ཡང', 'མེད་པ'], ['གཏིང', 'མེད་པ'], ['གོ་རིམ', 'མེད་པ'],
    ['གྲངས་ཚད', 'མེད་པ'], ['མི', 'ཆོག་པ'], ['མི', 'ཚུད་པ'],
    ['མོས་མཐུན', 'མེད་པ'], ['ཞེན་ཁོག', 'མེད་པ'],
    ['ལས་ཀ', 'མེད་པ'], ['ཤུགས', 'མེད་པ'], ['སྙིང་རྗེ', 'མེད་པ'],
]
for parts in negatives:
    add('་'.join(parts), 'negative_predicative_combination', parts,
        'Именной компонент + отрицательное сказуемое либо отрицание + предикат.', 'verbs')

functional = [
    ['གང', 'ཡང'], ['ད་ག', 'རང'], ['གཤམ', 'ལ'], ['དེ', 'ནས'],
    ['མཇུག', 'ལ'], ['མཉམ', 'དུ'], ['རེ་རེ', 'བཞིན'],
    ['རེ་རེ', 'བྱས'], ['སྐབས', 'རེ'], ['སྔོན', 'ལ'], ['སྟེང', 'ལ'],
]
for parts in functional:
    add('་'.join(parts), 'particle_or_distributive_combination', parts,
        'Сочетание с послелогом/частицей либо распределительная конструкция.', 'phrases')
for parts in [['ཡིན', 'དང', 'མིན'], ['ཡིན', 'དང', 'ཡིན']]:
    add('་'.join(parts), 'coordination', parts,
        'Самостоятельные компоненты соединены частицей དང་.', 'phrases')

notes = {
    'ཤ་བཙིར': 'Сохранена прежняя осторожная разметка: короткая лексическая единица; статус свободного сочетания не подтверждён.',
    'མི་དགེ་བ': 'Лексикализованное название/номинализация с отрицанием; не приравнивается автоматически к свободной отрицательной фразе.',
    'སྙིང་རྗེ་པོ': 'Именная основа སྙིང་རྗེ + функциональное окончание པོ་; источник прямо относит такую форму к простым прилагательным.',
    'གཏོང་ཕོད་པོ': 'Сохранена исходная лексическая единица: составная адъективная основа с окончанием; нет уверенной границы свободного сочетания.',
    'ཧ་གོ': 'Сохранён лексикализованный глагол; не делится на свободное сочетание по числу слогов.',
    'ཉེས་འཛུགས': 'Сохранена короткая именная основа; отдельно помечена развёрнутая форма с བྱེད་.',
    'སེམས་གསོ': 'Сохранена короткая лексическая единица; отдельно помечена развёрнутая форма с གཏོང་.',
    'ཡིག་ཐོག': 'Сохранено исходное лексикализованное выражение; свободное словосочетание не установлено.',
}
records = []
for index, text in enumerate(words, 1):
    clean = key(text)
    entry = reviewed.get(clean)
    if entry is None:
        entry = {'label': 'Слово', 'category': 'word_or_lexicalized_entry',
                 'reason': 'Отдельная лексическая единица, форма с функциональным окончанием или редупликацией; число слогов не служит признаком словосочетания.'}
    record = {'index': index, 'text': text, 'key': clean, **entry}
    if clean in notes:
        record['reviewNote'] = notes[clean]
    records.append(record)
counts = dict(Counter(r['category'] for r in records))
result = {'reviewedEntries': len(records), 'phraseEntries': len(reviewed),
          'newPhraseLabels': len(reviewed) - 1, 'wordLabels': len(records) - len(reviewed),
          'method': 'Explicit structural review for this trainer; includes complex verb/adjective constructions in the learner-facing phrase label. Not a universal lexicographic word-boundary claim.',
          'sources': sources, 'categoryCounts': counts, 'audioChanged': False,
          'displayedTibetanTextChanged': False, 'records': records}
(D / 'classification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
phrases = [record['key'] for record in records if record['label'] == 'Словосочетание']
helper = 'var PHRASE_AUDIO_KEYS=new Set(' + json.dumps(phrases, ensure_ascii=False, separators=(',', ':')) + ');\nfunction audioUnitLabel(word){\n return PHRASE_AUDIO_KEYS.has(audioKey(word))?"Словосочетание":"Слово";\n}\n'
(D / 'label-helper.js').write_text(helper)
before = (D / 'tilda-before.html').read_text()
old = '''function audioUnitLabel(word){
 return audioKey(word)==="ཤ་བཙིར་རྒྱག"?"Словосочетание":"Слово";
}
'''
assert before.count(old) == 1
assert 'PHRASE_AUDIO_KEYS' not in before
after = before.replace(old, helper)
(D / 'tilda-final.html').write_text(after)
summary = {k: v for k, v in result.items() if k != 'records'}
summary['sourceSha256'] = hashlib.sha256(after.encode()).hexdigest()
(D / 'classification-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps(summary, ensure_ascii=False))
