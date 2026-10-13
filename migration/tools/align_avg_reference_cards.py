"""Import unchanged movie frame as a UV atlas and write the reference fan layout as JSON."""
import hashlib,json,shutil,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
GAME=ROOT/'games/avg_plus'
CONFIG=GAME/'assets/art/resources/config/card-levels/level_difficulty1_01.json'
CATALOG=GAME/'assets/art/resources/assets/poker/card-catalog.json'
REVIEW=ROOT/'migration/reviews/avg_plus'
HISTORY=ROOT/'migration/history/avg_plus/pre-reference-card-layout'

def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# Preserve prior configuration and metadata once; source .meta UUID remains unchanged.
HISTORY.mkdir(parents=True,exist_ok=True)
for path in [CONFIG,CONFIG.with_name(CONFIG.name+'.meta'),CATALOG]:
 target=HISTORY/path.name
 if not target.exists():shutil.copy2(path,target)
source=REVIEW/'reference/cards-clear-02.png'
atlas=GAME/'assets/art/resources/assets/reference/cards_atlas.png'
shutil.copy2(source,atlas)
meta_path=atlas.with_name(atlas.name+'.meta')
if not meta_path.exists():
 meta=json.loads((atlas.parent/'night_mansion.png.meta').read_text())
 old=meta['uuid'];new=str(uuid.uuid4())
 meta=json.loads(json.dumps(meta).replace(old,new).replace('night_mansion','cards_atlas'))
 write(meta_path,meta)
catalog=json.loads(CATALOG.read_text())
regions={'poker_back_01':{'x':435,'y':322,'width':61,'height':89},'poker_wild':{'x':821,'y':321,'width':64,'height':89}}
prior_catalog=json.loads((HISTORY/CATALOG.name).read_text())
original={}
for name,region in regions.items():
 original[name]=dict(prior_catalog['assets'][name])
 catalog['assets'][name].update(resourcePath='assets/reference/cards_atlas/spriteFrame',region=region,sha256=hashlib.sha256(atlas.read_bytes()).hexdigest())
write(CATALOG,catalog)

slots=[]
def audit(suit,rank):
 color='red' if suit in ['heart','diamond'] else 'black';code=str(rank).zfill(2);label={1:'A',11:'J',12:'Q',13:'K'}.get(rank,str(rank))
 return {'side':'front','assetName':f'poker_{suit}_{color}_{code}','suit':suit,'color':color,'rankCode':code,'rankValue':rank,'label':label,'rankLabel':label}
def add(x,y,rotation,card=None):
 i=len(slots)+1;data=card or {'side':'back','assetName':'poker_back_01','variant':'01'}
 slots.append({'id':f'slot_{i:03d}','sourceName':data['assetName'],'x':x,'y':y,'width':162,'height':243,'rotation':rotation,'zIndex':i,'initialFaceUp':card is not None,'coveredBy':[],'figmaCard':data,'covers':[]})
 return slots[-1]
for side,row,rank in [(-1,1,1),(1,1,2),(-1,-1,3),(1,-1,4)]:
 fan=[]
 for layer in range(4):
  # Four parallel overlapping cards, mirrored at each side; portrait spreads rows vertically.
  fan.append(add(side*(450-53*layer),row*(324-8*layer),side*20,audit('spade',rank) if layer==3 else None))
 for lower,upper in zip(fan,fan[1:]):lower['coveredBy']=[upper['id']];upper['covers']=[lower['id']]
left=add(-95,0,10);right=add(95,0,-10);king=add(0,0,0,audit('heart',13))
left['coveredBy']=[king['id']];right['coveredBy']=[king['id']];king['covers']=[left['id'],right['id']]
level={'schemaVersion':1,'levelId':'level_difficulty1_01','difficulty':1,'source':{'type':'video','pageName':'用户自有视频约70秒','frameName':'four-fans-and-central-three'},'designSize':{'width':1179,'height':1000},'cardSize':{'width':162,'height':243},'initialStockCount':15,'portraitLayout':{'currentCardX':110},'slots':slots,'currentCard':{'sourceName':audit('diamond',7)['assetName'],'figmaCard':audit('diamond',7)}}
write(CONFIG,level)
write(REVIEW/'reference-card-layout.json',{'item':'AVG.CARD.01','sourceVideo':'/Users/wkk/Downloads/bc765723e70bda6ecc8189203cd990e6.mp4','referenceFrame':str(source.relative_to(ROOT)),'atlas':str(atlas.relative_to(ROOT)),'atlasSha256':hashlib.sha256(atlas.read_bytes()).hexdigest(),'pixelRetouching':False,'regions':regions,'priorCatalogEntries':original,'layout':{'fans':4,'cardsPerFan':4,'centralCards':3,'total':19,'initialStockCount':15,'portrait':'rows spread vertically; ranks, fan direction and overlap chain preserved'},'config':str(CONFIG.relative_to(ROOT)),'priorConfigArchive':str(HISTORY.relative_to(ROOT)),'native':'pending','fullFidelity':'pending: hidden ranks, exact draw sequence and other reference elements'})
print('Imported unchanged frame, two UV regions, 19 JSON slots and 15-stock configuration')
