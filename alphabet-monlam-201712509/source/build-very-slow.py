"""Third tempo (.6): clear whole words; pitch-preserved symbols and jorlok."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import array,base64,hashlib,json,subprocess,sys,time,wave
D=Path(__file__).resolve().parent;R=D.parent
sys.path.insert(0,str(R/'audio-join-audit/python-libs'));import numpy as np
FF=next((R/'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
C=json.loads((R/'monlam-corpus.json').read_text());SA=json.loads((R/'monlam-spelling-audit.json').read_text())
W=json.loads((D/'clear-word-manifest.json').read_text());word_ids={e['id']for e in W['voices']['male']};assert len(word_ids)==500
T=D/'very-slow';T.mkdir(exist_ok=True);RATE=24000;TEMPO=.6;FORMAT='learner-very-slow06-cbr128-v1'

def pcm(p):
 with wave.open(str(p))as w:
  assert(w.getnchannels(),w.getsampwidth(),w.getframerate())==(1,2,RATE)
  return w.readframes(min(w.getnframes(),p.stat().st_size//2))
def write(p,b):
 p.parent.mkdir(parents=True,exist_ok=True)
 with wave.open(str(p),'wb')as w:w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes(b)
def ff(*args):subprocess.run([str(FF),'-v','error','-nostdin','-y',*map(str,args)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
def render(source,dest):
 raw=pcm(source);fingerprint=FORMAT+':'+hashlib.sha256(raw).hexdigest();wav=dest.with_suffix('.wav');side=dest.with_suffix('.json');dest.parent.mkdir(parents=True,exist_ok=True)
 if not(dest.exists()and wav.exists()and side.exists()and json.loads(side.read_text()).get('fingerprint')==fingerprint):
  ff('-i',source,'-af','atempo=.6','-ar',RATE,'-ac','1','-c:a','pcm_s16le','-map_metadata','-1',wav)
  decoded=pcm(wav);x=np.frombuffer(decoded,'<i2').astype(float)/32768;peak=float(abs(x).max())
  if peak>.9:x*=.85/peak;write(wav,np.rint(x*32767).astype('<i2').tobytes());decoded=pcm(wav)
  ff('-i',wav,'-ar',RATE,'-ac','1','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',dest)
  side.write_text(json.dumps({'fingerprint':fingerprint,'sourcePcmSha256':hashlib.sha256(raw).hexdigest(),'renderedPcmSha256':hashlib.sha256(decoded).hexdigest(),'seconds':len(decoded)/48000,'peakBeforeLimit':peak,'encodedSha256':hashlib.sha256(dest.read_bytes()).hexdigest()},indent=2))
 return dest.read_bytes(),json.loads(side.read_text())
def main(voice,index,e):
 ident=e['id'];is_word=ident in word_ids
 source=D/'rendered'/voice/(ident+'-level.wav')if is_word else R/('monlam-wav'if voice=='female'else'monlam-wav-male')/(ident+'.wav')
 dest=T/'mp3'/voice/(ident+'.mp3');encoded,meta=render(source,dest)
 return voice,index,ident,encoded,{**meta,'id':ident,'text':e['text'],'clearWholeWordSource':is_word}
started=time.monotonic();results=[]
with ThreadPoolExecutor(max_workers=4)as pool:
 fs=[pool.submit(main,v,i,e)for v in ['male','female']for i,e in enumerate(C['entries'])]
 for n,f in enumerate(as_completed(fs),1):
  results.append(f.result())
  if n%400==0:print(json.dumps({'verySlowPrepared':n,'total':len(fs),'seconds':round(time.monotonic()-started)}),flush=True)
manifest={'recordedRate':TEMPO,'browserPlaybackRate':1,'words':500,'bitRateKbps':128,'normalAndSlowBanksUnchanged':True,'voices':{},'spelling':{}}
for voice in ['male','female']:
 rows=sorted([r for r in results if r[0]==voice],key=lambda x:x[1]);manifest['voices'][voice]=[r[4]for r in rows]
 for start in range(0,len(rows),32):
  clips={r[2]:base64.b64encode(r[3]).decode()for r in rows[start:start+32]};p=T/'audio'/voice/(f'{start//32:03}.json');p.parent.mkdir(parents=True,exist_ok=True)
  p.write_text(json.dumps({'voice':voice,'mime':'audio/mpeg','recordedRate':TEMPO,'clips':clips},separators=(',',':')))
 bank=json.loads((R/'monlam-spelling'/(voice+'.json')).read_text());bank['recordedRate']=TEMPO;records={}
 for symbol,original in SA['voices'][voice]['recordings'].items():
  name=original['source'];source=R/('monlam-wav'if voice=='female'else'monlam-wav-male')/name if name.startswith('m0')else R/'monlam-spelling-extra'/name
  raw=pcm(source);assert hashlib.sha256(raw).hexdigest()==original['sourcePcmSha256'];x=np.frombuffer(raw,'<i2');active=np.flatnonzero(abs(x.astype(int))>=max(90,int(abs(x.astype(int)).max())*.009))
  trimmed=raw[max(0,active[0]-1200)*2:min(len(x),active[-1]+1920)*2];inp=T/'symbol-input'/voice/name;write(inp,trimmed)
  data,meta=render(inp,T/'symbol-mp3'/voice/(Path(name).stem+'.mp3'));bank['clips'][symbol]=base64.b64encode(data).decode();records[symbol]={**original,**meta}
 p=T/'spelling'/(voice+'.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':')));manifest['spelling'][voice]=records
(T/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps({'mainRecordings':len(results),'clearWholeWords':1000,'spellingSymbols':sum(len(x)for x in manifest['spelling'].values()),'rate':TEMPO,'seconds':round(time.monotonic()-started)}),flush=True)
