/* Read-only teacher workload. This file MUST NEVER target SNABIL production.
 * Create a separate Supabase staging project with fixture accounts and plans first.
 * k6 run -e STAGING_SUPABASE_URL=... -e STAGING_ANON_KEY=... -e STAGING_TEACHER_JWT=... -e STAGING_CIRCLE_ID=... tests/sanabil-staging-load.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const url = String(__ENV.STAGING_SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(__ENV.STAGING_ANON_KEY || '');
const token = String(__ENV.STAGING_TEACHER_JWT || '');
const circleId = String(__ENV.STAGING_CIRCLE_ID || '');
const prodRef = 'fvzoogbdezueswyihxiz';
if (!url || !key || !token || !circleId || !/^https:\/\/[^/]+\.supabase\.co$/.test(url) ||
    url.includes(prodRef) || !__ENV.I_CONFIRM_STAGING_ONLY ||
    __ENV.I_CONFIRM_STAGING_ONLY !== 'yes') {
 throw new Error('Refusing load test: provide a separate *.supabase.co staging URL, test teacher JWT, circle ID and I_CONFIRM_STAGING_ONLY=yes. Production is blocked.');
}
const headers = {apikey:key, Authorization:'Bearer '+token, 'X-Client-Info':'sanabil-staging-load-v1', Accept:'application/json'};
const appFailures = new Rate('sanabil_application_failures');

export const options = {
 scenarios:{
   teacher_reads:{
     executor:'ramping-vus',
     startVUs:0,
     stages:[
       {duration:'20s',target:10},
       {duration:'30s',target:25},
       {duration:'30s',target:50},
       {duration:'30s',target:100},
       {duration:'20s',target:0}
     ],
     gracefulRampDown:'10s'
   }
 },
 thresholds:{
  http_req_failed:['rate<0.005'],
  http_req_duration:['p(95)<2000'],
  sanabil_application_failures:['rate<0.005']
 },
 noConnectionReuse:false
};
const qp=s=>encodeURIComponent(s);
export default function(){
 const which=__ITER%3;
 let target;
 if(which===0)target='/rest/v1/circles?select=id,name&id=eq.'+qp(circleId)+'&limit=1';
 else if(which===1)target='/rest/v1/students?select=id,full_name&circle_id=eq.'+qp(circleId)+'&limit=30';
 else target='/rest/v1/plan_days?select=id,student_id,date_key&circle_id=eq.'+qp(circleId)+'&order=date_key.desc&limit=30';
 const res=http.get(url+target,{headers,tags:{workload:['circles','students','plan_days'][which]}});
 const ok=check(res,{'staging authenticated read status 2xx':r=>r.status>=200&&r.status<300});
 appFailures.add(!ok);
 sleep(0.5+Math.random()*0.8);
}
