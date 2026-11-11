from pathlib import Path
import hashlib
import json

D = Path(__file__).resolve().parent
R = D.parent
ROOT = R.parent

OLD_TOOLS = '});if(round.kind==="glyph"){row.classList.add("tw-word-spelling");'
NEW_TOOLS = '});row.classList.add("tw-word-spelling");'
OLD_END = 'row.appendChild(tools)}else row.appendChild(makeAudioButton(word,"Послушать слово "+word,false));'
NEW_END = 'row.appendChild(tools);'
OLD_FOCUS = 'if(current&&spellingRow){var glyphs=spellingRow.querySelectorAll(".tw-glyph");current.glyphIndices.forEach(function(i){if(glyphs[i]){glyphs[i].classList.add("is-sounding");spellingHighlight.push(glyphs[i])}})}'
NEW_FOCUS = 'if(current&&spellingRow){var glyphs=spellingRow.querySelectorAll(".tw-glyph");if(glyphs.length){current.glyphIndices.forEach(function(i){if(glyphs[i]){glyphs[i].classList.add("is-sounding");spellingHighlight.push(glyphs[i])}})}else{var syllable=spellingRow.querySelectorAll(".tw-syllable")[current.syllable-1];if(syllable){syllable.classList.add("is-sounding");spellingHighlight.push(syllable)}}}'


def replace_once(text, old, new):
    if old not in text:
        assert new in text, old[:100]
        return text
    assert text.count(old) == 1, old[:100]
    return text.replace(old, new)


def patch_player(text):
    return replace_once(text, OLD_FOCUS, NEW_FOCUS)


def patch_html(text):
    text = replace_once(text, OLD_TOOLS, NEW_TOOLS)
    text = replace_once(text, OLD_END, NEW_END)
    text = replace_once(text, 'makeAudioButton(word,"Учебный разбор по слогам "+word,"Разбор","syllables")', 'makeAudioButton(word,"Учебный разбор по буквам "+word,"Разбор","syllables")')
    text = replace_once(text, 'instruction.textContent="Выбирайте слог целиком. В одном слове подходящих слогов может быть несколько.";', 'instruction.textContent="Выбирайте слог целиком. В одном слове подходящих слогов может быть несколько. «Слово» — чтение целиком; «Разбор» — буквы, огласовки и результат каждого слога.";')
    text = replace_once(text, '#tw-alphabet-lab .tw-glyph.is-sounding{', '#tw-alphabet-lab .tw-glyph.is-sounding,#tw-alphabet-lab .tw-syllable.is-sounding{')
    return patch_player(text)


if __name__ == '__main__':
    source = R / 'word-clarity-followup-20261111/tilda-final.html'
    old = source.read_text()
    before = D / 'before.html'
    if not before.exists():
        before.write_text(old)
    text = patch_html(old)
    for path in [source, ROOT / 'outputs/tilda-trainer-monlam.html', R / 'tilda-201712509-monlam.html']:
        path.write_text(text)
    template = R / 'word-clarity-followup-20261111/tilda-template.html'
    template.write_text(patch_html(template.read_text()))
    player = R / 'monlam_spelling_player.js'
    player.write_text(patch_player(player.read_text()))
    info = {'beforeSha256': hashlib.sha256(old.encode()).hexdigest(), 'sourceSha256': hashlib.sha256(text.encode()).hexdigest(), 'change': 'Keep Word and letter-by-letter Jorlok in both word-based exercises at every tempo; highlight the current whole syllable in syllable mode.', 'audioAssetsChanged': False}
    (D / 'patch.json').write_text(json.dumps(info, ensure_ascii=False, indent=2))
    print(json.dumps(info))
