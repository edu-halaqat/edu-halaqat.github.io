# ربط سنابل الوحي ↔ جدير — إعداد مرحلي آمن (18 أكتوبر 2026)

> **الحالة:** جرى إعداد قاعدة سنابل ووظيفتي إرسال/استقبال على Supabase، ولكن **لم يُفعّل الربط التشغيلي بين المنصتين** لأن جهة Firebase المستقبِلة وأسرار الخادمين لم تُتحقق بعد. لا يجوز الادعاء بأن نتيجة نُشرت في سنابل بمجرد دخولها صندوق الوارد.

## المشروعات والنطاق
- سنابل: Supabase `fvzoogbdezueswyihxiz`، ومستودع `edu-halaqat/edu-halaqat.github.io`.
- جدير: Firebase `quran-tests-program` والموقع `jadeerquran.web.app`.
- لا يُغيّر الربط طلبات سنابل أو نتائجها السابقة، ولا ينشئ غيابًا أو يمس سجل اختبار سابق.

## المُنجز على جانب سنابل
1. حقل `public.exam_requests.destination` بقيمتي `snabil` و`jadeer`؛ الافتراضي `snabil` يحافظ على الطلبات القديمة.
2. مخطط خاص `integration_jadeer` لا يملك `anon` أو `authenticated` صلاحية دخوله؛ يحتوي `outbound_requests` و`results_inbox`، وتُمنع النتائج المكررة برقمها.
3. `integration_jadeer.resolve_target(jsonb)` يطابق رقم طلب سنابل الأصلي مع كامل نطاق الطالب/المعلم/الحلقة/المجمع، أو يُطابق **أسماء الجهات الأربعة كاملةً** في طلب أنشأته جدير مباشرةً. إذا لم تكن المطابقة فريدة يُرجع سببًا عربيًا دقيقًا. لا توجد مطابقة مبنية على اسم الطالب وحده.
4. إجراءات `public.jadeer_bridge_delivery_state` و`public.jadeer_bridge_record_delivery` و`public.jadeer_bridge_receive_result` متاحة لـ `service_role` فقط، وليست للمستخدمين العاديين.
5. Edge Function `sanabil-jadeer-send` يتطلب جلسة مستخدم سنابل، ويتحقق من العضوية وإسناد الطالب، ثم يرسل البيانات المحدودة اللازمة إلى Firebase. يعتمد نجاح التسليم فقط عند استلام `{acknowledged:true, request_id:"..."}` من خادم جدير.
6. Edge Function `sanabil-jadeer-inbox` يتطلب توقيع HMAC للمتن `timestamp + "." + rawBody` باستخدام SHA-256 والنافذة الزمنية 5 دقائق، ونتيجة `completed` معتمدة ودرجات سليمة. يُدخل النتيجة إلى صندوق مراجعة منفصل، **ولا يُنشئ نتيجة اختبار رسمية حتى يُختبر تحويل نتائج جدير إلى بنية سنابل**.
7. ملفات الواجهة في هذا الفرع تظل مغلقة تلقائيًا إذا لم يُؤكد خادم جدير جاهزيته؛ طلبٌ يفشل إرساله يبقى محفوظًا محليًا مع خيار المحاولة مرة أخرى بنفس المعرف.

## التهيئة اللازمة على Firebase — غير منفذة
- نشر Cloud Function باسم مناسب لاستقبال طلبات سنابل إلى سجل جدير الرسمي، لا إلى مجموعة مهملة؛ يشترط مصادقة الخادم المشترك ويتعامل مع `snabil_request_id` بإدخال واحد فقط.
- ترجع Cloud Function إقرارًا فقط بعد نجاح كتابة Firestore؛ وإلا تُرجع خطأً واضحًا.
- تقرر واجهة مشرف جدير إحدى جهتين عند اعتماد النتيجة: `جدير فقط` (لا يُرسل أي webhook)، أو `جدير وسنابل الوحي` (يُرسل webhook موقع بعد حفظ النتيجة).
- عند غياب المجمع/الحلقة/المعلم/الطالب أو عدم تطابقه، تظهر رسالة الإدراج ولا تُنشر النتيجة. يجب معالجة التطابق قبل إشعار المشرف بنجاح النشر.
- عدم تغيير حالة طالب إلى `لم يحضر` بسبب فشل نقل النتيجة.

## أسرار التشغيل — في إعدادات الخادم فقط
على Supabase Edge Functions:
- `JADEER_REQUEST_ENDPOINT`: عنوان HTTPS الصحيح لوظيفة استقبال الطلبات في Firebase.
- `JADEER_SHARED_SECRET`: سر عشوائي مشترك بطول 32 محرفًا فأكثر مع Firebase لتوثيق إرسال الطلب.
- `JADEER_RESULT_SECRET`: سر عشوائي مستقل بطول 32 محرفًا فأكثر للتحقق من توقيع النتائج الواردة.

على Firebase Cloud Functions: تخزين أسرار الاستقبال والإرسال المقابلة في Secret Manager؛ لا توضع في HTML أو JavaScript العام أو مستودعات GitHub. يجب أن يكون ضبطها بيد المسؤول المفوض.

## عقد الطلب إلى جدير
`POST` إلى `JADEER_REQUEST_ENDPOINT` مع `Authorization: Bearer <shared-secret>`.
المتن يحوي `source:"sanabil"` و`snabil_request_id` و`student{id,name}` و`teacher{id,name}` و`circle{id,name}` و`complex{id,name}` و`exam{type,syllabus,question_count,lines_per_question}`.
الاستجابة المقبولة: `{"acknowledged":true,"request_id":"<actual-firestore-id>","snabil_request_id":"<same-id>"}`. لا يعد HTTP 200 وحده إقرارًا.

## عقد النتيجة إلى سنابل
`POST /functions/v1/sanabil-jadeer-inbox`، متن JSON يتضمن `source_project:"quran-tests-program"` و`jadeer_result_id` و`publish_mode:"jadeer_and_snabil"` وبيانات المطابقة الأربع، و`result{status:"completed",approved:true,scores:{memorization,tajweed,total},performed_at,...}`.
- `x-jadeer-timestamp`: Unix seconds.
- `x-jadeer-signature`: `v1=<HMAC-SHA256-hex(timestamp+"."+raw-body)>`.
- تعيد الوظيفة `received:true,published:false,state:"ready"|"unmatched"`. لا يجوز لواجهة جدير عرض «نُشرت في سنابل» قبل إضافة مسار نشر معتمد وإقرار `published:true` الصادر بعد كتابته فعليًا.

## اختبارات أُنجزت
- مطابقة حقيقية لطالب نشط عبر أسماء الطالب ومعلمه وحلقته ومجمعه.
- رفض مجمع غير موجود، ثم حلقة غير موجودة، ثم معلم غير موجود، ثم طالب غير موجود.
- مراجعة صلاحية مخطط الربط: لا وصول `anon` أو `authenticated`، وطلبات الاختبارات الخمسة القديمة ظلت ضمن وجهة سنابل.
- يجب إضافة اختبارات Firebase الحقيقية قبل دمج هذا الفرع أو تفعيل السر: طلب واحد، إعادة المحاولة دون تكرار، نتيجة «جدير فقط»، نتيجة «جدير وسنابل»، اختلال الإسناد، ونتيجة مكررة مختلفة.

## ملاحظة نشر
هذا الفرع مرحلة تجهيز ومراجعة: لا يُدمج مع `main` ولا يُفعّل الخيار للمعلمين إلا بعد اكتمال جهة Firebase، وإقرار الاستلام، واختبار نشر النتيجة على طالب تجريبي من المجمع الصحيح.
