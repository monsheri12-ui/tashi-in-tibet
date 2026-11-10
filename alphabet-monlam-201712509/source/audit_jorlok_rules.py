"""Audit every teaching plan against the documented spelling operations.

This checks what must be spoken; it does not certify the recorded phonetics.
The output explicitly keeps these two review statuses separate.
"""
from pathlib import Path
from collections import Counter
import json, re

R = Path(__file__).resolve().parent
D = R / 'male-pronunciation-audit'
C = json.loads((R / 'monlam-corpus.json').read_text())
P = json.loads((R / 'monlam-jorlok-plans.json').read_text())
names = {x['base']: x['name'] for x in C['letters']}
vowel_names = {'ི': 'gigu', 'ུ': 'zhabkyu', 'ེ': 'drengbu', 'ོ': 'naro'}
marker_text = {'@prefix': 'འོག', '@tags': 'བཏགས', '@wasur': 'ཝ་ཟུར',
               'ི': 'གི་གུ', 'ུ': 'ཞབས་ཀྱུ', 'ེ': 'འགྲེང་བུ',
               'ོ': 'ན་རོ', 'ཱ': 'ཨ་ཆུང'}
sources = [
 {'url': 'https://tibetanlanguage.school/learn/standard-tibetan/unit-1/', 'sections': '4–5: letters, vowel names, vowel spelling'},
 {'url': 'https://tibetanlanguage.school/learn/standard-tibetan/unit-2/', 'sections': '3–6: prefix effects, finals, vowel raising, syllable constraints'},
 {'url': 'https://tibetanlanguage.school/learn/standard-tibetan/unit-3/', 'sections': '3–4: stacks, prefix o, btags, cumulative results, optional post-suffix se'},
 {'url': 'https://fpmt.org/wp-content/uploads/sites/2/2007/04/the_four_subscripts_continued.pdf', 'pages': '1–2: David Curtis, ya-ta, wa-zur, top-down spelling'},
 {'url': 'https://learntibetian.wordpress.com/wp-content/uploads/2011/09/tibetan-language-correspondence-course-sara-harding-jeremy-morrelli.pdf', 'pdfPages': '10–23: Sarah Harding, vowels, stacks, prefix o, endings and attached vowels'},
 {'url': 'https://openbooks.lib.msu.edu/basictibetan/chapter/3-1/', 'sections': 'Ya-tak, ra-tak, la-tak, wa-zur tables and teacher audio'},
 {'url': 'https://openbooks.lib.msu.edu/basictibetan/chapter/3-2/', 'sections': 'Prefix effects and special db- forms'},
]

def check(s, p):
    a=p['parts']; steps=p['steps']; errors=[]
    def require(condition, message):
        if not condition: errors.append(message)
    pre=a.get('prefix',''); head=a.get('superscribed',''); root=a['root']
    sub=a.get('subscribed',''); wa=a.get('wasur',''); aa=a.get('achung','')
    v=a.get('vowel',''); end=a.get('suffix',''); post=a.get('secondSuffix','')
    require(pre in ['',*'གདབམའ'], 'Invalid prefix inventory')
    require(head in ['',*'རལས'], 'Invalid superscript inventory')
    require(root in names, 'Unknown main letter')
    require(all(c in 'ྱྲླ' for c in sub), 'Unknown subscribed letter')
    require(wa in ['', 'ྭ'] and aa in ['', 'ཱ'], 'Unknown special sign')
    require(v in ['',*vowel_names], 'Unknown vowel')
    require(not end or end[0] in 'གངདནབམའརལས', 'Invalid suffix')
    require(len(end)<=1 or (end[0]=='འ' and end[1:] in vowel_names), 'Attached particle needs its own vowel')
    require(post in ['', 'ས','ད'], 'Invalid post-suffix')
    require(not post or bool(end), 'Post-suffix without suffix')
    require(not post or end in 'གངབམ', 'Post-suffix after unsupported suffix')
    # Recover the spoken letter names independently of the result references.
    expected = ([pre] if pre else [])+([head] if head else [])+[root]
    expected += [chr(ord(c)-0x50) for c in sub]
    expected += ([end[0]] if end else [])+([post] if post else [])
    spoken=[]
    for st in steps:
        if st['kind']=='symbol' and st['text'] in names: spoken.append(st['text'])
        elif st.get('stage') in ['prefix-root','stack-root']:
            require(st['label']==names[root], 'Wrong label for contextual main-letter audio')
            spoken.append(root)
    require(spoken==expected, 'Missing, extra, or reordered letter names')
    symbol_counts=Counter(st['text']for st in steps if st['kind']=='symbol')
    require(symbol_counts['@prefix']==bool(pre), 'Wrong number of prefix o markers')
    require(symbol_counts['@tags']==len(sub)+bool(head), 'Wrong number of btags markers')
    require(symbol_counts['@wasur']==bool(wa), 'Wrong number of wa-zur names')
    require(symbol_counts['ཱ']==bool(aa), 'Wrong number of a-chung length names')
    for sign,label in vowel_names.items():
        expected_count=(v==sign)+(len(end)>1 and end[1:]==sign)
        require(symbol_counts[sign]==expected_count, 'Missing or extra vowel name '+sign)
        require(all(st['label']==label for st in steps if st['kind']=='symbol'and st['text']==sign), 'Incorrect vowel label')
    rebuilt=pre+(head+chr(ord(root)+0x50) if head else root)+sub+wa+aa+v+end+post
    require(rebuilt==s,'Components do not reconstruct original text')
    if len(steps)>1:
        require(steps[-1]['kind']=='result' and steps[-1]['text']==s, 'Missing final syllable result')
    else:
        require(steps[0]['kind']=='symbol' and steps[0]['text']==s, 'Standalone letter must be read once')
    # Check each intermediate result against the written construction at that point.
    current=pre+(head+chr(ord(root)+0x50) if head else root)
    expected_results=[]
    if head: expected_results.append(('superscript',current))
    for c in sub:
        current+=c; expected_results.append(('subscript',current))
    for field,stage in [(wa,'wasur'),(aa,'long-vowel'),(v,'vowel')]:
        if field: current+=field; expected_results.append((stage,current))
    if len(end)>1: expected_results.append(('affixed-particle',end))
    if end or post: expected_results.append(('suffix',current+end+post))
    actual_results=[(st.get('stage'),st['text'])for st in steps if st['kind']=='result'and st.get('stage')not in ['prefix-root','stack-root']]
    require(actual_results==expected_results,'Intermediate reading differs from construction')
    text=[]
    for st in steps:
        text.append(root if st.get('stage')in ['prefix-root','stack-root'] else marker_text.get(st['text'],st['text']))
    return {'syllable':s,'structuralErrors':errors,'steps':steps,
            'teacherText':'་'.join(text)+'།',
            'recordedPronunciation':'not-certified-by-structural-audit',
            'contextualRootAudioUsed':any(st.get('stage')=='stack-root'for st in steps),
            'reviewContextualRoot':bool(head and root in 'གཇདབཛ' and not any(st.get('stage')=='stack-root'for st in steps))}

rows=[check(s,p)for s,p in P.items()]
failures=[r for r in rows if r['structuralErrors']]
word_rows=[]
for w in C['words']:
    syllables=[s for s in re.split('[་།\s]+',w)if s]
    missing=[s for s in syllables if s not in P]
    assert not missing,(w,missing)
    word_rows.append({'word':w,'syllables':syllables,'teacherText':' '.join(next(r['teacherText']for r in rows if r['syllable']==s)for s in syllables)})
report={'version':1,'date':'2026-11-10','selectedSpellingMethod':'prefix letter + o; stacked letters + btags; cumulative results; suffix sa retained as an attested variant',
        'sources':sources,'planCount':len(rows),'wordCount':len(word_rows),
        'structuralFailureCount':len(failures),'structuralFailures':failures,
        'contextualRootAudioReviewCount':sum(r['reviewContextualRoot']for r in rows),
        'contextualStackRootAudioUsedCount':sum(r['contextualRootAudioUsed']for r in rows),
        'phoneticCertification':False,'plans':rows,'words':word_rows}
(D/'jorlok-rule-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
Path(R.parent/'outputs/jorlok-rule-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items()if k not in ['plans','words','sources','structuralFailures']},ensure_ascii=False))
if failures: print(json.dumps(failures[:5],ensure_ascii=False))
