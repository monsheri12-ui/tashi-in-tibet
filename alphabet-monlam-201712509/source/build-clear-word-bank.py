"""Dedicated, reversible learner playback for whole-word buttons only.

Preserves each original full-word pronunciation and adds a modest expansion
of speech time and smooth level support for quiet consonants. Newly recorded
punctuated native phrases may be explicitly selected in native-overrides.json.
No prefix-name or letter-name clips enter a whole-word recording.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse,base64,hashlib,json,subprocess,sys,time,wave

D=Path(__file__).resolve().parent;R=D.parent;O=R.parent/'outputs'
sys.path.insert(0,str(R/'audio-join-audit/python-libs'))
import numpy as np
FF=next((R/'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
C=json.loads((R/'monlam-corpus.json').read_text())
RATE=24000;BASE_TEMPO=.78;VERSION='whole-word-clarity-v1-level-soft25-tempo078-128k'
key=lambda s:s.strip().rstrip('་།')
word_set={key(w)for w in C['words']}
entries=[(i,e)for i,e in enumerate(C['entries'])if key(e['text'])in word_set]
assert len(word_set)==len(entries)==500
parser=argparse.ArgumentParser();parser.add_argument('--samples',action='store_true');args=parser.parse_args()
overrides_path=D/'native-overrides.json'
overrides=json.loads(overrides_path.read_text())if overrides_path.exists()else{}

def read(p):
 with wave.open(str(p))as w:
  assert(w.getnchannels(),w.getsampwidth(),w.getframerate())==(1,2,RATE)
  raw=w.readframes(min(w.getnframes(),p.stat().st_size//2))
 return np.frombuffer(raw,'<i2').astype(float)/32768,hashlib.sha256(raw).hexdigest()

def write(p,x):
 assert np.isfinite(x).all()and np.max(abs(x))<1
 p.parent.mkdir(parents=True,exist_ok=True)
 with wave.open(str(p),'wb')as w:w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes(np.rint(x*32767).astype('<i2').tobytes())

def moving_mean(x,n):
 a=n//2;b=n-1-a;p=np.pad(x,(a,b),mode='edge');cs=np.r_[0.,np.cumsum(p)]
 return(cs[n:]-cs[:-n])/n

def support_consonants(x):
 active=np.flatnonzero(abs(x)>max(.0015,np.max(abs(x))*.0045))
 assert len(active)>20
 start=max(0,int(active[0])-1920);end=min(len(x),int(active[-1])+2880)
 x=x[start:end].copy()
 rms=np.sqrt(np.maximum(0,moving_mean(x*x,721))+1e-12)
 voiced=rms>max(.003,float(rms.max())*.025)
 target=float(np.median(rms[voiced]))
 gain=np.clip((target/np.maximum(rms,.001))**.25,.88,1.8)
 activity=np.clip((rms-.0015)/.004,0,1)
 gain=moving_mean(1+(gain-1)*activity,1441)
 x*=gain
 speech=x[rms>max(.003,float(rms.max())*.025)]
 factor=min(.82/np.max(abs(x)),.12/np.sqrt(np.mean(speech*speech)))
 x*=factor
 ramp=np.sin(np.linspace(0,np.pi/2,192))**2;x[:192]*=ramp;x[-192:]*=ramp[::-1]
 return x,{'retainedSourceRange':[start/RATE,end/RATE],'maxSmoothLocalGain':float(gain.max()),'peakBeforeTimeStretch':float(np.max(abs(x))),'sourceSpeechSamples':int(len(speech))}

def ff(*args):
 subprocess.run([str(FF),'-v','error','-nostdin','-y',*map(str,args)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)

def one(voice,index,e):
 ident=e['id'];override=overrides.get(voice+'/'+ident)
 source=Path(override)if override else R/('monlam-wav'if voice=='female'else'monlam-wav-male')/(ident+'.wav')
 x,source_hash=read(source);fp=VERSION+':'+source_hash
 folder=D/'rendered'/voice;folder.mkdir(parents=True,exist_ok=True)
 normal=folder/(ident+'.wav');normal_mp3=folder/(ident+'.mp3');slow=folder/(ident+'-slow.wav');slow_mp3=folder/(ident+'-slow.mp3');side=folder/(ident+'.json')
 if not(all(p.exists()for p in [normal,normal_mp3,slow,slow_mp3,side])and json.loads(side.read_text()).get('fingerprint')==fp):
  x,details=support_consonants(x);level=folder/(ident+'-level.wav');write(level,x)
  ff('-i',level,'-af','atempo='+str(BASE_TEMPO),'-ar',RATE,'-ac','1','-c:a','pcm_s16le','-map_metadata','-1',normal)
  ff('-i',normal,'-af','atempo=.8','-ar',RATE,'-ac','1','-c:a','pcm_s16le','-map_metadata','-1',slow)
  for inp,out in [(normal,normal_mp3),(slow,slow_mp3)]:ff('-i',inp,'-ar',RATE,'-ac','1','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',out)
  a,sha=read(normal);b,slowsha=read(slow)
  # atempo preserves pitch; limit any overlap/add peak while encoding at 128k.
  assert np.max(abs(a))<.98 and np.max(abs(b))<.98
  info={'fingerprint':fp,'voice':voice,'id':ident,'text':e['text'],'sourcePcmSha256':source_hash,'newNativeRecording':bool(override),'source':str(source),'seconds':len(a)/RATE,'slowSeconds':len(b)/RATE,'normalPcmSha256':sha,'slowPcmSha256':slowsha,**details}
  side.write_text(json.dumps(info,ensure_ascii=False,indent=2))
 return voice,index,e,json.loads(side.read_text()),normal_mp3,slow_mp3

selected=[(i,e)for i,e in entries if not args.samples or e['id']in ['m0350','m0455','m0228']]
started=time.monotonic();results=[]
with ThreadPoolExecutor(max_workers=4)as pool:
 tasks=[pool.submit(one,v,i,e)for v in ['male','female']for i,e in selected]
 for n,future in enumerate(as_completed(tasks),1):
  results.append(future.result())
  if n%200==0:print(json.dumps({'prepared':n,'total':len(tasks),'seconds':round(time.monotonic()-started)}),flush=True)
for voice in ['male','female']:
 for rate in [1,.8]:
  chunks={}
  for v,index,e,info,normal,slow in results:
   if v!=voice:continue
   chunks.setdefault(index//32,{})[e['id']]=base64.b64encode((normal if rate==1 else slow).read_bytes()).decode()
  target=D/('audio-words'if rate==1 else'audio-words-slow')/voice;target.mkdir(parents=True,exist_ok=True)
  for n,clips in chunks.items():
   (target/(f'{n:03}.json')).write_text(json.dumps({'voice':voice,'mime':'audio/mpeg','recordedRate':rate,'reading':'clear-word','clips':clips},separators=(',',':')))
if args.samples:
 for voice in ['male','female']:
  parts=[]
  for ident in ['m0350','m0455','m0228']:
   a,_=read(D/'rendered'/voice/(ident+'.wav'));parts.extend([a,np.zeros(16800)])
  write(O/(voice+'-clear-word-samples-20261111.wav'),np.concatenate(parts[:-1]))
else:
 manifest={'version':1,'method':VERSION,'words':500,'voices':{},'normalReadingSourceTempo':BASE_TEMPO,'slowRelativeToNormal':.8,'browserPlaybackRate':1,'bitRateKbps':128,'wholeCorpusPhoneticCertification':False,'existingMainAndSpellingBanksUnchanged':True}
 for voice in ['male','female']:manifest['voices'][voice]=[info for v,_,_,info,_,_ in sorted(results,key=lambda x:x[1])if v==voice]
 (D/'clear-word-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({'wordsPerVoice':len(selected),'voiceRecords':len(results),'encodedVariants':len(results)*2,'seconds':round(time.monotonic()-started),'samples':args.samples}),flush=True)
