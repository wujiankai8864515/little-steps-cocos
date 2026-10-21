require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
class Vector{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}clone(){return new Vector(this.x,this.y,this.z)}}
class Component{constructor(){this.node={isValid:true}}}
const original=Module._load;
Module._load=function(id,...args){if(id==='cc')return {_decorator:{ccclass:()=>value=>value,property:()=>()=>{}},Component,Vec3:Vector};return original.call(this,id,...args)};
const {GamePresentation}=require('../assets/mods/base-card/GamePresentation.ts');Module._load=original;
const node=(name,x,y)=>({name,active:true,position:new Vector(x,y),getComponent:()=>null,setPosition(x,y,z){this.position=new Vector(x,y,z)}});
test('redrawing after a cancelled large opening lands current and stock shadows without shifting cards',()=>{
 const page=new GamePresentation(),current=node('current',20,-800),stock=node('stock',-300,-800);
 const cards=[node('back0',-117,0),node('back1',-95,0)];
 const shadows=new Map([current,...cards].map(n=>[n,{simulatedHeight:550,setSimulatedHeight(h){this.simulatedHeight=h},setVisible(v){this.visible=v},syncNow(){}}]));
 page._level={};page.findNode=id=>id==='backup'?stock:id==='current'?current:null;page.backupCardNodes=()=>cards;
 page.ensureBackupCardCapacity=()=>cards;page.ensureCardShadow=n=>shadows.get(n);page.cardShadowFor=n=>shadows.get(n);
 page.stackBackupCardsLeftToRight=()=>{};page.applyCardSprite=async()=>{};
 page.renderCurrent({currentCardName:'poker_spade_black_13'},1);
 page.renderBackup({stockRemainingCount:2,controls:{addBackupVisible:false}});
 for(const shadow of shadows.values()){assert.equal(shadow.simulatedHeight,0);assert.equal(shadow.visible,true)}
 assert.deepEqual(cards.map(c=>c.position.x),[-117,-95]);assert.equal(stock.position.y,current.position.y);
});
