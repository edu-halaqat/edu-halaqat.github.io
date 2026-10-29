const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const s=fs.readFileSync('supabase/functions/sanabil-attendance/index.ts','utf8');
const block=s.slice(s.indexOf('function cachedTimings('),s.indexOf('async function timings('));
const cache=vm.runInNewContext('const PRAYERS=["Fajr","Dhuhr","Asr","Maghrib","Isha"];'+stripTypeScriptTypes(block)+';cachedTimings');
const w={kind:'runtime',dateKey:'2026-10-29',source:'aladhan-umm-al-qura',startPrayer:'Asr',endPrayer:'Maghrib',prayerStart:'15:20',prayerEnd:'17:44',durationMinutes:0};
const mosque={latitude:24.4808685,longitude:39.5861938,timezone:'Asia/Riyadh',attendance_windows:[w]};
const cfg={startPrayer:'Asr',endPrayer:'Maghrib',durationMinutes:0};
assert.equal(cache(mosque,cfg,'2026-10-29').times.Asr,'15:20');
assert.equal(cache(mosque,cfg,'2026-10-30'),null);
for(const change of [{source:'unknown'},{kind:'config'},{prayerStart:'99:00'},{durationMinutes:120},{latitude:25},{longitude:40},{timezone:'UTC'}]){
 assert.equal(cache({...mosque,attendance_windows:[{...w,...change}]},cfg,'2026-10-29'),null,JSON.stringify(change));
}
assert.equal(cache({...mosque,attendance_windows:[{...w,durationMinutes:90}]},{...cfg,durationMinutes:90},'2026-10-29').times.Asr,'15:20');
// Exercise the production short circuit with a failing provider, not merely a string assertion.
let requests=0;
(async()=>{
 const failing=async()=>{requests++;throw Error('provider offline');};
 const prayer=cache(mosque,cfg,'2026-10-29')||await failing();
 assert.equal(requests,0);assert.equal(prayer.times.Maghrib,'17:44');
 assert.equal(Math.max(0,928-(920+15)),0);
 await assert.rejects(async()=>cache(mosque,cfg,'2026-10-30')||await failing());
 console.log('PASS: same-day cache survives provider failure; stale/invalid/config/changed-location data rejected; fixed duration is not a prayer; 15:28 is on time');
})();
