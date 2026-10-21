'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const enhancement=fs.readFileSync('sanabil-v13-enhancements.js','utf8');
const registry=fs.readFileSync('sanabil-registry-management.js','utf8');
const helper=enhancement.slice(enhancement.indexOf('const circleSelectorHtml='),enhancement.indexOf('const circlesInComplex='));
assert.ok(helper.startsWith('const circleSelectorHtml='),'The shared circle selector must exist');
const ctx={};
vm.runInNewContext(
 "const esc=x=>String(x??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\n"+
 helper+"\nthis.html=circleSelectorHtml;this.bind=bindCircleSelector;",ctx);
const circles=[{id:'a',name:'حلقة النور',session_period:'العصر'},{id:'b',name:'حلقة الإتقان',session_period:'المغرب'}];
const html=ctx.html(circles,'a');
assert.ok(html.includes('data-circle-choice="a" checked'));
assert.ok(html.includes('data-circle-choice="b"'));
assert.ok(html.includes('تحديد جميع الحلقات')&&html.includes('إلغاء التحديد'));
assert.ok(!ctx.html([{id:'x',name:'<img src=x>',session_period:''}],'x').includes('<img src=x>'));
const boxes=circles.map(c=>({dataset:{circleChoice:c.id},checked:c.id==='a',addEventListener(type,fn){this.onchange=fn}}));
const counter={textContent:''},all={},none={};
const root={querySelectorAll(q){assert.equal(q,'[data-circle-choice]');return boxes},
 querySelector(q){return q==='[data-circle-all]'?all:q==='[data-circle-none]'?none:q==='[data-circle-count]'?counter:null}};
const selected=ctx.bind(root,circles);
assert.deepEqual(Array.from(selected()),['a']);
all.click();
assert.deepEqual(Array.from(selected()),['a','b']);
assert.ok(counter.textContent.includes('2'));
none.click();
assert.deepEqual(Array.from(selected()),[]);
boxes[1].checked=true;boxes[1].onchange();
assert.deepEqual(Array.from(selected()),['b']);
assert.ok(enhancement.includes("p_kind:'session_rules'"));
assert.ok(enhancement.includes("p_kind:'circle_details'"));
assert.ok(enhancement.includes("rpc('apply_fingerprint_period_bulk'"));
assert.ok(enhancement.includes('selectedFingerprintGroups()'));
assert.ok(enhancement.includes('data-fp-mosque'));
assert.ok(registry.includes('data-bulk-circle-settings'));
assert.ok(registry.includes('SanabilCircleBulkSettings?.open?.()'));
assert.ok(enhancement.includes("new Event('sanabil-circles-bulk-updated')"));
console.log('PASS: selected/all/none circle scopes, escaped names, batch modes and registry entry');
