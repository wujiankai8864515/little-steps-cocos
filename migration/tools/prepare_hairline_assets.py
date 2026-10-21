"""Subset licensed fonts and generate original mono UI audio in the Hairline project."""
from pathlib import Path
import hashlib,json,math,struct,sys,uuid,wave
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'migration/.cache/hairline-python'))
from fontTools import subset
g=ROOT/'games/hairline';out=g/'assets/bundles/office'
text=''.join(p.read_text() for p in (g/'assets').rglob('*.ts'))+(g/'docs/requirements.md').read_text()+''.join(chr(i) for i in range(32,127))+'ⅠⅡⅢ⇄→┃✦×'
for filename,source in [('ui.ttf','sources/LXGWWenKai-Regular-v1.522.ttf'),('brush.ttf','travel_brush/sources/MaShanZheng-Regular.ttf')]:
    font=subset.load_font(str(ROOT/'games/xiaoyu-cocos/source/fonts'/source),subset.Options())
    sub=subset.Subsetter();sub.populate(text=text);sub.subset(font);subset.save_font(font,str(out/filename),subset.Options())
audio=out/'audio';audio.mkdir(exist_ok=True)
for name,freq,duration in [('click',650,.065),('hit',180,.08),('bubble',900,.14),('merge',520,.3),('hair',150,.35),('win',660,.7),('ambient',220,12)]:
    rate=16000;samples=[]
    for i in range(int(duration*rate)):
        t=i/rate
        if name=='ambient':
            notes=[261.6,329.6,392,329.6,293.7,349.2,440,349.2,220,261.6,329.6,261.6,196,246.9,293.7,246.9]
            note=notes[int(t/.75)%len(notes)];envelope=min(1,(t%.75)*12)*math.exp(-(t%.75)*3)
            v=(math.sin(2*math.pi*note*t)+.25*math.sin(4*math.pi*note*t))*.12*envelope
        else:v=math.sin(2*math.pi*(freq*t+(freq*.7*t*t if name=='bubble' else 0)))*.28*math.exp(-t*8)*min(1,t*150)
        samples.append(struct.pack('<h',int(v*32000)))
    with wave.open(str(audio/(name+'.wav')),'wb') as w:
        w.setparams((1,2,rate,len(samples),'NONE','not compressed'));w.writeframes(b''.join(samples))
for p in sorted((g/'assets').rglob('*')):
    if p.suffix=='.meta' or p.is_symlink() or p.with_name(p.name+'.meta').exists():continue
    if p.is_dir():imp='directory';ver='1.2.0'
    elif p.suffix=='.ts':imp='typescript';ver='4.0.24'
    else:continue
    p.with_name(p.name+'.meta').write_text(json.dumps({'ver':ver,'importer':imp,'imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'hairline/'+p.relative_to(g).as_posix())),'files':[],'subMetas':{},'userData':{}},indent=2))
manifest={'referenceSource':'User-provided product mockups, 2026-10-22','audioSource':'Original synthesized mono PCM, 16kHz','fonts':'OFL licenses in source/; subsets of existing workspace licensed sources','files':[{'path':p.relative_to(g).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(out.rglob('*')) if p.is_file() and p.suffix!='.meta']}
(g/'source/asset-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(manifest['files']),'bytes':sum(p['bytes'] for p in manifest['files'])}))
