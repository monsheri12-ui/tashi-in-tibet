"""Remove narrow-band residues outside speech from the new third tempo only."""
from pathlib import Path
import ast,base64,hashlib,json,shutil,subprocess,sys,wave
D=Path(__file__).resolve().parent;R=D.parent;T=D/'very-slow'
sys.path.insert(0,str(R/'audio-join-audit/python-libs'));import numpy as np
FF=next((R/'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
report=json.loads((D/'very-slow-verification.json').read_text());candidates=report['toneCandidates'];M=json.loads((T/'manifest.json').read_text());C=json.loads((R/'monlam-corpus.json').read_text());indexes={e['id']:i for i,e in enumerate(C['entries'])}
tree=ast.parse((R/'full-audio-review/acoustics.py').read_text());mod=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ['decode','features']],type_ignores=[]);ns={'np':np,'subprocess':subprocess,'FF':FF};exec(compile(mod,'post-cleanup-check','exec'),ns)
details=json.loads((D/'very-slow-acoustic-details.json').read_text());changes=[]
for row in candidates:
 voice,ident=row['voice'],row['id'];p=T/'mp3'/voice/(ident+'.wav');mp3=p.with_suffix('.mp3');side=p.with_suffix('.json')
 backup=D/'very-slow-cleanup-before'/voice;backup.mkdir(parents=True,exist_ok=True)
 for f in [p,mp3,side]:
  q=backup/f.name
  if not q.exists():shutil.copy2(f,q)
 with wave.open(str(p))as w:raw=w.readframes(w.getnframes())
 x=np.frombuffer(raw,'<i2').copy();before=x.copy();changed=np.zeros(len(x),bool);windows=[]
 if ident=='m0677':
  # The original voiced syllable ends around .55 s here. A detached pure
  # 656 Hz tail begins after 1.5 s; preserve the complete spoken syllable.
  windows=[(1.48,len(x)/24000)]
 else:
  assert all(e.get('isolated')for e in row['tones'])
  windows=[(max(0,e['start']-.018),min(len(x)/24000,e['end']+.018))for e in row['tones']]
 mask=np.ones(len(x))
 for start,end in windows:
  a=max(0,round(start*24000));b=min(len(x),round(end*24000));changed[a:b]=True
  ramp=min(120,(b-a)//2);g=np.zeros(b-a)
  g[:ramp]=np.cos(np.linspace(0,np.pi/2,ramp))**2;g[-ramp:]=np.sin(np.linspace(0,np.pi/2,ramp))**2
  if b==len(x):g[-ramp:]=0
  mask[a:b]=np.minimum(mask[a:b],g)
 x[changed]=np.rint(x[changed].astype(float)*mask[changed]).astype('<i2')
 assert np.array_equal(x[~changed],before[~changed])
 out=x.tobytes()
 with wave.open(str(p),'wb')as w:w.setparams((1,2,24000,0,'NONE','not compressed'));w.writeframes(out)
 subprocess.run([str(FF),'-v','error','-nostdin','-y','-i',str(p),'-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',str(mp3)],check=True)
 f=ns['features'](ns['decode'](mp3));assert not f['tones']and not f['clippedSamples'],(voice,ident,f)
 meta=json.loads(side.read_text());meta.update({'renderedPcmSha256':hashlib.sha256(out).hexdigest(),'encodedSha256':hashlib.sha256(mp3.read_bytes()).hexdigest(),'toneResidueWindows':windows,'speechOutsideWindowsPcmUnchanged':True});side.write_text(json.dumps(meta,indent=2))
 for entry in M['voices'][voice]:
  if entry['id']==ident:entry.update({k:meta[k]for k in ['renderedPcmSha256','encodedSha256','toneResidueWindows','speechOutsideWindowsPcmUnchanged']})
 chunk=T/'audio'/voice/(f'{indexes[ident]//32:03}.json');bank=json.loads(chunk.read_text());bank['clips'][ident]=base64.b64encode(mp3.read_bytes()).decode();chunk.write_text(json.dumps(bank,separators=(',',':')))
 new={'voice':voice,'id':ident,'path':str(mp3),**{k:f[k]for k in ['seconds','peak','tones','quietIslands','clippedSamples']}}
 details=[new if r['voice']==voice and r['id']==ident else r for r in details]
 changes.append({'voice':voice,'id':ident,'windows':windows,'sourcePcmOutsideWindowsIdentical':True,'remainingToneCandidates':len(f['tones'])})
M['toneCleanup']={'files':len(changes),'changes':changes,'scope':'very slow only; other tempos unchanged'}
(T/'manifest.json').write_text(json.dumps(M,ensure_ascii=False,indent=2))
report['initialToneCandidateCount']=len(candidates);report['toneCleanup']=M['toneCleanup'];report['toneCandidates']=[r for r in details if r['tones']];report['quietIslandCandidates']=[r for r in details if r['quietIslands']]
(D/'very-slow-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(D/'very-slow-acoustic-details.json').write_text(json.dumps(details,ensure_ascii=False,indent=2))
print(json.dumps({'cleanedFiles':len(changes),'remainingToneCandidates':len(report['toneCandidates']),'outsideWindowsPcmPreserved':True,'existingTemposUnchanged':True}))
