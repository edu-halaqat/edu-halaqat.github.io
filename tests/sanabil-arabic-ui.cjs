'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const localizer=fs.readFileSync('sanabil-arabic-ui.js','utf8');
const monitor=fs.readFileSync('sanabil-activity-monitor.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const live=fs.readFileSync('sanabil-live-v12.js','utf8');
new vm.Script(localizer);
new vm.Script(monitor);
new vm.Script(live);
const window={},document={readyState:'loading',addEventListener(){}};
vm.runInNewContext(localizer,{window,document,NodeFilter:{SHOW_TEXT:4},MutationObserver:class{}});
const ar=window.SanabilArabicUI;
assert(ar,'Arabic UI library must be loaded');
const cases=[
 ['outcomes','الحصيلة اليومية',ar.view],
 ['plans','الخطط والمقررات',ar.view],
 ['rpc:save_test_day_reviews_guarded','حفظ مراجعات يوم الاختبار',ar.action],
 ['rpc:preview_methodology_memorization_plan','حساب مدة خطة الحفظ وفق المنهج',ar.action],
 ['rpc:update_quran_daily_range_guarded','تعديل نطاق آيات المقرر اليومي',ar.action],
 ['rpc:apply_offline_operations_batch','مزامنة مجموعة من العمليات المحلية',ar.action],
 ['action:wa-#','مشاركة حصيلة الطالب عبر واتساب',ar.action],
 ['action:tl-save-7','حفظ حصيلة درس التلقين',ar.action],
 ['action:save-student-14','حفظ حصيلة الطالب',ar.action],
 ['action:autosave-student','الحفظ التلقائي لحصيلة الطالب',ar.action],
 ['click:button:button','النقر على زر غير مسمى',ar.action],
 ['actual:save_student_write','كتابة الحصيلة في قاعدة البيانات',ar.action],
 ['mobile','هاتف محمول',ar.device],
 ['tablet','جهاز لوحي',ar.device],
 ['desktop','حاسوب',ar.device],
 ['4g','شبكة الجيل الرابع',ar.network],
 ['rpc','طلب من الخادم',ar.kind]
];
for(const [input,expected,fn] of cases)assert.equal(fn(input),expected,'Arabic view/action translation: '+input);
assert(!/[A-Za-z]/.test(ar.action('rpc:totally_new_internal_rpc')),'new RPCs must have Arabic fallback');
assert(!/[A-Za-z]/.test(ar.note('rpc:save_test_day_reviews_guarded')),'error explanation is Arabic');
assert(!/[A-Za-z]/.test(ar.error('statement timeout')),'raw network failures must be categorized in Arabic');
assert(!/[A-Za-z]/.test(ar.normalizeFixedText('Excel, PDF, CSV, JSON, P95 (ms), Cloudflare, GitHub Pages')),
 'interface abbreviations must be Arabicized');
assert(!monitor.includes('x=>x.view_key')&&!monitor.includes('x=>x.action_key'),
 'server event identifier may not leak raw into visible report tables');
for(const marker of [
 'ar.view(item.view_key)','ar.action(item.action_key)','ar.note(item.action_key)',
 'ar.device(x.device_kind)','ar.kind(x.kind)','ar.view(x.view_key)',
 'arabicJSON(report)','ar.percentile','data-label'
])assert(monitor.includes(marker),'missing localization of report item '+marker);
assert(index.indexOf('sanabil-arabic-ui.js')<index.indexOf('sanabil-activity-monitor.js'),
 'translator script must execute before activity monitor');
assert(index.includes('sanabil-live-v12.js?v=20261023-talaqqin-days1'),'bust session cache for new Arabic status');
assert(!live.includes('P95 (ث)'),'measurement table headings cannot contain English shorthand');
assert(live.includes('زمن ٩٥٪ من المحاولات'),'measurement percentile must be clear Arabic');
console.log('PASS: all specified diagnostic identifiers map to intelligible Arabic; no raw unknown RPC or telemetry field leaks into report, responsive view and exports are localized');
