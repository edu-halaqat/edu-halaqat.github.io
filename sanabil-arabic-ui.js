/* Arabic presentation for operational identifiers. Never changes RPC names, event keys, payloads, or saved records. */
(()=>{'use strict';
if(window.SanabilArabicUI)return;
const views={
 outcomes:'الحصيلة اليومية',plans:'الخطط والمقررات',attendance:'الحضور والبصمة',
 tests:'الاختبارات',dashboard:'الصفحة الرئيسية',settings:'الإعدادات وإدارة النظام',
 students:'شؤون الطلاب',reports:'التقارير',supervision:'الإشراف التربوي',
 inquiries:'الاستعلامات',users:'المستخدمون',talaqqin:'حلقات التلقين',
 requests:'الطلبات',guardian:'بوابة ولي الأمر',login:'تسجيل الدخول',
 '/':'الصفحة الرئيسية','index.html':'الصفحة الرئيسية'
};
const actions={
 correct_talaqqin_assessment_lesson_guarded:'تصحيح حصيلة درس التلقين',
 save_talaqqin_assessment_guarded:'اعتماد حصيلة درس التلقين',
 list_juz_exam_alerts:'جلب تنبيهات الاختبارات',
 preview_auto_major_review:'معاينة توزيع المراجعات الكبرى تلقائيًا',
 get_complex_teacher_plan_permission:'التحقق من صلاحية تعديل خطة الطالب',
 set_talaqqin_placement:'تحديد موضع طالب التلقين',
 quran_surah_catalog:'جلب قائمة سور القرآن الكريم',
 'tl-card-#':'فتح بطاقة طالب التلقين',
 'tl-correct-lesson-#':'تصحيح مقرر التلقين',
 'tl-save-attendance':'حفظ حضور طلاب التلقين',
 'guardian-#':'فتح بوابة ولي الأمر',
 'remove-#':'حذف خطة مختارة وفق الصلاحية',
 'to-place-#':'تحديد موضع طالب في التلقين',
 'edit-#':'تعديل الخطة المختارة',
 bundle:'إعداد خطط الطالب مجتمعة',
 requests:'فتح طلبات التسجيل أو الاختبار',
 'save:form':'اعتماد بيانات النموذج',
 'list_juz_exam_alerts':'استدعاء تنبيهات الاختبارات',
 save_test_day_reviews_guarded:'حفظ مراجعات يوم الاختبار',
 preview_methodology_memorization_plan:'حساب مدة خطة الحفظ وفق المنهج',
 preview_memorization_plan:'حساب مدة خطة الحفظ',
 update_quran_daily_range_guarded:'تعديل نطاق آيات المقرر اليومي',
 adjust_daily_plan_assignment_guarded:'تعديل مقرر الطالب اليومي',
 save_daily_outcomes_guarded:'حفظ الحصيلة اليومية',
 save_daily_outcomes_v2:'حفظ الحصائل اليومية',
 save_student_attendance_guarded:'حفظ تحضير الطلاب',
 apply_offline_operations_batch:'مزامنة مجموعة من العمليات المحلية',
 apply_offline_operation:'مزامنة عملية محلية',
 get_daily_assignments:'جلب المقررات اليومية للحلقة',
 get_student_daily_assignment_guarded:'جلب مقرر الطالب وتقديراته',
 get_day_types_guarded:'التحقق من تصنيف اليوم التعليمي',
 circle_session_access:'التحقق من صلاحيات جلسة الحلقة',
 my_access:'التحقق من صلاحيات المستخدم',
 get_guardian_excuses_for_circle_guarded:'جلب أعذار الطلاب واستئذاناتهم',
 save_plan_bundle:'حفظ مجموعة خطط الطالب',
 save_plan_bundle_whole_ayah:'حفظ خطة تعتمد الآيات الكاملة',
 save_methodology_memorization_plan:'حفظ خطة الحفظ وفق المنهج',
 save_memorization_plan_whole_ayah:'حفظ خطة الحفظ بالآيات الكاملة',
 get_or_create_guardian_access:'تجهيز رابط بوابة ولي الأمر',
 sync_student_review_plans:'مزامنة خطط المراجعة',
 update_plan_details_guarded:'تعديل تفاصيل الخطة',
 get_platform_activity_report:'استخراج تقرير الأداء التشغيلي',
 record_platform_activity_batch:'إرسال سجلات الحركة إلى مركز الأداء',
 get_talaqqin_dashboard:'عرض لوحة التلقين',
 save_talaqqin_assessment_lesson_guarded:'حفظ حصيلة درس التلقين',
 sanabil_performance_save_dryrun:'تجربة كتابة اختبارية دون حفظ دائم',
 get_guardian_excuses_for_circle:'عرض طلبات الاستئذان',
 save_student_attendance_bulk:'تسجيل تحضير الطلاب جماعيًا',
 submit_offline_attendance_claim:'رفع طلب بصمة للمراجعة',
 load:'تحميل البيانات',save:'حفظ التغييرات',in:'تسجيل الحضور',
 out:'تسجيل الانصراف',performance:'فتح قياسات الأداء',
 'toggle-theme':'تبديل المظهر الداكن والفاتح',
 'prepare-offline':'تجهيز البيانات للعمل دون اتصال',
 'load-lookups':'تحميل قوائم النظام',
 'save-student-#':'حفظ حصيلة الطالب',
 'autosave-student':'الحفظ التلقائي لحصيلة الطالب',
 'tl-save-#':'حفظ حصيلة درس التلقين',
 'tl-card':'فتح بطاقة طالب التلقين',
 'tl-correct-lesson':'تصحيح درس التلقين',
 'wa-#':'مشاركة حصيلة الطالب عبر واتساب',
 'save-all':'حفظ حصائل الحلقة كاملة',
 'save-attendance':'حفظ التحضير',
 'all-present':'تحضير جميع الطلاب',
 'open':'فتح الصفحة',
 'close':'إغلاق النافذة',
 'next-day':'البحث عن اليوم التعليمي التالي',
 'unhandled-promise':'خطأ برمجي لم تتم معالجته',
 'javascript-runtime':'خطأ أثناء تنفيذ الواجهة',
 'button:button':'النقر على زر غير مسمى',
 'button:submit':'إرسال نموذج',
 'button:control':'النقر على عنصر تحكم',
 'form':'تقديم نموذج',
 'rpc:my_access':'التحقق من صلاحيات المستخدم',
 'actual:open':'فتح جلسة الحلقة مع ظهور البطاقات',
 'actual:switch':'الانتقال إلى بطاقة الطالب',
 'actual:save_student':'حفظ حصيلة الطالب وتأكيدها',
 'actual:save_student_access':'التحقق من صلاحية حفظ الحصيلة',
 'actual:save_student_write':'كتابة الحصيلة في قاعدة البيانات',
 'actual:save_student_verify':'التحقق من الحصيلة بعد حفظها',
 'actual:save_all':'حفظ جميع حصائل الحلقة وتأكيدها',
 'actual:save_talaqqin':'حفظ حصيلة التلقين وتأكيدها',
 'session:render':'تهيئة بطاقات الطلاب',
 'session:permission':'التحقق من سماح الجلسة',
 'session:data':'جلب بيانات الجلسة',
 'session:absences':'جلب أسباب الغياب',
 'session:next-day':'البحث عن اليوم التالي',
 'session_open':'بدء جلسة الحلقة',
 'outcome_save':'تأكيد حفظ الحصيلة',
 'attendance_save':'تأكيد حفظ التحضير',
 'open-session':'فتح الجلسة',
 'load:lookups':'تحميل بيانات الاختيار',
 'page:dashboard':'فتح الرئيسية',
 'page:settings':'فتح الإعدادات',
 'page:outcomes':'فتح الحصيلة',
 'page:plans':'فتح الخطط',
 'page:attendance':'فتح البصمة'
};
const kinds={rpc:'طلب من الخادم',click:'ضغط على زر',change:'تعديل اختيار أو حقل',
 submit:'إرسال نموذج',operation:'قياس عملية',navigation:'تنقل بين النوافذ',
 error:'خطأ برمجي',load:'تحميل',page:'فتح صفحة'};
const devices={mobile:'هاتف محمول',tablet:'جهاز لوحي',desktop:'حاسوب',
 unknown:'جهاز لم يُعرف نوعه'};
const metrics={open:'فتح الجلسة',switch:'الانتقال بين الطلاب',
 write:'الكتابة التشخيصية التي أُلغيت',save_student:'حفظ حصيلة طالب',
 save_all:'حفظ حصيلة الحلقة',save_talaqqin:'حفظ حصيلة التلقين'};
const descriptions={
 save_test_day_reviews_guarded:'رفض الخادم بعض طلبات حفظ مراجعات يوم الاختبار. راجع حالة اليوم وصلاحية المعلم والتقديرات المطلوبة. لا يحتوي سجل القياس وحده على نص سبب كل رفض.',
 preview_methodology_memorization_plan:'تعذر حساب خطة حفظ في بعض المحاولات. قد يرتبط ذلك بمدخلات الخطة أو حسابها؛ راجع الخطأ التفصيلي قبل تحديد السبب.',
 'wa-#':'تعذرت مشاركة بعض الحصائل. تحقق من حفظ الحصيلة وتأكيد الخادم ورقم ولي الأمر وإمكانية فتح واتساب.',
 update_quran_daily_range_guarded:'تعذر تعديل نطاق بعض المقررات. افحص صلاحيات المعلم، والتقدير المحفوظ، والترحيلات أو النتائج المرتبطة.',
 save_plan_bundle:'تعذر اعتماد خطة طالب في بعض المحاولات. يلزم الاطلاع على رسالة الخادم وتفاصيل التحقق من الخطة.',
 apply_offline_operations_batch:'فشلت بعض محاولات مزامنة عمليات محلية أو احتاجت إلى معالجة. تحقق من السجلات المعلقة وصلاحيات الأيام السابقة دون حذفها.'
};
const strip=value=>String(value??'').trim();
const normalize=value=>strip(value).replace(/\d+/g,'#');
const view=value=>{
 const key=strip(value).replace(/^\/+/,'');
 return views[value]||views[key]||views[key.toLowerCase()]||('نافذة أخرى في النظام');
};
const action=value=>{
 const original=strip(value),key=normalize(original);
 if(actions[original])return actions[original];
 if(actions[key])return actions[key];
 const rpc=original.match(/^(?:rpc:|operation:rpc:)([a-z_0-9]+)$/i);
 if(rpc)return actions[rpc[1]]||'طلب خدمة داخلية في النظام';
 if(original.startsWith('action:'))return action(original.slice(7));
 if(original.startsWith('operation:'))return action(original.slice(10));
 if(original.startsWith('click:'))return action(original.slice(6));
 if(original.startsWith('change:'))return action(original.slice(7));
 if(original.startsWith('submit:'))return 'إرسال نموذج وحفظ بياناته';
 if(original.startsWith('actual:'))return actions[original]||'قياس إجراء استخدام فعلي';
 if(/^wa[-:#]/i.test(original))return actions['wa-#'];
 if(/^(?:save-student-|autosave-student)/i.test(original))return 'حفظ حصيلة الطالب';
 if(/^tl-(?:save|correct|card)/i.test(original))return 'التعامل مع حصيلة طالب التلقين';
 if(/^page:/i.test(original))return 'فتح '+view(original.slice(5));
 if(/^button[:#]/i.test(original))return 'الضغط على زر في الصفحة';
 if(/^input:|^select:|^textarea:/i.test(original))return 'تعديل حقل في نموذج';
 if(/^id:|^class:/i.test(original))return 'استخدام أداة في الواجهة';
 if(/^save:form$/i.test(original))return 'إرسال نموذج الحفظ';
 if(!original)return 'إجراء لم تُحدد هويته';
 return 'إجراء آخر في النظام';
};
const kind=value=>kinds[strip(value)]||'نشاط من المنصة';
const device=value=>devices[strip(value)]||'جهاز آخر';
const network=value=>({ '4g':'شبكة الجيل الرابع','3g':'شبكة الجيل الثالث','5g':'شبكة الجيل الخامس','2g':'شبكة الجيل الثاني',wifi:'شبكة لاسلكية',offline:'دون اتصال' })[strip(value).toLowerCase()]||'شبكة غير محددة';
const metric=value=>metrics[strip(value)]||action(value);
const note=value=>{
 const k=normalize(strip(value).replace(/^(?:rpc:|action:|operation:)/,''));
 return descriptions[k]||'يوجد تعثر مسجل في هذا الإجراء؛ لا يمكن الجزم بالسبب من عدد الإخفاقات وحده. ارجع إلى رسالة الرفض وسجل الخادم للتحقق.';
};
const error=value=>{
 const raw=strip(value);
 if(!raw)return 'لم يُسجّل وصف لسبب الخطأ';
 if(/timeout|timed out|57014|statement timeout/i.test(raw))return 'انتهت مهلة الاتصال أو تنفيذ الطلب';
 if(/permission|not authorized|forbidden|42501|denied/i.test(raw))return 'رفض الخادم الإجراء لعدم توفر الصلاحية';
 if(/failed to fetch|networkerror|network request/i.test(raw))return 'تعذر الاتصال بالخادم';
 if(/not found|404/i.test(raw))return 'لم يعثر النظام على البيانات أو الخدمة المطلوبة';
 if(/[A-Za-z]/.test(raw))return 'تعذر إتمام العملية، وورد وصف تقني غير معرّب؛ راجع سجلات الخادم لتحديد السبب';
 return raw;
};
// Apply only to fixed interface terminology. Never translate user-entered
// values, phone numbers, e-mail addresses, links, source code, or attributes.
const fixedTerms=[
 [/P95/g,'زمن استجابة ٩٥٪ من المحاولات'],
 [/\bExcel\b/gi,'إكسل'],[/\bCSV\b/g,'ملف جدول بيانات'],
 [/\bJSON\b/g,'بيانات مفصّلة'],[/\bPDF\b/g,'ملف جاهز للطباعة'],
 [/\bChrome\b/g,'كروم'],[/\bEdge\b/g,'إيدج'],
 [/\bGitHub Pages\b/g,'استضافة جيت هب'],[/\bCloudflare\b/g,'كلاودفلير'],
 [/\bSupabase\b/g,'سوبابيس'],[/\bDNS\b/g,'نظام أسماء النطاقات'],
 [/\bSNI\b/g,'اسم الخادم'],[/\bcurl\b/g,'أداة فحص الاتصال'],
 [/\bHTTP\b/g,'بروتوكول الاتصال'],[/\bGET\b/g,'جلب البيانات'],
 [/\bms\b/g,'مللي ثانية'],[/\bPWA\b/g,'تطبيق قابل للتثبيت'],[/\bAPI\b/g,'واجهة الاتصال'],
 [/\badmin\b/g,'مدير النظام'],[/\bmanager\b/g,'مشرف المجمع'],
 [/\bsupervisor\b/g,'المشرف'],[/\bteacher\b/g,'المعلم'],
 [/\bmobile\b/g,'هاتف محمول'],[/\btablet\b/g,'جهاز لوحي'],
 [/\bdesktop\b/g,'حاسوب']
];
const normalizeFixedText=value=>{
 let output=String(value??'');
 for(const [pattern,replacement] of fixedTerms)output=output.replace(pattern,replacement);
 return output;
};
const excluded=node=>{
 const parent=node?.parentElement;
 return !parent||!!parent.closest('script,style,noscript,code,pre,textarea,input,select,option,[contenteditable="true"],[data-no-translate],[translate="no"]');
};
const translateNode=node=>{
 if(node?.nodeType!==3||excluded(node))return;
 const old=node.nodeValue;
 if(!old||!/[A-Za-z]/.test(old)||/https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(old))return;
 const translated=normalizeFixedText(old);
 if(translated!==old)node.nodeValue=translated;
};
const translateSubtree=root=>{
 if(!root||root.nodeType===3){translateNode(root);return}
 if(root.nodeType!==1||root.matches?.('script,style,pre,code,textarea,input,select,option,[translate="no"],[data-no-translate]'))return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let item=walker.nextNode();item;item=walker.nextNode())translateNode(item);
};
let taskPending=false;const pendingNodes=new Set();
const flushTranslations=()=>{
 taskPending=false;
 const batch=[...pendingNodes];pendingNodes.clear();
 for(const node of batch)if(node?.isConnected)translateSubtree(node);
};
const observeInterface=()=>{
 if(!document.documentElement||typeof MutationObserver!=='function')return;
 const observer=new MutationObserver(mutations=>{
  for(const change of mutations){
   if(change.type==='characterData')pendingNodes.add(change.target);
   else for(const node of change.addedNodes||[])if(node.nodeType===1||node.nodeType===3)pendingNodes.add(node);
  }
  if(pendingNodes.size&&!taskPending){taskPending=true;setTimeout(flushTranslations,0)}
 });
 observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
 pendingNodes.add(document.body||document.documentElement);taskPending=true;setTimeout(flushTranslations,0);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeInterface,{once:true});
else observeInterface();

const percentile='زمن الاستجابة الذي لا تتجاوزه ٩٥٪ من المحاولات';
const duration=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'—':Number(n).toLocaleString('ar-SA')+' مللي ثانية';
const state=value=>({success:'ناجح',error:'فشل',failed:'فشل',pending:'بانتظار الإرسال',
 timeout:'انتهاء مهلة الطلب',unknown:'غير محدد'})[strip(value)]||'غير محدد';
window.SanabilArabicUI=Object.freeze({view,action,kind,device,network,metric,note,error,state,duration,percentile,normalizeFixedText,translateSubtree});
})();