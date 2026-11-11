// Traditional jorlok plans are prepared from verified syllable components.
var MONLAM_SPELLING_BASE=__SPELLING_BASE__;
var MONLAM_SLOW_SPELLING_BASE=__SLOW_SPELLING_BASE__;
var MONLAM_VERY_SLOW_SPELLING_BASE=__VERY_SLOW_SPELLING_BASE__;
var spellingBanks=new Map(),spellingResults=new Map(),spellingDecoder=null;
var spellingUrl=null,spellingTimeline=[],spellingRow=null,spellingHighlight=[],spellingKind="";
function resetSpellingPlayback(){
 spellingHighlight.forEach(function(el){el.classList.remove("is-sounding")});
 spellingHighlight=[];spellingRow=null;spellingTimeline=[];spellingKind="";
 if(spellingUrl){URL.revokeObjectURL(spellingUrl);spellingUrl=null}
}
function loadSpellingBank(voice,rate){
 rate=rate===.6?.6:rate===.8?.8:1;var key=voice+"/"+rate;
 if(!spellingBanks.has(key))spellingBanks.set(key,fetch((rate===.6?MONLAM_VERY_SLOW_SPELLING_BASE:rate===.8?MONLAM_SLOW_SPELLING_BASE:MONLAM_SPELLING_BASE)+voice+".json").then(function(response){if(!response.ok)throw new Error("Spelling HTTP "+response.status);return response.json()}).then(function(bank){if(bank.sampleRate!==24000||bank.sampleWidth!==2||bank.channels!==1||(bank.recordedRate||1)!==rate)throw new Error("Unexpected spelling audio format");bank.decoded=new Map();return bank}).catch(function(error){spellingBanks.delete(key);throw error}));
 return spellingBanks.get(key);
}
function spellingPcm(bank,symbol){
 if(!bank.decoded.has(symbol)){
  var encoded=bank.clips[symbol];if(!encoded)throw new Error("Missing spelling symbol "+symbol);
  bank.decoded.set(symbol,decodeSpellingAudio(encoded).catch(function(error){bank.decoded.delete(symbol);throw error}));
 }
 return bank.decoded.get(symbol);
}
function decodeSpellingBytes(encoded){var binary=atob(encoded),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
function decodeSpellingAudio(encoded){
 if(!spellingDecoder){var Decoder=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Decoder)throw new Error("Audio decoder unavailable");spellingDecoder=new Decoder(1,1,24000)}
 return spellingDecoder.decodeAudioData(decodeSpellingBytes(encoded).buffer).then(function(decoded){
  var data=decoded.getChannelData(0),peak=0;for(var i=0;i<data.length;i++)peak=Math.max(peak,Math.abs(data[i]));
  var threshold=Math.max(.0027,peak*.009),first=0,last=data.length-1;
  while(first<last&&Math.abs(data[first])<threshold)first++;while(last>first&&Math.abs(data[last])<threshold)last--;
  first=Math.max(0,first-1200);last=Math.min(data.length,last+1920);
  var length=last-first,fade=Math.min(192,Math.floor(length/2)),bytes=new Uint8Array(length*2),view=new DataView(bytes.buffer);
  // Ease each fragment into and out of silence; both boundary samples are zero.
  // The 8 ms ramps sit inside the retained 50/80 ms margins around speech.
  for(var j=0;j<length;j++){
   var edge=Math.min(j,length-1-j),gain=edge<fade&&fade>1?Math.pow(Math.sin(edge/(fade-1)*Math.PI/2),2):1;
   view.setInt16(j*2,Math.round(Math.max(-1,Math.min(1,data[first+j]*gain))*32767),true);
  }
  return bytes;
 });
}
function loadSpellingResult(voice,text,bank,rate){
 text=bank&&bank.resultAliases&&bank.resultAliases[text]||text;
 var index=audioIndex.get(audioKey(text)),key=voice+"/"+(rate===.6?.6:rate===.8?.8:1)+"/"+index;
 if(index===undefined)return Promise.reject(new Error("Missing syllable recording "+text));
 if(!spellingResults.has(key))spellingResults.set(key,loadAudioChunk(voice,index,rate).then(function(chunk){
  var encoded=chunk.clips["m"+String(index+1).padStart(4,"0")];if(!encoded)throw new Error("Missing syllable audio");
  return decodeSpellingAudio(encoded);
 }).catch(function(error){spellingResults.delete(key);throw error}));
 return spellingResults.get(key);
}
async function spellingParts(text,bank,voice,rate){
 rate=rate===.6?.6:rate===.8?.8:1;
 var parts=[],glyphOffset=0,number=0;
 var syllables=splitSyllables(String(text).normalize("NFC")),needed=new Set();
 syllables.forEach(function(syllable){if(!syllable.selectable)return;var plan=bank.plans[syllable.text];if(!plan)throw new Error("Missing jorlok plan "+syllable.text);plan.steps.forEach(function(step){if(step.kind==="result")needed.add(step.text)})});
 await Promise.all(Array.from(needed).map(function(result){return loadSpellingResult(voice,result,bank,rate)}));
 for(var syllable of syllables){
  if(!syllable.selectable)continue;number++;
  var plan=bank.plans[syllable.text];if(!plan)throw new Error("Missing jorlok plan "+syllable.text);
  var count=splitGlyphs(syllable.text).filter(function(p){return p.selectable}).length;
  for(var step of plan.steps){
   var pcm=step.kind==="symbol"?await spellingPcm(bank,step.text):await loadSpellingResult(voice,step.text,bank,rate);
   var focus=(step.focus||[0]).map(function(i){return glyphOffset+i});
   parts.push({pcm:pcm,label:step.label,glyphIndices:focus,syllable:number,gap:(step.kind==="result"?.30:.21)/rate});
  }
  if(parts.length)parts[parts.length-1].gap=.65/rate;glyphOffset+=count;
 }
 if(!parts.length)throw new Error("Empty spelling");parts[parts.length-1].gap=.08/rate;return parts;
}
function buildSpellingWav(parts,sampleRate){
 var size=parts.reduce(function(n,part){return n+part.pcm.length+Math.round(part.gap*sampleRate)*2},0);
 var bytes=new Uint8Array(44+size),view=new DataView(bytes.buffer),position=44,time=0,timeline=[];
 function ascii(offset,text){for(var i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i)}
 ascii(0,"RIFF");view.setUint32(4,36+size,true);ascii(8,"WAVE");ascii(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,"data");view.setUint32(40,size,true);
 parts.forEach(function(part){var duration=part.pcm.length/(sampleRate*2),gap=Math.round(part.gap*sampleRate)*2;timeline.push({start:time,end:time+duration,label:part.label,glyphIndices:part.glyphIndices,syllable:part.syllable});bytes.set(part.pcm,position);position+=part.pcm.length+gap;time+=(part.pcm.length+gap)/(sampleRate*2)});
 return{blob:new Blob([bytes],{type:"audio/wav"}),timeline:timeline};
}
async function playSpellingAudio(text,button,kind){
 if(audioActiveButton===button){stopMonlamAudio();return}
 stopMonlamAudio();var request=audioRequest,voice=audioVoice,rate=audioRate;
 audioActiveButton=button;audioActiveReading={text:text,button:button,kind:kind};button.classList.add("is-loading");button.setAttribute("aria-busy","true");audioStatus.textContent="Готовится учебный разбор…";
 try{
  var bank=await loadSpellingBank(voice,rate);if(request!==audioRequest)return;
  var parts=await spellingParts(text,bank,voice,rate);if(request!==audioRequest)return;
  var recording=buildSpellingWav(parts,bank.sampleRate);
  spellingUrl=URL.createObjectURL(recording.blob);spellingTimeline=recording.timeline;spellingRow=button.closest(".tw-word");spellingKind=kind==="vowel"?"разбор слога":"по слогам";
  audioPlayer.src=spellingUrl;audioPlayer.playbackRate=1;await audioPlayer.play();if(request!==audioRequest)return;
  button.classList.remove("is-loading");button.classList.add("is-playing");button.setAttribute("aria-busy","false");updateSpellingPosition();
 }catch(error){if(request===audioRequest){resetSpellingPlayback();resetAudioButton();audioStatus.textContent="Не удалось загрузить учебный разбор. Нажмите ещё раз."}}
}
function updateSpellingPosition(){
 if(!spellingTimeline.length)return;
 var current=spellingTimeline.find(function(part){return audioPlayer.currentTime>=part.start&&audioPlayer.currentTime<part.end});
 spellingHighlight.forEach(function(el){el.classList.remove("is-sounding")});spellingHighlight=[];
 if(current&&spellingRow){var glyphs=spellingRow.querySelectorAll(".tw-glyph");current.glyphIndices.forEach(function(i){if(glyphs[i]){glyphs[i].classList.add("is-sounding");spellingHighlight.push(glyphs[i])}})}
 audioStatus.textContent=(audioVoice==="female"?"Женский":"Мужской")+" голос · "+spellingKind+(current?" · "+(spellingKind==="по слогам"?"слог "+current.syllable+" · ":"")+current.label:"");
}
audioPlayer.addEventListener("timeupdate",updateSpellingPosition);
