'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const quick=fs.readFileSync('sanabil-quick-outcomes.js','utf8');
const css=fs.readFileSync('sanabil-quick-outcomes.css','utf8');
const identity=fs.readFileSync('sanabil-identity.css','utf8');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
const html=fs.readFileSync('index.html','utf8');
// Regression: the full-view grid has display:grid!important in identity CSS.
// Quick mode must win that cascade AND avoid erasing form inputs or saved values.
assert(identity.includes('.sl-live .sl-outcome-session .sl-student-grid'));
assert(/\.sl-live \.sl-data\.sl-quick-mode \.sl-outcome-session\s*>\s*\.sl-student-grid\s*\{\s*display\s*:\s*none\s*!important\s*\}/.test(css),
 'quick mode overrides forced detailed grid CSS');
assert(css.includes('.sl-data:not(.sl-quick-mode) .sl-quick-outcomes{display:none!important}'),
 'detailed mode hides quick list');
assert(css.includes('.sl-outcome-student-search{display:none!important}'),
 'detailed search is not duplicated in quick mode');
assert(css.includes('sl-outcome-float-nav{display:none!important}'),
 'floating detailed student navigation hidden in quick mode');
const start=quick.indexOf('  const switchView=(quick)=>{');
const end=quick.indexOf('\n  const wrap=el(',start);
assert(start>=0&&end>start,'switchView helper must exist in quick UI');
const helper=quick.slice(start,end);
const style=()=>{const values=new Map();return{
 setProperty:(key,value,priority)=>values.set(key,{value,priority}),
 removeProperty:key=>values.delete(key),
 getPropertyValue:key=>values.get(key)?.value||'',
 getPropertyPriority:key=>values.get(key)?.priority||''
}};
const grid={style:style(),marker:{assessment:'جيد جدًا',doubts:2}};
const search={style:style(),marker:{query:'طالب السابع'}};
const nav={style:style()};
let quickActive=false;
const box={classList:{toggle:(name,force)=>{assert.equal(name,'sl-quick-mode');quickActive=force;return force}},
 querySelector:selector=>selector==='.sl-outcome-student-search'?search:null};
const form={querySelector:selector=>selector==='.sl-student-grid'?grid:null};
const document={querySelector:selector=>selector==='[data-outcome-float-nav]'?nav:null};
const switchView=new Function('box','form','document',helper+'\nreturn switchView;')(box,form,document);
assert.equal(switchView(true),true);
for(const item of [grid,search,nav]){
 assert.equal(item.style.getPropertyValue('display'),'none','hidden in quick mode');
 assert.equal(item.style.getPropertyPriority('display'),'important','wins over forced grid CSS');
}
assert.equal(quickActive,true);
assert.equal(switchView(false),false);
for(const item of [grid,search,nav])assert.equal(item.style.getPropertyValue('display'),'','restored in detail mode');
assert.deepEqual(grid.marker,{assessment:'جيد جدًا',doubts:2},'grades survive switching');
assert.deepEqual(search.marker,{query:'طالب السابع'},'search state survives switching');
assert.equal(switchView(true),true);
assert.equal(grid.style.getPropertyValue('display'),'none','subsequent quick toggle hides grid again');
assert(quick.includes('showDetailed:i=>'),'pending rows can navigate to an actual detailed student');
assert(live.includes('<form class="sl-outcome-session" novalidate><div class="sl-student-grid">'),
 'detailed form remains intact and still uses the original save pipeline');
assert(html.includes('/sanabil-quick-outcomes.js?v=20261030-workspace'));
assert(html.includes('/sanabil-quick-outcomes.css?v=20261019-v8'));
console.log('PASS: one active outcome view, no duplicate search/navigation, and lossless two-way switching.');
