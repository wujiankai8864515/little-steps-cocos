require('../tools/ts-loader.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('module');
class FakeNode {
 constructor(name='root'){this.name=name;this.isValid=true;this.active=true;this.children=[];this.layer=1;this.parent=null;}
 addChild(child){child.parent=this;this.children.push(child);}
 destroy(){this.isValid=false;this.destroyed=true;this.parent?.children.splice(this.parent.children.indexOf(this),1);}
 setPosition(){}
 setSiblingIndex(index){const children=this.parent.children;children.splice(children.indexOf(this),1);children.splice(index,0,this);}
}
const original=Module._load;
Module._load=function(id,...args){if(id==='cc')return {
 _decorator:{ccclass:()=>value=>value,executionOrder:()=>value=>value,property:()=>()=>{}},
 Component:class{constructor(){this.node=new FakeNode();}},Node:FakeNode,Color:class{},
 Vec3:class{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}},
};if(id==='cc/env')return {NATIVE:false};return original.call(this,id,...args);};
const {AppBootstrap}=require('../assets/mods/base-shell/AppBootstrap.ts');Module._load=original;
test('card/AVG navigation keeps one inactive catalog and destroys transient game screens on return',()=>{
 const shell=new AppBootstrap(),catalog=new FakeNode('catalog'),game=new FakeNode('game');
 shell.catalogRoot=catalog;shell.replaceScreen(catalog);shell.replaceScreen(game);
 assert.equal(catalog.active,false);assert.equal(catalog.isValid,true);assert.equal(game.active,true);
 shell.replaceScreen(catalog);assert.equal(game.isValid,false);assert.equal(catalog.active,true);
 assert.equal(shell.node.children.filter(n=>n===catalog).length,1);
 shell.replaceScreen(catalog);assert.equal(catalog.isValid,true);assert.equal(shell.node.children.length,1);
 shell.lifetime.dispose();
});
test('returning to an already prepared catalog reuses loaded art and renders the current committed state',async()=>{
 const shell=new AppBootstrap(),catalog=new FakeNode('catalog'),game=new FakeNode('game');
 const state={page:'details',coins:4300};let renders=0;
 shell.shell={read:()=>state};shell.catalogRoot=catalog;shell.catalogReady=true;
 shell.reusableCatalog={isValid:true,render:value=>{assert.equal(value,state);renders++;},open:()=>{throw new Error('不应重新加载素材');}};
 shell.replaceScreen(catalog);shell.replaceScreen(game);await shell.showLevelList();
 assert.equal(renders,1);assert.equal(catalog.active,true);assert.equal(game.isValid,false);assert.equal(shell.catalog,shell.reusableCatalog);
 shell.lifetime.dispose();
});
