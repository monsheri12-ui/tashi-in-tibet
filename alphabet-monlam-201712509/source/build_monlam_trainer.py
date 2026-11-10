from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parent
source = (ROOT / 'tilda-201712509-original.html').read_text()
corpus = json.loads((ROOT / 'monlam-corpus.json').read_text())
audio_base = sys.argv[1] if len(sys.argv) > 1 else './monlam-audio/'
spelling_base = sys.argv[2] if len(sys.argv) > 2 else './monlam-spelling/'
slow_audio_base = sys.argv[3] if len(sys.argv) > 3 else './monlam-audio-slow/'
slow_spelling_base = sys.argv[4] if len(sys.argv) > 4 else './monlam-spelling-slow/'

def replace_once(old, new):
    global source
    if source.count(old) != 1:
        raise RuntimeError(f'Expected one match: {old[:100]!r}; found {source.count(old)}')
    source = source.replace(old, new, 1)

toolbar = '''
    <section class="tw-audio-toolbar" aria-label="Настройки озвучки">
      <div class="tw-voice-control" role="group" aria-label="Голос озвучки">
        <span>Голос:</span>
        <button type="button" data-tw-voice="female" aria-pressed="true">Женский</button>
        <button type="button" data-tw-voice="male" aria-pressed="false">Мужской</button>
      </div>
      <label class="tw-audio-speed">Темп
        <select id="tw2-audio-speed" aria-label="Темп озвучки">
          <option value="1">Обычный</option><option value="0.8">Медленный</option>
        </select>
      </label>
      <span id="tw2-audio-status" class="tw-audio-status" role="status" aria-live="polite"></span>
    </section>
'''
replace_once('    <section class="tw-modes"', toolbar + '\n    <section class="tw-modes"')
replace_once('        <div class="tw-transliteration" id="tw2-caption">Вайли: ka</div>',
             '        <div class="tw-transliteration" id="tw2-caption">Вайли: ka</div>\n        <div class="tw-target-audio" id="tw2-target-audio"></div>')

styles = '''
#tw-alphabet-lab .tw-audio-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px 20px;margin:0 0 20px;padding:13px 16px;border:1px solid var(--line);border-radius:17px;background:rgba(255,253,248,.88);font-size:13px}
#tw-alphabet-lab .tw-voice-control{display:flex;align-items:center;gap:5px}
#tw-alphabet-lab .tw-voice-control>span{margin-right:5px;color:var(--muted)}
#tw-alphabet-lab .tw-voice-control button{padding:8px 13px;border:1px solid transparent;border-radius:10px;color:var(--ink);background:transparent;cursor:pointer}
#tw-alphabet-lab .tw-voice-control button[aria-pressed="true"]{color:#fff;background:var(--jade)}
#tw-alphabet-lab .tw-audio-speed{display:flex;align-items:center;gap:8px;color:var(--muted)}
#tw-alphabet-lab .tw-audio-speed select{max-width:145px;padding:7px 9px;border:1px solid var(--line);border-radius:9px;color:var(--ink);background:var(--paper);font:inherit;cursor:pointer}
#tw-alphabet-lab .tw-audio-status{flex:1;min-width:190px;color:var(--muted);font-size:12px;text-align:right}
#tw-alphabet-lab .tw-audio-status:empty{display:none}
#tw-alphabet-lab .tw-audio-button{display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;gap:7px;min-width:36px;min-height:36px;padding:7px;border:1px solid #cbded8;border-radius:50%;background:#eef6f2;color:var(--jade);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:12px;line-height:1;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
#tw-alphabet-lab .tw-audio-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#tw-alphabet-lab .tw-audio-button:hover,#tw-alphabet-lab .tw-audio-button.is-playing{background:var(--jade);color:#fff}
#tw-alphabet-lab .tw-audio-button.is-loading{opacity:.7}
#tw-alphabet-lab .tw-audio-button:focus-visible,#tw-alphabet-lab .tw-voice-control button:focus-visible,#tw-alphabet-lab .tw-audio-speed select:focus-visible{outline:3px solid var(--saffron);outline-offset:3px}
#tw-alphabet-lab .tw-target-audio{margin:13px auto 0}
#tw-alphabet-lab .tw-target-audio .tw-audio-button{padding:10px 15px;border-radius:12px}
#tw-alphabet-lab .tw-word{position:relative;padding-right:51px}
#tw-alphabet-lab .tw-word>.tw-audio-button{position:absolute;right:8px;top:50%;transform:translateY(-50%)}
#tw-alphabet-lab .tw-audio-choice{position:relative;min-width:0}
#tw-alphabet-lab .tw-audio-choice>.tw-choice{width:100%;height:100%;padding-top:27px;padding-bottom:23px}
#tw-alphabet-lab .tw-audio-choice>.tw-audio-button{position:absolute;right:5px;top:5px;min-width:29px;min-height:29px;padding:5px}
#tw-alphabet-lab .tw-audio-choice>.tw-audio-button svg{width:15px;height:15px}
#tw-alphabet-lab .tw-glyph.is-sounding{box-shadow:inset 0 0 0 2px var(--jade);background:#e7f2ed}
#tw-alphabet-lab .tw-word.tw-word-spelling{padding-right:13px}
#tw-alphabet-lab .tw-word-audio{display:flex;flex-basis:100%;justify-content:center;gap:8px;margin-top:5px}
#tw-alphabet-lab .tw-word-audio .tw-audio-button{min-height:29px;padding:6px 10px;border-radius:10px;font-size:11px}
@media(max-width:900px){#tw-alphabet-lab .tw-target-audio{grid-column:3;margin:10px 0 0}#tw-alphabet-lab .tw-target-audio .tw-audio-button{min-height:34px;padding:8px 12px}}
@media(max-width:620px){#tw-alphabet-lab .tw-audio-toolbar{padding:11px;gap:10px 15px}#tw-alphabet-lab .tw-audio-status{width:100%;text-align:left}#tw-alphabet-lab .tw-target-audio{grid-column:2}#tw-alphabet-lab .tw-word{padding-right:53px}}
'''
replace_once('</style>', styles + '\n</style>')

audio_js = r'''
// Recorded Monlam voices. Training progress stays in the existing storage key.
var MONLAM_AUDIO_BASE=__AUDIO_BASE__;
var MONLAM_SLOW_AUDIO_BASE=__SLOW_AUDIO_BASE__;
var MONLAM_TEXTS=__AUDIO_TEXTS__;
var MONLAM_CHUNK_SIZE=32;
var audioIndex=new Map(),audioChunks=new Map(),audioVoice="female",audioRate=1;
var audioPlayer=new Audio(),audioRequest=0,audioActiveButton=null,audioActiveReading=null;
var audioStatus=root.querySelector("#tw2-audio-status");
var audioIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>';
audioPlayer.preload="none";
function audioKey(text){return String(text).normalize("NFC").replace(/[་།\s]+$/g,"")}
MONLAM_TEXTS.forEach(function(text,index){audioIndex.set(audioKey(text),index)});
try{var prefs=JSON.parse(localStorage.getItem("tibetan-alphabet-monlam-voice-v1")||"null");if(prefs){if(prefs.voice==="male")audioVoice="male";if(prefs.rate===.8)audioRate=.8}}catch(e){}
function saveAudioPreferences(){try{localStorage.setItem("tibetan-alphabet-monlam-voice-v1",JSON.stringify({voice:audioVoice,rate:audioRate}))}catch(e){}}
function resetAudioButton(){if(audioActiveButton){audioActiveButton.classList.remove("is-playing","is-loading");audioActiveButton.setAttribute("aria-busy","false");audioActiveButton=null}audioActiveReading=null}
function stopMonlamAudio(){audioRequest++;audioPlayer.pause();resetSpellingPlayback();resetAudioButton();audioStatus.textContent=""}
function loadAudioChunk(voice,index,rate){
 rate=rate===.8?.8:1;
 var chunk=Math.floor(index/MONLAM_CHUNK_SIZE),key=voice+"/"+rate+"/"+chunk;
 if(!audioChunks.has(key)){
  var url=(rate===.8?MONLAM_SLOW_AUDIO_BASE:MONLAM_AUDIO_BASE)+voice+"/"+String(chunk).padStart(3,"0")+".json";
  audioChunks.set(key,fetch(url).then(function(response){if(!response.ok)throw new Error("Audio HTTP "+response.status);return response.json()}).then(function(data){if((data.recordedRate||1)!==rate)throw new Error("Unexpected audio tempo");return data}).catch(function(error){audioChunks.delete(key);throw error}));
 }
 return audioChunks.get(key);
}
async function playMonlamAudio(text,button){
 if(audioActiveButton===button&&!audioPlayer.paused){stopMonlamAudio();return}
 stopMonlamAudio();var request=audioRequest,index=audioIndex.get(audioKey(text)),voice=audioVoice,rate=audioRate;
 if(index===undefined){audioStatus.textContent="Для этого элемента запись не найдена.";return}
 audioActiveButton=button;audioActiveReading={text:text,button:button,kind:null};button.classList.add("is-loading");button.setAttribute("aria-busy","true");audioStatus.textContent="Загружается запись…";
 try{
  var chunk=await loadAudioChunk(voice,index,rate);if(request!==audioRequest)return;
  var clip=chunk.clips["m"+String(index+1).padStart(4,"0")];if(!clip)throw new Error("Missing audio clip");
  audioPlayer.src="data:"+chunk.mime+";base64,"+clip;audioPlayer.playbackRate=1;
  await audioPlayer.play();if(request!==audioRequest)return;
  button.classList.remove("is-loading");button.classList.add("is-playing");button.setAttribute("aria-busy","false");audioStatus.textContent=(audioVoice==="female"?"Женский":"Мужской")+" голос · "+(audioRate===1?"обычный темп":"медленный темп");
 }catch(error){if(request===audioRequest){resetAudioButton();audioStatus.textContent="Не удалось загрузить запись. Нажмите на звук ещё раз."}}
}
audioPlayer.addEventListener("ended",function(){resetSpellingPlayback();resetAudioButton();audioStatus.textContent=""});
audioPlayer.addEventListener("error",function(){resetSpellingPlayback();resetAudioButton();audioStatus.textContent="Не удалось воспроизвести запись. Попробуйте ещё раз."});
function makeAudioButton(text,label,showLabel,spell){
 var button=document.createElement("button");button.type="button";button.className="tw-audio-button";button.lang="ru";button.title=label;button.setAttribute("aria-label",label);button.setAttribute("aria-busy","false");button.innerHTML=audioIcon;
 if(showLabel){var caption=document.createElement("span");caption.textContent=typeof showLabel==="string"?showLabel:"Послушать";button.appendChild(caption)}
 button.dataset.audioReading=spell||"pronunciation";
 button.addEventListener("click",function(event){event.preventDefault();event.stopPropagation();if(spell)playSpellingAudio(text,button,spell);else playMonlamAudio(text,button)});return button;
}
function appendAudioChoice(grid,answer,text,label,reading){var cell=document.createElement("div");cell.className="tw-audio-choice";cell.appendChild(answer);cell.appendChild(makeAudioButton(text,label,false,reading));grid.appendChild(cell)}
function refreshAudioTarget(item){var vowelMode=state.mode==="vowels",text=vowelMode?vowelSyllable(item,VOWELS[round.vowelIndex]):item.base;var host=root.querySelector("#tw2-target-audio");host.innerHTML="";host.appendChild(makeAudioButton(text,vowelMode?"Послушать учебный разбор":"Послушать произношение",true,vowelMode?"vowel":null))}
function refreshVoiceControls(){root.querySelectorAll("[data-tw-voice]").forEach(function(button){button.setAttribute("aria-pressed",button.dataset.twVoice===audioVoice?"true":"false")});root.querySelector("#tw2-audio-speed").value=String(audioRate)}
root.querySelectorAll("[data-tw-voice]").forEach(function(button){button.addEventListener("click",function(){if(audioVoice===button.dataset.twVoice)return;stopMonlamAudio();audioVoice=button.dataset.twVoice;saveAudioPreferences();refreshVoiceControls()})});
root.querySelector("#tw2-audio-speed").addEventListener("change",function(event){var reading=audioActiveReading;stopMonlamAudio();audioRate=Number(event.target.value)===.8?.8:1;saveAudioPreferences();if(reading&&reading.button.isConnected){if(reading.kind)playSpellingAudio(reading.text,reading.button,reading.kind);else playMonlamAudio(reading.text,reading.button)}});
refreshVoiceControls();
'''
audio_js = audio_js.replace('__AUDIO_BASE__', json.dumps(audio_base)).replace('__SLOW_AUDIO_BASE__', json.dumps(slow_audio_base)).replace('__AUDIO_TEXTS__', json.dumps([e['text'] for e in corpus['entries']],ensure_ascii=False,separators=(',',':')))
audio_js += (ROOT / 'monlam_spelling_player.js').read_text().replace('__SPELLING_BASE__', json.dumps(spelling_base)).replace('__SLOW_SPELLING_BASE__', json.dumps(slow_spelling_base))
replace_once('var state=loadState();', 'var state=loadState();\n' + audio_js)
replace_once(' buildModes();buildAlphabet();', ' refreshAudioTarget(item);buildModes();buildAlphabet();')
replace_once('  });wrap.appendChild(row);', '  });if(round.kind==="glyph"){row.classList.add("tw-word-spelling");var tools=document.createElement("div");tools.className="tw-word-audio";tools.appendChild(makeAudioButton(word,"Послушать слово целиком "+word,"Слово"));tools.appendChild(makeAudioButton(word,"Учебный разбор по слогам "+word,"Разбор","syllables"));row.appendChild(tools)}else row.appendChild(makeAudioButton(word,"Послушать слово "+word,false));wrap.appendChild(row);')
instruction = 'Нажимайте на буквы и связки. Разделители выбирать не нужно.'
if source.count(instruction) != 2:
    raise RuntimeError('Expected initial and dynamic glyph instructions')
source = source.replace(instruction, instruction + ' «Слово» — чтение целиком; «Разбор» — учебное чтение каждого слога.')
replace_once('  addAnswer(btn,key);if(letterIndex===state.current)correct.add(key);grid.appendChild(btn);',
             '  addAnswer(btn,key);if(letterIndex===state.current)correct.add(key);appendAudioChoice(grid,btn,item.base,"Послушать букву "+item.base);')
replace_once('  addAnswer(btn,key);if(vowelIndex===round.vowelIndex)correct.add(key);grid.appendChild(btn);',
             '  addAnswer(btn,key);if(vowelIndex===round.vowelIndex)correct.add(key);appendAudioChoice(grid,btn,vowelSyllable(letter(),vowel),"Послушать разбор слога "+vowelSyllable(letter(),vowel),"vowel");')
replace_once('Выберите один слог. У формы с a отдельной огласовки нет; i, u, e и o обозначаются знаками.', 'Выберите один слог. Динамик читает: буква, название огласовки и получившийся слог. У формы с a отдельной огласовки нет.')
replace_once('function startRound(){selected.clear();', 'function startRound(){stopMonlamAudio();selected.clear();')

(ROOT / 'tilda-201712509-monlam.html').write_text(source)
preview = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Тренажёр тибетского алфавита</title></head><body style="margin:0">' + source + '</body></html>'
(ROOT / 'index.html').write_text(preview)
print(json.dumps({'html_characters':len(source),'audio_entries':len(corpus['entries']),'audio_base':audio_base}))
