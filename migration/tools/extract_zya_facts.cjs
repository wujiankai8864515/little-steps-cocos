'use strict';
// Static syntax inspection only. Never eval/require/execute the downloaded game.
const fs=require('node:fs');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const file='migration/.cache/zhaoyunyuadou/public-bundle-reference.js';
const ast=ts.createSourceFile('reference.js',fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const vars=new Map();
// Read the package's numeric literal encoding as data. Only the fixed two-
// constant XOR record is accepted; no downloaded JavaScript is evaluated.
function numberRecord(data){
    if(!Array.isArray(data)||data.length!==6||!data.every(Number.isInteger))return;
    const permutation=Array.from({length:256},(_,i)=>i),key='36651';let j=0;
    for(let i=0;i<256;i++){j=(j+permutation[i]+key.charCodeAt(i%key.length))&255;[permutation[i],permutation[j]]=[permutation[j],permutation[i]];}
    j=0;const decoded=data.map((v,k)=>{const i=k+1;j=(j+permutation[i])&255;[permutation[i],permutation[j]]=[permutation[j],permutation[i]];return v^permutation[(permutation[i]+permutation[j])&255]^232;});
    if(decoded[0]===286&&decoded[2]===286&&decoded[4]===177&&decoded[5]===68)return decoded[1]^decoded[3];
}
function literal(n){
    if(!n)return undefined;
    if(ts.isStringLiteral(n))return n.text;
    if(ts.isNumericLiteral(n))return Number(n.text);
    if(ts.isParenthesizedExpression(n))return literal(n.expression);
    if(ts.isIdentifier(n))return vars.get(n.text);
    if(ts.isArrayLiteralExpression(n))return n.elements.map(literal);
    if(ts.isPrefixUnaryExpression(n)){const v=literal(n.operand);if(typeof v!=='number')return; if(n.operator===ts.SyntaxKind.MinusToken)return -v;if(n.operator===ts.SyntaxKind.ExclamationToken)return !v;}
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='_0xc34')return numberRecord(literal(n.arguments[0]));
    if(ts.isElementAccessExpression(n)){const a=literal(n.expression),i=literal(n.argumentExpression);return Array.isArray(a)&&Number.isInteger(i)?a[i]:undefined;}
    if(ts.isBinaryExpression(n)){
        const a=literal(n.left),b=literal(n.right);if(a===undefined||b===undefined)return;
        switch(n.operatorToken.kind){case ts.SyntaxKind.CaretToken:return a^b;case ts.SyntaxKind.PlusToken:return a+b;case ts.SyntaxKind.MinusToken:return a-b;case ts.SyntaxKind.AsteriskToken:return a*b;case ts.SyntaxKind.SlashToken:return a/b;case ts.SyntaxKind.BarToken:return a|b;}
    }
    if(ts.isObjectLiteralExpression(n)){const o={};for(const p of n.properties){if(!ts.isPropertyAssignment(p))return;const key=ts.isIdentifier(p.name)?p.name.text:literal(p.name),v=literal(p.initializer);if(key===undefined||v===undefined)return;o[key]=v;}return o;}
    if(ts.isCallExpression(n)&&(ts.isPropertyAccessExpression(n.expression)||ts.isElementAccessExpression(n.expression))){
        const receiver=literal(n.expression.expression),method=ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:literal(n.expression.argumentExpression),args=n.arguments.map(literal);
        if(ts.isIdentifier(n.expression.expression)&&n.expression.expression.text==='JSON'&&method==='parse'&&typeof args[0]==='string'){try{return JSON.parse(args[0]);}catch(_){return;}}
        if(method==='split'&&typeof receiver==='string'&&typeof args[0]==='string')return receiver.split(args[0]);
        if(method==='reverse'&&Array.isArray(receiver))return receiver.slice().reverse();
        if(method==='join'&&Array.isArray(receiver)&&typeof args[0]==='string')return receiver.join(args[0]);
    }
}
function collect(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&/^_0x/.test(n.name.text)&&ts.isArrayLiteralExpression(n.initializer)){const value=literal(n.initializer);if(value!==undefined)vars.set(n.name.text,value);}ts.forEachChild(n,collect);}
collect(ast);
const decode=s=>typeof s==='string'&&/^\d+(?:\.\d+)+\.$/.test(s)?s.split('.').filter(Boolean).map(v=>String.fromCharCode(Number(v)^9)).join(''):undefined;
const result=ts.transform(ast,[context=>root=>{
    const visit=n=>{
        if(ts.isStringLiteral(n))return ts.factory.createStringLiteral(n.text);
        if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&/^_0x/.test(n.expression.text)){
            if(n.expression.text==='_0xc34'){const v=literal(n);if(typeof v==='number')return ts.factory.createNumericLiteral(v);}
            const value=decode(literal(n.arguments[0]));if(value!==undefined)return ts.factory.createStringLiteral(value);
        }
        if(ts.isBinaryExpression(n)){const value=literal(n);if(typeof value==='number'&&Number.isFinite(value))return value<0?ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken,ts.factory.createNumericLiteral(-value)):ts.factory.createNumericLiteral(value);}
        return ts.visitEachChild(n,visit,context);
    };return ts.visitNode(root,visit);
}]);
const readable=ts.createPrinter().printFile(result.transformed[0]);
fs.writeFileSync('migration/.cache/zhaoyunyuadou/reference-readable.txt',readable);
const tables=[];
function facts(n){if(ts.isArrayLiteralExpression(n)){const data=literal(n);if(data?.length>=8&&data.every(v=>v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.name==='string'&&typeof v.intro==='string'))tables.push(data);}ts.forEachChild(n,facts);}
facts(result.transformed[0]);
fs.writeFileSync('migration/reviews/zhaoyunyuadou/reference/item-facts.json',JSON.stringify({source:'public Android 1.0.9 declarative item constants; online screenshots may use earlier revisions',tables},null,2)+'\n');
const matches=[];for(const keyword of ['mapData','mapArr','mapId','paths','pathArr','staminaTxt','zhaopi','soldierData']){
    const index=readable.indexOf(keyword);matches.push({keyword,index,context:index<0?null:readable.slice(Math.max(0,index-100),index+280)});
}
console.log(JSON.stringify({literalTables:vars.size,observations:matches},null,2));result.dispose();
