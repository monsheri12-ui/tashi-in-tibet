"""Verify that whole words use the prepared recordings without extra stretch."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import ast,base64,hashlib,json,subprocess,sys,time
D=Path(__file__).resolve().parent;R=D.parent;T=D/'very-slow'
sys.path.insert(0,str(R/'audio-join-audit/python-libs'));import numpy as np
FF=next((R/'audio-join-audit/python-libs/imageio_ffmpeg/binaries').glob('ffmpeg-*'))
M=json.loads((T/'manifest.json').read_text());details=json.loads((D/'very-slow-acoustic-details.json').read_text());report=json.loads((D/'very-slow-verification.json').read_text())
tree=ast.parse((R/'full-audio-review/acoustics.py').read_text());mod=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ['decode','features']],type_ignores=[]);ns={'np':np,'subprocess':subprocess,'FF':FF};exec(compile(mod,'word-cadence-check','exec'),ns)
tasks=[]
for voice,rows in M['voices'].items():
 for row in rows:
  if not row['clearWholeWordSource']:continue
  ident=row['id'];a=D/'rendered'/voice/(ident+'.mp3');b=T/'mp3'/voice/a.name
  assert a.read_bytes()==b.read_bytes()
  assert a.with_suffix('.wav').read_bytes()==b.with_suffix('.wav').read_bytes()
  assert row['additionalTimeStretch']is False
  tasks.append((voice,ident,b))
assert len(tasks)==1000
def inspect(row):
 voice,ident,p=row;f=ns['features'](ns['decode'](p));assert not f['clippedSamples'];return {'voice':voice,'id':ident,'path':str(p),**{k:f[k]for k in ['seconds','peak','tones','quietIslands','clippedSamples']}}
new=[];started=time.monotonic()
with ThreadPoolExecutor(max_workers=4)as pool:
 fs=[pool.submit(inspect,row)for row in tasks]
 for n,f in enumerate(as_completed(fs),1):
  new.append(f.result())
  if n%400==0:print(json.dumps({'wordFilesChecked':n,'seconds':round(time.monotonic()-started)}),flush=True)
by={(x['voice'],x['id']):x for x in new};details=[by.get((x['voice'],x['id']),x)for x in details]
report['wholeWordAdditionalTimeStretch']=False;report['preparedWordRecordingsCopiedExactly']=1000;report['toneCandidates']=[r for r in details if r['tones']];report['quietIslandCandidates']=[r for r in details if r['quietIslands']]
for rel,sha in json.loads((D/'existing-bank-fingerprints.json').read_text()).items():assert hashlib.sha256((R/rel).read_bytes()).hexdigest()==sha
(D/'very-slow-acoustic-details.json').write_text(json.dumps(details,ensure_ascii=False,indent=2));(D/'very-slow-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'preparedWordsCopiedExactly':1000,'additionalTimeStretch':False,'toneCandidates':len(report['toneCandidates']),'ordinaryAndSlowBanksUnchanged':True}))
