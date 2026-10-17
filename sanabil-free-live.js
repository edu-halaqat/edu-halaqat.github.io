/* Individual temporary student invitations; teacher approval before media. */
(()=>{'use strict';if(window.SanabilFreeLive)return;
const ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
const create=(tag,cls,str)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(str)el.textContent=str;return el};
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
let current=null;
const SESSION_KEY='sanabil-private-teacher-video-v2';
// Stored only in this browser tab, for the invitation's remaining validity.
// Never save teacher-room bearer secrets to localStorage or a remote table.
function readSaved(){
 try{
  const raw=sessionStorage.getItem(SESSION_KEY);if(!raw)return null;
  const state=JSON.parse(raw);
  if(state?.version!==2||typeof state.owner!=='string'||typeof state.circleId!=='string'
     ||!Number.isFinite(state.expires)||state.expires<=Date.now()
     ||!Array.isArray(state.invites)){sessionStorage.removeItem(SESSION_KEY);return null}
  state.invites=state.invites.filter(x=>x&&typeof x.id==='string'
    &&/^snv[a-f0-9]{48}$/.test(x.room)
    &&/^[A-Za-z0-9_-]{43}$/.test(x.secret)
    &&Number.isFinite(x.expires)&&x.expires>Date.now()&&x.expires<=state.expires);
  return state;
 }catch{try{sessionStorage.removeItem(SESSION_KEY)}catch{}return null}
}
function remember(s){
 if(s.closed)return;
 try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({
  version:2,owner:s.owner,circleId:s.circleId,expires:s.expires,
  selectedStudentId:s.selectedStudentId||'',
  invites:[...s.invites.values()].filter(x=>x.ready&&x.expires>Date.now()).map(x=>({
   id:x.id,room:x.room,secret:x.secret,expires:x.expires
  }))
 }))}catch{}
}
function forget(){try{sessionStorage.removeItem(SESSION_KEY)}catch{}}
function reattach(s,root){
 const bar=root?.querySelector?.('.sl-session-filter');
 if(!bar)return false;
 s.root?.classList.remove('sl-peer-active');
 s.root=root;
 if(s.wrap.previousElementSibling!==bar||s.wrap.parentElement!==bar.parentElement)
  bar.insertAdjacentElement('afterend',s.wrap);
 root.classList.add('sl-peer-active');
 s.dockListener?.();
 return true;
}

const publish=async(s,event,payload)=>{
 if(s.closed)return;
 const targets=payload.to?[s.invites.get(payload.to)].filter(Boolean):[...s.invites.values()];
 for(const invite of targets)if(invite.ready&&Date.now()<invite.expires){
  const sealed=await window.SanabilVideoCrypto.pack(invite.key,invite.room,event,payload);
  await invite.channel.send({type:'broadcast',event,payload:sealed});
 }
};
const status=(s,message)=>{s.status.textContent=message};
async function disconnect(s){if(s.pc){s.pc.ontrack=null;s.pc.onicecandidate=null;s.pc.close();s.pc=null}if(s.media){s.media.getTracks().forEach(t=>t.stop());s.media=null}s.remote.srcObject=null;s.self.srcObject=null;s.active=null;s.iceQueue=[]}
async function acquire(s){if(s.media)return s.media;try{s.media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:{width:640,height:360}})}
catch{s.media=await navigator.mediaDevices.getUserMedia({audio:true,video:false})}s.self.srcObject=s.media;return s.media}
async function startPeer(s,to){
 await disconnect(s);s.active=to;
 const stream=await acquire(s),pc=new RTCPeerConnection(ICE);s.pc=pc;
 stream.getTracks().forEach(track=>pc.addTrack(track,stream));
 pc.ontrack=e=>{s.remote.srcObject=e.streams[0]||new MediaStream([e.track]);s.remote.play().catch(()=>{})};
 pc.onicecandidate=e=>{if(e.candidate)publish(s,'signal',{from:'host',to,kind:'candidate',data:e.candidate.toJSON()}).catch(()=>{})};
 pc.onconnectionstatechange=()=>{if(s.pc!==pc)return;
 if(pc.connectionState==='connected')status(s,'متصل · يمكن تسميع الطالب وحفظ حصيلته من الصفحة نفسها');
 else if(['failed','disconnected'].includes(pc.connectionState))status(s,'تعذّر الاتصال المباشر بهذه الشبكة؛ جرّب شبكة أخرى ثم أعد المحاولة.')};
 const offer=await pc.createOffer();await pc.setLocalDescription(offer);
 await publish(s,'signal',{from:'host',to,kind:'offer',data:pc.localDescription.toJSON()});
 status(s,'أُرسل طلب الاتصال؛ بانتظار رد الطالب');
}
function queueView(s){s.queue.replaceChildren();
 for(const [id,name] of s.waiting){
 const row=create('div','sl-peer-waitrow');
 row.append(create('span','',name));
 const yes=create('button','','موافقة وتسميع');yes.onclick=async()=>{yes.disabled=true;try{
  if(s.active){await publish(s,'signal',{from:'host',to:s.active,kind:'hangup'});await disconnect(s)}
  await publish(s,'admission',{to:id,accepted:true});s.waiting.delete(id);queueView(s);await startPeer(s,id)}
  catch(err){status(s,'تعذر الاتصال: '+err.message);yes.disabled=false}};
 const no=create('button','','رفض');no.onclick=async()=>{s.waiting.delete(id);queueView(s);await publish(s,'admission',{to:id,accepted:false}).catch(()=>{});const invite=s.invites.get(id);s.invites.delete(id);if(invite)await window.supabaseClient.removeChannel(invite.channel)};
 row.append(yes,no);s.queue.append(row);
 }}
async function stop(){const s=current;if(!s||s.closed)return;
 await publish(s,'ended',{}).catch(()=>{});s.closed=true;
 await disconnect(s);try{await Promise.all([...s.invites.values()].map(x=>window.supabaseClient.removeChannel(x.channel)))}catch{}
 if(s.dockListener){
  window.removeEventListener('scroll',s.dockListener);
  document.removeEventListener('scroll',s.dockListener,true);
  window.removeEventListener('resize',s.dockListener);
 }
 if(s.dockFrame!=null)cancelAnimationFrame(s.dockFrame);
 if(s.watchdog)clearInterval(s.watchdog);s.invites.clear();
 s.root?.querySelectorAll('[data-return-to-video]').forEach(button=>button.remove());
 s.wrap.remove();const root=s.root;if(root)root.classList.remove('sl-peer-active');if(current===s)current=null;forget();
}
async function open(root,{circleId,restored=null}={}){
 if(!circleId)throw Error('اختر الحلقة أولًا.');
 if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)throw Error('لا يدعم المتصفح WebRTC والميكروفون.');
 if(!navigator.onLine)throw Error('يحتاج الاتصال المرئي إلى إنترنت.');
 const sb=window.supabaseClient;if(!sb)throw Error('لم يجهز اتصال سنابل بالسحابة.');
 const user=await sb.auth.getUser();if(!user.data?.user||user.error)throw Error('الرجاء الدخول بحساب المعلم.');
 const verify=await sb.rpc('my_access',{});
 if(verify.error||!verify.data?.active||!verify.data?.roles?.some(r=>['admin','manager','supervisor','teacher'].includes(r)))throw Error('التسميع متاح للمعلم والإدارة ضمن صلاحيات الحلقة.');
 const [circleResult,studentResult,scopeResult]=await Promise.all([
  sb.from('circles').select('id,name').eq('id',circleId).eq('active',true).single(),
  sb.from('students').select('id,full_name,guardian_phone,student_phone').eq('circle_id',circleId).eq('active',true).order('full_name'),
  sb.rpc('get_daily_assignments',{p_circle_id:circleId,p_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date())})
 ]);
 if(circleResult.error||!circleResult.data||studentResult.error||scopeResult.error)throw Error('تعذر التحقق من صلاحية الحلقة وطلابها.');
 if(!window.SanabilVideoCrypto)throw Error('حدّث الصفحة لتحميل مكوّن الاتصال.');
 const students=studentResult.data||[];
 if(current){
  if(current.circleId===circleId){
   reattach(current,root);
   current.wrap.scrollIntoView({block:'nearest'});
   return;
  }
  await stop();
 }
 const recovered=restored||readSaved();
 const snapshot=recovered?.owner===user.data.user.id&&recovered.circleId===circleId?recovered:null;
 if(recovered&&!snapshot)forget();
 const token='snp'+random(),s={circleId,token,owner:user.data.user.id,closed:false,ready:false,waiting:new Map(),active:null,pc:null,media:null,iceQueue:[],invites:new Map(),students,selectedStudentId:snapshot?.selectedStudentId||''};
 const wrap=create('section','sl-peer-panel');s.wrap=wrap;s.root=root;
 const top=create('div','sl-peer-header');
 const headerTitle=create('strong','','سنابل المباشر · التسميع المرئي');top.append(headerTitle);
 const expand=create('button','','المنتظرون');expand.type='button';
 expand.onclick=()=>{s.forceExpanded=!s.forceExpanded;wrap.classList.toggle('sl-peer-expand-details',s.forceExpanded)};
 top.append(expand);
 const jump=create('button','','الحصيلة ↓');
 jump.type='button';
 jump.setAttribute('aria-label','الانتقال إلى تسجيل حصيلة الطلاب دون إيقاف البث');
 const locateStudentOutcome=()=>{
  const targetId=s.active||s.selectedStudentId;
  const outcome=s.root.querySelector('.sl-data');
  if(!outcome||!targetId){status(s,'اختر طالبًا للتسميع أولًا.');return false}
  const card=[...outcome.querySelectorAll('[data-outcome-student-id]')].find(c=>c.dataset.outcomeStudentId===targetId);
  if(card){
   const search=outcome.querySelector('#sl-outcome-search-input');
   if(search?.value){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}))}
   outcome.querySelectorAll('[data-return-to-video]').forEach(button=>button.remove());
   const back=document.createElement('button');back.type='button';back.className='button button-soft sl-return-video';
   back.dataset.returnToVideo='true';back.textContent='↖ العودة إلى التسميع المرئي';
   back.onclick=()=>{if(!s.closed&&s.wrap.isConnected)s.wrap.scrollIntoView({behavior:'smooth',block:'start'})};
   card.prepend(back);
   card.scrollIntoView({behavior:'smooth',block:'start'});
   card.focus({preventScroll:true});
   status(s,'تم الوصول إلى حصيلة الطالب دون إيقاف البث.');
   return true;
  }
  const load=s.root.querySelector('[data-action="load"]');
  if(load&&!load.disabled){
   s.root.dataset.videoOutcomeTarget=targetId;
   load.click();
   status(s,'جارٍ تجهيز حصيلة الطالب المحدد.');
  }else status(s,'افتح جلسة الحصيلة أولًا ثم حاول مجددًا.');
  return false;
 };
 jump.onclick=locateStudentOutcome;
 s.jumpToOutcome=locateStudentOutcome;
 top.append(jump);
 const end=create('button','','إنهاء البث');end.onclick=()=>stop();top.append(end);wrap.append(top);
 wrap.append(create('p','sl-peer-warning','متاح للحلقات الحضورية وعن بُعد. اختر الطالب وأرسل رابطه الشخصي إلى ولي أمره؛ الدخول بعد موافقتك. لا يغيّر الاتصال سجل الحضور ولا يُسجّل صوتًا أو صورة.'));
 const videos=create('div','sl-peer-videos');s.remote=create('video');s.self=create('video');
 for(const v of [s.remote,s.self]){v.autoplay=true;v.playsInline=true;v.controls=false}
 s.self.muted=true;
 s.remote.setAttribute('aria-label','بث الطالب');s.self.setAttribute('aria-label','صورة المعلم');
 videos.append(s.remote,s.self);
 // Keep a normal-sized stage in the document even while its video becomes
 // a small fixed overlay. This prevents Chrome scroll-anchoring loops.
 const videoStage=create('div','sl-peer-video-stage');
 videoStage.append(videos);
 wrap.append(videoStage);
 const selector=create('select');selector.setAttribute('aria-label','الطالب المدعو للتسميع');
 selector.addEventListener('change',()=>{s.selectedStudentId=selector.value;remember(s)});
 const placeholder=create('option','','اختر الطالب');placeholder.value='';selector.append(placeholder);
 for(const student of students){const option=create('option','',student.full_name);option.value=student.id;selector.append(option)}
 const btn=create('button','','إنشاء رابط شخصي للطالب');btn.type='button';
 const invitationBox=create('div');wrap.append(selector,btn,invitationBox);
 const displayInvitation=(student,invite)=>{
  s.selectedStudentId=student.id;selector.value=student.id;remember(s);
  invitationBox.replaceChildren();
  invitationBox.append(create('p','',student.full_name+' · الرابط صالح حتى انتهاء الجلسة، ويمكن العودة إليه بعد إرسال واتساب.'));
  const linkInput=create('input');linkInput.readOnly=true;linkInput.value=invite.link;linkInput.setAttribute('aria-label','رابط الطالب الشخصي');invitationBox.append(linkInput);
  const copy=create('button','','نسخ الرابط');
  copy.type='button';
  copy.onclick=()=>navigator.clipboard.writeText(invite.link).then(()=>status(s,'نُسخ الرابط، ويمكن العودة إلى المنصة دون إغلاق التسميع.')).catch(()=>{linkInput.focus();linkInput.select()});
  invitationBox.append(copy);
  const phone=String(student.guardian_phone||student.student_phone||'').replace(/[^0-9]/g,'');
  const normalized=phone.startsWith('00')?phone.slice(2):phone.length===10&&phone.startsWith('0')?'966'+phone.slice(1):phone;
  if(/^[1-9][0-9]{9,14}$/.test(normalized)){
   const wa=create('a','','إرسال الرابط عبر واتساب');
   wa.target='_blank';wa.rel='noopener noreferrer';
   wa.href='https://wa.me/'+normalized+'?text='+encodeURIComponent('السلام عليكم ورحمة الله وبركاته، نرجو انضمام الطالب '+student.full_name+' إلى التسميع المرئي في سنابل الوحي عبر رابطه الشخصي، وعدم مشاركته مع الآخرين:\n'+invite.link);
   wa.addEventListener('click',()=>remember(s));
   invitationBox.append(wa);
  }
  if(navigator.share){
   const share=create('button','','مشاركة الرابط من الجهاز');share.type='button';
   share.onclick=async()=>{remember(s);try{await navigator.share({title:'دعوة التسميع المرئي في سنابل الوحي',text:'رابط تسميع الطالب '+student.full_name+'\n'+invite.link})}catch(e){if(e.name!=='AbortError')status(s,'تعذرت المشاركة؛ استخدم نسخ الرابط أو واتساب.')}};
   invitationBox.append(share);
  }
 };
 btn.onclick=async()=>{
  const student=students.find(x=>x.id===selector.value);if(!student){status(s,'اختر الطالب أولًا.');return}
  btn.disabled=true;try{
   const invite=await createInvite(s,student);
   displayInvitation(student,invite);
   status(s,'الرابط مخصص للطالب المختار. شاركه ثم ارجع إلى هذه الصفحة وانتظر طلب الانضمام.');
  }catch(error){status(s,error.message)}finally{btn.disabled=false}
 };
 const studentSearch=create('div','sl-peer-outcome-search');
 const searchLabel=create('label','','الوصول السريع لحصيلة الطالب');
 const searchInput=create('input');searchInput.type='search';
 searchInput.placeholder='ابحث عن الطالب في الحصيلة';searchInput.setAttribute('aria-label','البحث داخل الحصيلة');
 searchInput.addEventListener('input',()=>{
  const outcome=s.root.querySelector('#sl-outcome-search-input');
  if(outcome){outcome.value=searchInput.value;outcome.dispatchEvent(new Event('input',{bubbles:true}))}
 });
 studentSearch.append(searchLabel,searchInput);wrap.append(studentSearch);
 s.status=create('p','sl-peer-status','جارٍ إعداد الجلسة…');wrap.append(s.status);
 wrap.append(create('h4','','المنتظرون للموافقة'));s.queue=create('div','sl-peer-queue');wrap.append(s.queue);
 const bar=root.querySelector('.sl-session-filter');if(!bar)throw Error('صفحة الحصيلة غير جاهزة.');
 bar.insertAdjacentElement('afterend',wrap);
 root.classList.add('sl-peer-active');
 s.forceExpanded=false;
 s.dockFrame=null;
 const updateDock=()=>{
  s.dockFrame=null;
  if(s.closed||!videoStage.isConnected)return;
  // Never use position:sticky on the entire teacher panel on mobile.
  // Only float the VIDEO after its original on-page stage was scrolled past.
  if(window.innerWidth>=900){
   wrap.classList.remove('sl-peer-floating');
   videoStage.style.minHeight='';
   return;
  }
  if(!videoStage.style.minHeight){
   videoStage.style.minHeight=Math.ceil(videoStage.getBoundingClientRect().height)+'px';
  }
  const scrolledPastVideo=videoStage.getBoundingClientRect().bottom<72;
  wrap.classList.toggle('sl-peer-floating',scrolledPastVideo);
 };
 s.dockListener=()=>{
  if(s.closed||s.dockFrame!==null)return;
  s.dockFrame=requestAnimationFrame(updateDock);
 };
 window.addEventListener('scroll',s.dockListener,{passive:true});
 // Some Sanabil views scroll inside a container instead of window.
 document.addEventListener('scroll',s.dockListener,true);
 window.addEventListener('resize',s.dockListener,{passive:true});
 s.dockListener();
 s.watchdog=setInterval(()=>{
  if(Date.now()>s.expires){stop().catch(()=>{});return}
  // Framework re-renders and Android task switching may detach the view;
  // keep the authenticated invitation channels alive until explicit termination.
  if(!s.root.isConnected||!s.wrap.isConnected){
   const page=[...document.querySelectorAll('.sl-live .sl-content')].find(el=>el.querySelector('.sl-session-filter'));
   if(page)reattach(s,page);
  }
 },1000);
 s.expires=snapshot?.expires||Date.now()+2*60*60*1000;
 status(s,'جاهز للحلقات الحضورية وعن بُعد؛ اختر الطالب لإنشاء رابط شخصي.');
 current=s;
 if(snapshot?.invites?.length){
  let recoveredCount=0;
  for(const saved of snapshot.invites){
   const student=students.find(x=>x.id===saved.id);if(!student)continue;
   try{
    const invite=await createInvite(s,student,saved);
    recoveredCount++;
    if(student.id===snapshot.selectedStudentId||!invitationBox.hasChildNodes())displayInvitation(student,invite);
   }catch(e){status(s,'تعذر استعادة أحد الروابط. أعد إنشاء الرابط للطالب عند الحاجة.')}
  }
  if(recoveredCount)status(s,'استُعيدت جلسة التسميع وروابطها بعد العودة إلى المنصة. انتظر طلب انضمام الطالب أو اطلب إعادة الضغط على الانضمام.');
  else status(s,'استُعيدت صفحة التسميع. أنشئ رابطًا جديدًا للطالب.');
 }
 remember(s);
}

async function createInvite(s,student,saved=null){
 const existing=s.invites.get(student.id);
 if(existing&&Date.now()<existing.expires)return existing;
 if(existing){await window.supabaseClient.removeChannel(existing.channel);s.invites.delete(student.id)}
 const C=window.SanabilVideoCrypto,secret=saved?.secret||C.random(),room=saved?.room||'snv'+random(),key=await C.importKey(secret);
 const invite={id:student.id,name:student.full_name,room,secret,key,expires:saved?.expires||Math.min(s.expires,Date.now()+2*60*60*1000),seen:new Set(),ready:false};
 const fragment=new URLSearchParams({id:student.id,key:secret,expires:String(invite.expires)});
 invite.link=location.origin+'/sanabil-free-student.html?room='+room+'#'+fragment.toString();
 const ch=window.supabaseClient.channel('sanabil-video:'+room,{config:{broadcast:{self:false}}});invite.channel=ch;
 let inbox=Promise.resolve();
 const on=(event,handler)=>ch.on('broadcast',{event},e=>{
  inbox=inbox.then(async()=>{
   if(s.closed)return;
   const data=await C.unpack(key,room,event,e.payload,invite.seen,invite.expires);
   if(data)await handler(data);
  }).catch(()=>status(s,'تعذر معالجة الاتصال؛ أعد دعوة الطالب.'));
 });
 on('knock',async()=>{
  if(s.active===student.id)return;
  s.waiting.set(student.id,student.full_name);queueView(s);
 });
 on('signal',async d=>{
  if(!s.pc||s.active!==student.id||d.to!=='host'||d.from!==student.id)return;
  try{
   if(d.kind==='answer'){await s.pc.setRemoteDescription(new RTCSessionDescription(d.data));for(const candidate of s.iceQueue)await s.pc.addIceCandidate(candidate);s.iceQueue=[]}
   if(d.kind==='candidate'){const c=new RTCIceCandidate(d.data);if(s.pc.remoteDescription)await s.pc.addIceCandidate(c);else s.iceQueue.push(c)}
   if(d.kind==='hangup'){await disconnect(s);status(s,'انتهى تسميع الطالب')}
  }catch(error){status(s,'تعذر الاتصال: '+error.message)}
 });
 s.invites.set(student.id,invite);
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('تعذر تجهيز رابط الطالب؛ أعد المحاولة.')),12000);
   ch.subscribe(state=>{
    if(state==='SUBSCRIBED'){clearTimeout(timeout);invite.ready=true;resolve()}
    else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){clearTimeout(timeout);reject(Error('تعذر الاتصال بخدمة اللقاء.'))}
   });
  });
 }catch(error){s.invites.delete(student.id);await window.supabaseClient.removeChannel(ch);throw error}
 remember(s);
 return invite;
}

async function restore(root){
 const saved=readSaved();
 if(!saved?.invites?.length)return false;
 const sb=window.supabaseClient;
 if(!sb)return false;
 const {data,error}=await sb.auth.getUser();
 if(error||!data?.user)return false;
 if(data.user.id!==saved.owner){forget();return false}
 const selector=root.querySelector('[name="circle"]');
 if(!selector||![...selector.options].some(option=>option.value===saved.circleId))return false;
 selector.value=saved.circleId;
 await open(root,{circleId:saved.circleId,restored:saved});
 return true;
}
window.SanabilFreeLive={open,stop,restore};
window.addEventListener('sanabil-session-changed',async()=>{
 const s=current;
 try{
  const {data}=await window.supabaseClient.auth.getSession();
  const owner=data?.session?.user?.id;
  if(s&&!s.closed){
   if(current!==s)return;
   if(owner===s.owner)return; // Automatic JWT refresh is not a logout.
   await stop();
  }else if(readSaved()&&owner!==readSaved()?.owner){forget()}
 }catch{ /* Network interruptions must not end a teaching session. */ }
});
window.addEventListener('pagehide',()=>{
 if(current&&!current.closed){
  remember(current);
  // Release capture when leaving the page; restore invitation subscriptions
  // from the same tab on return. Never mark this as an explicit teacher exit.
  disconnect(current).catch(()=>{});
 }
});
})();