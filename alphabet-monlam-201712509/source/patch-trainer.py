from pathlib import Path
import json
D=Path(__file__).resolve().parent;R=D.parent
base=(D/'baseline/tilda.html').read_text();html=base

def change(old,new,count=1):
 global html
 assert html.count(old)==count,(old[:80],html.count(old),count)
 html=html.replace(old,new)

change('<option value="0.8">Медленный</option>','<option value="0.8">Медленный</option><option value="0.6">Очень медленный</option>')
line='var MONLAM_SLOW_AUDIO_BASE='
pos=html.index('\n',html.index(line))+1
html=html[:pos]+'var MONLAM_VERY_SLOW_AUDIO_BASE="__VERY_SLOW_AUDIO_BASE__";\n'+html[pos:]
change('if(prefs.rate===.8)audioRate=.8','if(prefs.rate===.8||prefs.rate===.6)audioRate=prefs.rate')
change('rate=rate===.8?.8:1;','rate=rate===.6?.6:rate===.8?.8:1;',3)
change('(rate===.8?MONLAM_SLOW_AUDIO_BASE:MONLAM_AUDIO_BASE)','(rate===.6?MONLAM_VERY_SLOW_AUDIO_BASE:rate===.8?MONLAM_SLOW_AUDIO_BASE:MONLAM_AUDIO_BASE)')
change('(audioRate===1?"обычный темп":"медленный темп")','(audioRate===1?"обычный темп":audioRate===.6?"очень медленный темп":"медленный темп")')
change('audioRate=Number(event.target.value)===.8?.8:1','audioRate=Number(event.target.value)===.6?.6:Number(event.target.value)===.8?.8:1')
pos=html.index('\n',html.index('var MONLAM_SLOW_SPELLING_BASE='))+1
html=html[:pos]+'var MONLAM_VERY_SLOW_SPELLING_BASE="__VERY_SLOW_SPELLING_BASE__";\n'+html[pos:]
change('(rate===.8?MONLAM_SLOW_SPELLING_BASE:MONLAM_SPELLING_BASE)','(rate===.6?MONLAM_VERY_SLOW_SPELLING_BASE:rate===.8?MONLAM_SLOW_SPELLING_BASE:MONLAM_SPELLING_BASE)')
change('(rate===.8?.8:1)+"/"+index','(rate===.6?.6:rate===.8?.8:1)+"/"+index')
plans=json.loads((R/'monlam-jorlok-plans.json').read_text())
forms=sorted(s for s,p in plans.items()if p['parts'].get('suffix')=='ལ')
helper='''var FINAL_L_SYLLABLES=new Set(__FORMS__);
function appendWordPronunciationNote(row,word){
 if(!splitSyllables(word).some(function(part){return part.selectable&&FINAL_L_SYLLABLES.has(part.text)}))return;
 var note=document.createElement("p");note.className="tw-pronunciation-note";note.lang="ru";
 note.textContent="Конечная ལ་ может ослабляться, удлиняя гласный. В разборе по буквам её название произносится как «ла».";
 row.appendChild(note);
}
'''.replace('__FORMS__',json.dumps(forms,ensure_ascii=False,separators=(',',':')))
change('function renderWordRows(partsFunction,buttonClass){',helper+'function renderWordRows(partsFunction,buttonClass){')
change('false));wrap.appendChild(row);','false));appendWordPronunciationNote(row,word);wrap.appendChild(row);')
css='#tw-alphabet-lab .tw-pronunciation-note{flex-basis:100%;min-width:0;margin:8px 0 0;padding:8px 10px;border-radius:9px;background:#f2f6f1;color:var(--muted);font-family:inherit;font-size:12px;line-height:1.45;text-align:left}\n'
change('#tw-alphabet-lab .tw-word-audio{',css+'#tw-alphabet-lab .tw-word-audio{')
(D/'tilda-template.html').write_text(html)

# Keep the reusable player and the review builder compatible with all tempos.
player_path=R/'monlam_spelling_player.js';player=player_path.read_text()
backup=D/'baseline/monlam_spelling_player.js'
if not backup.exists():backup.write_text(player)
player=backup.read_text();needle='var MONLAM_SLOW_SPELLING_BASE=__SLOW_SPELLING_BASE__;'
assert player.count(needle)==1
player=player.replace(needle,needle+'\nvar MONLAM_VERY_SLOW_SPELLING_BASE=__VERY_SLOW_SPELLING_BASE__;')
player=player.replace('rate=rate===.8?.8:1;','rate=rate===.6?.6:rate===.8?.8:1;')
player=player.replace('(rate===.8?MONLAM_SLOW_SPELLING_BASE:MONLAM_SPELLING_BASE)','(rate===.6?MONLAM_VERY_SLOW_SPELLING_BASE:rate===.8?MONLAM_SLOW_SPELLING_BASE:MONLAM_SPELLING_BASE)')
player=player.replace('(rate===.8?.8:1)+"/"+index','(rate===.6?.6:rate===.8?.8:1)+"/"+index')
player_path.write_text(player)
visible_path=R/'full-audio-review/build-visible.py';visible=visible_path.read_text();backup=D/'baseline/build-visible.py'
if not backup.exists():backup.write_text(visible)
visible=backup.read_text();needle=".replace('__SLOW_SPELLING_BASE__',json.dumps(H['slowSpellingBase']))";assert visible.count(needle)==1
visible=visible.replace(needle,needle+".replace('__VERY_SLOW_SPELLING_BASE__',json.dumps(H.get('verySlowSpellingBase',H['slowSpellingBase'])))")
visible_path.write_text(visible)
words=json.loads((R/'monlam-corpus.json').read_text())['words'];covered=[w for w in words if any(s in forms for s in w.rstrip('་').split('་'))]
(D/'final-l-note-coverage.json').write_text(json.dumps({'forms':forms,'wordCount':len(covered),'words':covered,'note':'Конечная ལ་ может ослабляться, удлиняя гласный. В разборе по буквам её название произносится как «ла».','source':'https://tibetanlanguage.school/learn/standard-tibetan/unit-2/#4-2-variable-suffix-letters'},ensure_ascii=False,indent=2))
print(json.dumps({'thirdTempo':.6,'noteWords':len(covered),'ordinaryAndSlowPinsPreserved':html.count('8380e77d69835342d67bc783baa797f3bb89aa87')==4,'templateBytes':len(html.encode())}))
