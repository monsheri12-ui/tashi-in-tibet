from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
corpus = json.loads((ROOT / 'monlam-corpus.json').read_text())
parsed = json.loads((ROOT / 'tibetan-parsed-syllables.json').read_text())
letters = {x['base']: x['name'] for x in corpus['letters']}
vowels = {'ི': 'gigu', 'ུ': 'zhabkyu', 'ེ': 'drengbu', 'ོ': 'naro'}
plans = {}
results = set()
# Existing recordings with the voiced root sound used after a prefix. These
# are audio references only: the learner-facing label remains the actual root.
VOICED_ROOT_AUDIO = {'ག': 'རྒ', 'ཇ': 'རྗ', 'ད': 'རྡ', 'བ': 'སྦ', 'ཛ': 'རྫ'}

def lower(c):
    return chr(ord(c) + 0x50)

def upper(c):
    return chr(ord(c) - 0x50)

def plan(syllable, p):
    prefix, head, root, sub, wa, aa, vowel, suffix, post = [p.get(k) or '' for k in
        ['prefix', 'superscribed', 'root', 'subscribed', 'wasur', 'achung', 'vowel', 'suffix', 'secondSuffix']]
    assert root in letters, (syllable, p)
    reconstructed = prefix + (head + lower(root) if head else root) + sub + wa + aa + vowel + suffix + post
    assert reconstructed == syllable, (syllable, reconstructed, p)
    steps = []
    root_focus = 1 if prefix else 0
    glyph_count = len(re.findall('[\u0f40-\u0f6c][^\u0f40-\u0f6c]*', syllable))

    def letter(ch, focus=None):
        steps.append({'kind': 'symbol', 'text': ch, 'label': letters[ch],
                      'focus': [root_focus if focus is None else focus]})

    def marker(ch, label, focus=None):
        steps.append({'kind': 'symbol', 'text': ch, 'label': label,
                      'focus': [root_focus if focus is None else focus]})

    def result(text, stage, label=None):
        results.add(text)
        focus = list(range(glyph_count)) if stage == 'suffix' else [root_focus + (1 if stage == 'affixed-particle' else 0)]
        steps.append({'kind': 'result', 'text': text, 'label': text if label is None else label,
                      'stage': stage, 'focus': focus})

    if prefix:
        letter(prefix, 0)
        marker('@prefix', 'o', 0)
    current = prefix
    if head:
        letter(head)
        current += head + lower(root)
        letter(root)
        marker('@tags', 'ta')
        result(current, 'superscript')
    else:
        current += root
        if prefix:
            # The written stand-in prefix+root+འ is not a request to spell འ.
            # Synthesis can read that stand-in as extra letters. Use the root
            # recording directly, preserving voicing where the prefix changes it.
            if prefix == 'ད' and root == 'བ':
                result('ཝ', 'prefix-root', letters[root])
            elif root in VOICED_ROOT_AUDIO:
                result(VOICED_ROOT_AUDIO[root], 'prefix-root', letters[root])
            else:
                letter(root)
        else:
            letter(root)
    if sub:
        for ch in sub:
            letter(upper(ch))
            marker('@tags', 'ta')
            current += ch
            result(current, 'subscript')
    if wa:
        marker('@wasur', 'wa zur')
        current += wa
        result(current, 'wasur')
    if aa:
        marker('ཱ', 'a chung')
        current += aa
        result(current, 'long-vowel')
    if vowel:
        marker(vowel, vowels[vowel])
        current += vowel
        result(current, 'vowel')
    if suffix:
        if len(suffix) > 1:
            assert suffix[0] == 'འ' and suffix[1] in vowels and len(suffix) == 2, (syllable, suffix)
            letter('འ', root_focus+1)
            marker(suffix[1], vowels[suffix[1]], root_focus+1)
            result(suffix, 'affixed-particle')
        else:
            letter(suffix, root_focus+1)
        current += suffix
    if post:
        letter(post, root_focus+2)
        current += post
    if suffix or post:
        result(current, 'suffix')
    assert current == syllable
    return {'parts': p, 'steps': steps}

for syllable, components in parsed.items():
    plans[syllable] = plan(syllable, components)
for item in corpus['letters']:
    for vowel in corpus['vowels']:
        syllable = item['base'] + vowel['sign']
        plans[syllable] = plan(syllable, {'root': item['base'], 'vowel': vowel['sign']})

# Research examples and the exact stack requested by the user.
for s, p in {
    'རྒྱ': {'superscribed': 'ར', 'root': 'ག', 'subscribed': 'ྱ'},
    'རྒྱོ': {'superscribed': 'ར', 'root': 'ག', 'subscribed': 'ྱ', 'vowel': 'ོ'},
    'བསྒྲིམས': {'prefix': 'བ', 'superscribed': 'ས', 'root': 'ག', 'subscribed': 'ྲ', 'vowel': 'ི', 'suffix': 'མ', 'secondSuffix': 'ས'},
}.items():
    plans[s] = plan(s, p)

known = {e['text'] for e in corpus['entries']}
new = []
for text in sorted(results - known):
    entry = {'id': f'm{len(corpus["entries"])+1:04d}', 'text': text,
             'synthesisText': text + '།', 'kinds': ['jorlok-result']}
    corpus['entries'].append(entry)
    new.append(entry)

(ROOT / 'monlam-corpus.json').write_text(json.dumps(corpus, ensure_ascii=False, indent=2))
(ROOT / 'monlam-jorlok-plans.json').write_text(json.dumps(plans, ensure_ascii=False, indent=2))
generation = json.loads((ROOT / 'monlam-generation-v2.json').read_text())
needed = {voice: [e for e in corpus['entries'] if e['id'] not in {s['id'] for s in generation[voice]}]
          for voice in ['female', 'male']}
(ROOT / 'monlam-jorlok-needed.json').write_text(json.dumps(needed, ensure_ascii=False, indent=2))
print(json.dumps({'plans': len(plans), 'intermediateResultsAdded': len(new),
                  'newPerVoice': {k: len(v) for k, v in needed.items()},
                  'examples': {k: plans[k]['steps'] for k in ['རྒྱ', 'རྒྱོ', 'བསྒྲིམས']}}, ensure_ascii=False))
