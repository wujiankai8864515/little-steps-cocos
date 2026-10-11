'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/resources/3d/engine/node_modules/typescript');
const root=path.resolve(__dirname,'../../..'),context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'engines/travel-core/dist/travel-core.js'),'utf8'),context);
const core=context.LittleStepsCore,plain=v=>JSON.parse(JSON.stringify(v)),modules={};
class Color {constructor(r=255,g=255,b=255,a=255){Object.assign(this,{r,g,b,a});}static WHITE=new Color();}
for(const name of ['Engine','TravelModel','TravelStore','TravelService','TravelHomeRules','TravelRewardMotion','BackpackGeometry','HomeBackpack','TravelHomeProps']){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/game',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:key=>key==='cc'?{Color}:modules[key.slice(2)]||{},LittleStepsCore:core,Map,Set,console});modules[name]=exports;
}
const content=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/travel/travel_content.json'))),{TravelService}=modules.TravelService,{TravelRewardMotion}=modules.TravelRewardMotion,{TravelHomeProps}=modules.TravelHomeProps,R=modules.TravelHomeRules;
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
function setup(){
 const service=new TravelService();let now=1000,fail=false,writes=0;service.model.content=plain(content);service.wall_clock=()=>now;service.configure('home_rewards',true);
 const commit=service.store.commit.bind(service.store);service.store.commit=(state,revision)=>{writes++;if(fail){service.store.error='injected_quota';return false;}return commit(state,revision);};
 assert.equal(service.depart(700,.3,1),true);now=1100;assert.equal(service.reconcile(),true);assert.equal(service.model.trip().status,'returned');assert.ok(service.model.trip().rewards.length>1);
 return {service,motion:new TravelRewardMotion(service),time:n=>now=n,fail:v=>fail=v,writes:()=>writes};
}
const tick=(motion,seconds)=>{for(let t=0;t<seconds;t+=.05)motion.advance(Math.min(.05,seconds-t));};
test('Actual reward view cannot grant unopened/early rewards; the complete return loop unlocks one next departure',()=>{
 const f=setup(),{service:s,motion:m}=f;m.advance(3);assert.equal(m.poses.size,0);assert.equal(s.model.data.inventory.length,0);assert.equal(s.model.can_depart(),false);
 assert.equal(s.open_rewards(),true);m.advance(.1);const first=s.model.trip().rewards[0].uid;assert.equal(m.hit(m.poses.get(first).position),'');tick(m,3);
 const all=s.model.trip().rewards.map(r=>r.uid);for(const uid of all){const p=m.poses.get(uid);assert.equal(m.hit(p.position),uid);assert.equal(m.collect(uid),true);assert.equal(m.collect(uid),false);}
 assert.equal(s.model.data.inventory.length,0);tick(m,.9);assert.equal(s.model.data.inventory.length,0);tick(m,.5);
 assert.equal(s.model.data.inventory.length,all.length);assert.equal(new Set(s.model.data.inventory.map(r=>r.uid)).size,all.length);assert.equal(s.model.can_depart(),true);m.advance(.01);assert.equal(m.poses.size,0);assert.equal(m.openedTrip,'');
 f.time(1200);assert.equal(s.depart(700,.3,2),true);m.advance(1);assert.equal(m.poses.size,0);assert.equal(s.model.data.inventory.length,all.length);
});
test('Failed start remains clickable; failed arrival retries the same durable flight, never a new award',()=>{
 const f=setup(),{service:s,motion:m}=f;s.open_rewards();tick(m,3);const uid=s.model.trip().rewards[0].uid;f.fail(true);assert.equal(m.collect(uid),false);m.advance(.1);assert.equal(m.poses.get(uid).flightAge,-1);assert.equal(m.hit(m.poses.get(uid).position),uid);
 f.fail(false);assert.equal(m.collect(uid),true);f.fail(true);tick(m,2);assert.equal(s.model.reward_by_uid(uid).state,'FLYING');assert.equal(s.model.data.inventory.length,0);const attempts=f.writes();tick(m,.2);assert.ok(f.writes()-attempts<=1,'retry is rate-limited');
 f.fail(false);tick(m,.5);assert.equal(s.model.reward_by_uid(uid).state,'COLLECTED');assert.equal(s.model.data.inventory.filter(r=>r.uid===uid).length,1);tick(m,5);assert.equal(s.model.data.inventory.filter(r=>r.uid===uid).length,1);
});
test('Destroying the view in midflight and reloading storage completes each reward once',()=>{
 const f=setup(),{service:s,motion:m}=f;s.open_rewards();tick(m,3);const uid=s.model.trip().rewards[1].uid;m.collect(uid);m.advance(.4);
 const restored=new TravelService();restored.store=s.store;restored.model.content=plain(content);restored.wall_clock=()=>1120;restored.configure('home_rewards',true);assert.equal(restored.model.reward_by_uid(uid).state,'FLYING');
 const next=new TravelRewardMotion(restored);tick(next,2);assert.equal(restored.model.reward_by_uid(uid).state,'COLLECTED');assert.equal(restored.model.data.inventory.filter(r=>r.uid===uid).length,1);assert.equal(next.poses.has(uid),false);
 const third=new TravelService();third.store=s.store;third.wall_clock=restored.wall_clock;third.configure('home_rewards',true);const view=new TravelRewardMotion(third);tick(view,3);assert.equal(view.poses.has(uid),false);assert.equal(third.model.data.inventory.filter(r=>r.uid===uid).length,1);
});
test('Collecting the first reward retains every survivor index, arc and click target',()=>{
 const {service:s,motion:m}=setup();s.open_rewards();tick(m,3);const ids=s.model.trip().rewards.map(r=>r.uid),before=new Map(Array.from(m.poses,([uid,p])=>[uid,{index:p.index,x:p.position[0]}]));m.collect(ids[0]);tick(m,1.5);
 for(const uid of ids.slice(1)){const p=m.poses.get(uid);assert.equal(p.index,before.get(uid).index);close(p.position[0],before.get(uid).x);assert.equal(m.hit(p.position),uid);}
 const points=Array.from({length:12},(_,i)=>R.rewardFan(i,12));assert.equal(new Set(points.map(p=>p.map(v=>v.toFixed(5)).join(','))).size,12);close(Math.hypot(points[0][0]-359,points[0][1]-978),146);close(Math.hypot(points[5][0]-359,points[5][1]-978),228);close(Math.hypot(points[10][0]-359,points[10][1]-978),310);
});
test('Invalid time and pointer coordinates cannot poison active view state',()=>{
 const {service:s,motion:m}=setup();s.open_rewards();m.advance(.4);const before=plain(m.snapshot());for(const delta of [NaN,Infinity,-Infinity,-1])m.advance(delta);assert.deepEqual(plain(m.snapshot()),before);assert.equal(m.hit([NaN,10]),'');
 const pointer=new R.TravelPropPointer();assert.equal(pointer.down(1,[Infinity,0],'rewards'),false);assert.equal(pointer.down(1,[0,0],'rewards'),true);pointer.move(1,[NaN,0]);assert.equal(pointer.up(1,[0,0],'rewards'),'');
});
test('Drag-out never reactivates on return; another touch cannot release the owned travel prop',()=>{
 const pointer=new R.TravelPropPointer();assert.equal(pointer.down(7,[10,10],'journal'),true);assert.equal(pointer.down(8,[10,10],'comic'),true);assert.equal(pointer.up(8,[10,10],'comic'),'');assert.equal(pointer.owner,7);
 pointer.move(7,[27,10]);pointer.move(7,[10,10]);assert.equal(pointer.up(7,[10,10],'journal'),'');assert.equal(pointer.owner,null);
 pointer.down(7,[10,10],'journal');assert.equal(pointer.up(7,[10,10],'comic'),'');pointer.down(7,[10,10],'journal');pointer.cancel();assert.equal(pointer.up(7,[10,10],'journal'),'');pointer.down(9,[10,10],'rewards');assert.equal(pointer.up(9,[26,10],'rewards'),'rewards');
});
function sprite(region){return {region:region.slice(),sprite:{color:Color.WHITE},root:{active:true,angle:0,scale:{x:1,y:1},position:{x:0,y:0},setScale(x,y){this.scale={x,y};},setPosition(x,y){this.position={x,y};}},setRegion(r){this.region=r.slice();},setSkew(skew){this.skew=skew;},place(r){this.root.setPosition(r[0]+r[2]/2,-r[1]-r[3]/2);this.root.setScale(r[2]/this.region[2],r[3]/this.region[3]);}};}
function propHarness(service){
 const p=Object.create(TravelHomeProps.prototype),events=[];Object.assign(p,{service,pointer:new R.TravelPropPointer(),entry:null,generation:0,diaryOpen:false,rehang:null,wasFull:false,diaryRect:[503.5,1070,129,134],sprites:{map:sprite(R.PROP_REGIONS.map),diary:sprite(R.PROP_REGIONS.diary),open_diary:sprite(R.PROP_REGIONS.open_diary),full_bag:sprite(R.PROP_REGIONS.full_bag)},onNavigate:mode=>events.push(mode)});
 p.sprites.full_bag.place(R.BAG_RECT);return {p,events};
}
test('Cancelling an actual diary entry invalidates its delayed navigation and restores the artwork transform',()=>{
 const f=setup(),{p,events}=propHarness(f.service);assert.equal(p.animate('diary',()=>events.push('journal')),true);assert.equal(p.animate('map',()=>events.push('comic')),false);p.advanceEntry(.2);assert.ok(p.sprites.diary.root.scale.x<129/420);assert.notEqual(p.sprites.diary.skew,0);p.suspend();p.advanceEntry(10);assert.deepEqual(events,[]);assert.equal(p.busy,false);assert.equal(p.diaryOpen,false);assert.equal(p.sprites.open_diary.root.active,false);assert.equal(p.sprites.diary.skew,0);close(p.sprites.diary.root.scale.x,129/420);
 p.animate('diary',()=>events.push('journal'));p.advanceEntry(.48);p.advanceEntry(.48);assert.deepEqual(events,['journal']);assert.equal(p.diaryOpen,true);
});
test('Original entry feedback reaches its exact duration and does not open rewards before it finishes',()=>{
 const {service:s}=setup(),{p}=propHarness(s);p.hit=()=> 'rewards';assert.equal(p.down(1,[359,1015]),true);p.up(1,[359,1015]);assert.equal(p.busy,true);p.advanceEntry(.269);assert.equal(s.model.trip().rewards_opened,false);p.advanceEntry(.002);assert.equal(s.model.trip().rewards_opened,true);const revision=s.model.data.revision;p.advanceEntry(10);assert.equal(s.model.data.revision,revision);
});
test('Return ownership is acquired during the final durable grant, before world sync can reveal the wall bag',()=>{
 const {service:s}=setup(),{p}=propHarness(s);let starts=0,finishes=0,lastAlpha=-1,lastFrame;
 p.home={backpack:{beginTravelRehang:bounds=>{starts++;assert.ok(bounds.every(Number.isFinite));return {start:[359,900],end:[580,540],anchorLocal:[20,10],startTransform:[.2,0,0,.2,355,898],endTransform:[.3,0,0,.3,574,537]};},applyTravelRehang:(frame,a)=>{lastFrame=frame;lastAlpha=a;},finishTravelRehang:()=>finishes++}};
 p.syncRehangState();s.subscribe(()=>p.syncRehangState());s.open_rewards();for(const item of s.model.trip().rewards){s.start_reward_flight(item.uid);s.complete_reward_flight(item.uid);}
 assert.equal(starts,1);assert.equal(p.rehanging,true);p.advanceRehang(.775);close(lastAlpha,1);const hook=core.Math2D.transform(lastFrame,20,10),expected=R.rehangPoint([359,900],[580,540],.5);close(hook[0],expected[0]);close(hook[1],expected[1]);p.advanceRehang(.775);close(lastFrame[4],574);close(lastFrame[5],537);assert.equal(finishes,1);assert.equal(p.rehanging,false);p.syncRehangState();assert.equal(starts,1);p.suspend();assert.equal(finishes,1);
});
test('Finishing or suspending a rehang restores the same rig and rejects late ownership updates',()=>{
 const {HomeBackpack}=modules.HomeBackpack,h=Object.create(HomeBackpack.prototype),calls=[];Object.assign(h,{travelRehanging:true,alpha:0,proxy:{active:false,setPosition:(...v)=>calls.push(['position',...v]),setScale:(...v)=>calls.push(['scale',...v])},advance:()=>calls.push(['advance']),updateShadows:()=>calls.push(['shadow']),restoreWall:()=>calls.push(['restore'])});
 h.applyTravelRehang([.3,0,0,.3,580,540],.5);assert.equal(h.proxy.active,true);assert.equal(h.alpha,.5);assert.ok(calls.some(c=>c[0]==='shadow'));assert.equal(h.hit([0,0]),false);h.finishTravelRehang();assert.equal(h.alpha,1);assert.equal(h.travelRehanging,false);assert.equal(calls.filter(c=>c[0]==='restore').length,1);const count=calls.length;h.finishTravelRehang();h.applyTravelRehang([1,0,0,1,1,1],0);assert.equal(calls.length,count);
});
test('Native tent topology retains contact vertices and original UVs while elevated points project',()=>{
 const p=R.tentProjection([.7,.5]);assert.deepEqual(Array.from(p.indices),[0,1,4,1,2,3,1,3,4]);assert.deepEqual(Array.from(p.source),Array.from(new Float32Array(R.TENT_UV.flat())));assert.ok(p.vertices.every(Number.isFinite));
 for(const i of [0,3,4]){close(p.vertexData[i*3+2],0,.04);close(p.vertices[i*2],R.TENT_POINTS[i][0],.04);close(p.vertices[i*2+1],R.TENT_POINTS[i][1],.06);}assert.ok(p.vertexData[1*3+2]>80);assert.ok(p.vertexData[2*3+2]>80);
 const a=[359,900],b=[580,540];assert.deepEqual(plain(R.rehangPoint(a,b,-1)),a);assert.deepEqual(plain(R.rehangPoint(a,b,2)),b);assert.equal(R.harvestCloud(0,0),null);assert.equal(R.harvestCloud(1,.17),null);assert.equal(R.harvestCloud(0,3.2),null);
});
test('Real backpack rehang fits the original articulated bounds even while Home is hidden',()=>{
 const {BackpackGeometry}=modules.BackpackGeometry,{HomeBackpack}=modules.HomeBackpack;
 const contract=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/assets/round2/backpack_parts_contract.json'))),profile=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/bundles/home/home/secondary/backpack_ribbon_profile.json')));
 const geometry=new BackpackGeometry(contract,profile),h=Object.create(HomeBackpack.prototype),room={},proxy={active:false},wall=[.3,0,0,.36,520,370];let applied;
 Object.assign(h,{geometry,room,proxy,restore:()=>{},restoreWall:()=>{geometry.setWorn(false,true);},advance:()=>geometry.advance(0,[520,370],-10),affine:node=>node===room?[1,0,0,1,0,0]:wall,applyTravelRehang:(frame,alpha)=>{applied={frame,alpha};}});
 const source=[270,925,178,184],result=h.beginTravelRehang(source),points=[];
 for(const part of geometry.parts.values())if(part.visible)for(let i=0;i<part.mesh.vertices.length;i+=2){const p=part.transform([part.mesh.vertices[i],part.mesh.vertices[i+1]]);points.push(core.Math2D.transform(result.startTransform,...p));}
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);close((left+right)/2,359);close((top+bottom)/2,1017);assert.ok(right-left<=178.00001);assert.ok(bottom-top<=184.00001);assert.ok(Math.abs(right-left-178)<1e-5||Math.abs(bottom-top-184)<1e-5);
 assert.deepEqual(plain(result.endTransform),wall);assert.deepEqual(plain(result.end),plain(core.Math2D.transform(wall,...geometry.hangingAnchor())));assert.equal(applied.alpha,0);assert.equal(h.travelRehanging,true);assert.equal(h.depth,221);
});
