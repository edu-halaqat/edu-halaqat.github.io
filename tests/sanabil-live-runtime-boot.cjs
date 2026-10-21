'use strict';
// Detect runtime evaluation regressions such as removed symbols on window.SanabilLive.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('sanabil-live-v12.js','utf8');
const events=[];
const fakeNode=()=>({style:{},dataset:{},append(){},appendChild(){},addEventListener(){},setAttribute(){},removeAttribute(){}});
const document={
 documentElement:{dataset:{}},head:{append(){}},body:{append(){}},
 createElement:fakeNode,addEventListener(){},querySelector(){return null}
};
const window={addEventListener(){},dispatchEvent(e){events.push(e.type)}};
const navigator={onLine:true},localStorage={getItem(){return null},setItem(){}};
const context={
 window,document,navigator,localStorage,
 Event:class{constructor(type){this.type=type}},
 TextDecoder:class{decode(){return ''}},
 console,Promise,setTimeout,clearTimeout,setInterval,clearInterval,Date,Intl,URL,
};
vm.runInNewContext(source,context,{filename:'sanabil-live-v12.js',timeout:2000});
assert.equal(typeof window.SanabilLive?.mount,'function');
assert.equal(typeof window.SanabilLive?.usersPanel,'function');
assert.ok(events.includes('sanabil-live-ready'),'Main application must signal when the dashboard can mount');
assert.ok(!source.includes('window.SanabilLive={mount,usersPanel};'),
 'Do not export a removed local usersPanel symbol');
console.log('PASS: complete Sanabil live bundle evaluates and signals dashboard readiness');
