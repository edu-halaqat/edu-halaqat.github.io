/* Experimental zero-server WebRTC: one teacher and one student at a time.
   Do not roll out for real minors until student authentication is verified. */
(()=>{'use strict';if(window.SanabilFreeLive)return;
const ICE={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]};
const create=(tag,cls,str)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(str)el.textContent=str;return el};
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
let current=null;
const publish=async(s,event,payload)=>{if(s.ready&&!s.closed)await s.channel.send({type:'broadcast',event,payload})};
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
 else if(['failed','disconnected'].includes(pc.connectionState))status(s,'تعذّر أو انقطع الاتصال؛ قد تحتاج الشبكة إلى TURN، وهو غير متاح في النسخة المجانية.')};
 const offer=await pc.createOffer();await pc.setLocalDescription(offer);
 await publish(s,'signal',{from:'host',to,kind:'offer',data:pc.localDescription.toJSON()});
 status(s,'أُرسل طلب الاتصال؛ بانتظار رد الطالب');
}
function queueView(s){s.queue.replaceChildren();
 for(const [id,name] of s.waiting){
 const row=create('div','sl-peer-waitrow');
 row.append(create('span','',name+' (اسم أدخله الزائر ولا يثبت الهوية)'));
 const yes=create('button','','موافقة وتسميع');yes.onclick=async()=>{yes.disabled=true;try{
  if(s.active){await publish(s,'signal',{from:'host',to:s.active,kind:'hangup'});await disconnect(s)}
  await publish(s,'admission',{to:id,accepted:true});s.waiting.delete(id);queueView(s);await startPeer(s,id)}
  catch(err){status(s,'تعذر الاتصال: '+err.message);yes.disabled=false}};
 const no=create('button','','رفض');no.onclick=()=>{s.waiting.delete(id);queueView(s);publish(s,'admission',{to:id,accepted:false}).catch(()=>{})};
 row.append(yes,no);s.queue.append(row);
 }}
async function stop(){const s=current;if(!s||s.closed)return;
 await publish(s,'ended',{}).catch(()=>{});s.closed=true;
 await disconnect(s);try{await window.supabaseClient.removeChannel(s.channel)}catch{}
 if(s.dockListener){window.removeEventListener('scroll',s.dockListener);window.removeEventListener('resize',s.dockListener)}s.wrap.remove();const root=s.root;if(root)root.classList.remove('sl-peer-active');if(current===s)current=null;
}
async function open(root,{circleId}={}){
 if(!circleId)throw Error('اختر الحلقة أولًا.');
 if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)throw Error('لا يدعم المتصفح WebRTC والميكروفون.');
 if(!navigator.onLine)throw Error('يحتاج الاتصال المرئي إلى إنترنت.');
 const sb=window.supabaseClient;if(!sb)throw Error('لم يجهز اتصال سنابل بالسحابة.');
 const user=await sb.auth.getUser();if(!user.data?.user||user.error)throw Error('الرجاء الدخول بحساب المعلم.');
 const verify=await sb.rpc('my_access',{});if(verify.error||!verify.data?.roles?.includes('admin'))throw Error('التجربة محصورة حاليًا في حساب مدير النظام حتى إكمال التحقق من الطلاب.');
 if(current){if(current.circleId===circleId){current.wrap.scrollIntoView();return}await stop()}
 const token='snp'+random(),s={circleId,token,closed:false,ready:false,waiting:new Map(),active:null,pc:null,media:null,iceQueue:[]};
 const wrap=create('section','sl-peer-panel');s.wrap=wrap;s.root=root;
 const top=create('div','sl-peer-header');
 const headerTitle=create('strong','','سنابل المباشر · تسميع تجريبي');top.append(headerTitle);
 const expand=create('button','','المنتظرون');expand.type='button';
 expand.onclick=()=>{s.forceExpanded=!s.forceExpanded;wrap.classList.toggle('sl-peer-expand-details',s.forceExpanded)};
 top.append(expand);
 const end=create('button','','إنهاء البث');end.onclick=()=>stop();top.append(end);wrap.append(top);
 wrap.append(create('p','sl-peer-warning','تحذير: نموذج أولي لا يتحقق من هوية الطالب. لا تستخدم طلابًا أو بيانات حقيقية حتى إتمام المصادقة والاختبارات.'));
 const videos=create('div','sl-peer-videos');s.remote=create('video');s.self=create('video');
 for(const v of [s.remote,s.self]){v.autoplay=true;v.playsInline=true;v.controls=false}
 s.self.muted=true;
 s.remote.setAttribute('aria-label','بث الطالب');s.self.setAttribute('aria-label','صورة المعلم');
 videos.append(s.remote,s.self);wrap.append(videos);
 const link=location.origin+'/sanabil-free-student.html?room='+encodeURIComponent(token);
 const btn=create('button','','نسخ رابط لقاء تجريبي');btn.onclick=async()=>{try{await navigator.clipboard.writeText(link);status(s,'نسخت رابط الجلسة. شاركه مع جهاز اختبار فقط.')}catch{prompt('الرابط',link)}};
 wrap.append(btn);
 const studentSearch=create('div','sl-peer-outcome-search');
 const searchLabel=create('label','','الوصول السريع لحصيلة الطالب');
 const searchInput=create('input');searchInput.type='search';
 searchInput.placeholder='ابحث عن الطالب في الحصيلة';searchInput.setAttribute('aria-label','البحث داخل الحصيلة');
 searchInput.addEventListener('input',()=>{
  const outcome=root.querySelector('#sl-outcome-search-input');
  if(outcome){outcome.value=searchInput.value;outcome.dispatchEvent(new Event('input',{bubbles:true}))}
 });
 studentSearch.append(searchLabel,searchInput);wrap.append(studentSearch);
 s.status=create('p','sl-peer-status','جارٍ إعداد الجلسة…');wrap.append(s.status);
 wrap.append(create('h4','','المنتظرون للموافقة'));s.queue=create('div','sl-peer-queue');wrap.append(s.queue);
 const bar=root.querySelector('.sl-session-filter');if(!bar)throw Error('صفحة الحصيلة غير جاهزة.');
 bar.insertAdjacentElement('afterend',wrap);
 root.classList.add('sl-peer-active');
 s.forceExpanded=false;
 s.dockListener=()=>{
  if(s.closed||!wrap.isConnected)return;
  const dock=window.innerWidth<1050&&wrap.getBoundingClientRect().top<=16;
  wrap.classList.toggle('sl-peer-compact',dock);
 };
 window.addEventListener('scroll',s.dockListener,{passive:true});
 window.addEventListener('resize',s.dockListener,{passive:true});
 s.dockListener();
 const ch=sb.channel('sanabil-trial:'+token,{config:{broadcast:{self:false}}});s.channel=ch;
 ch.on('broadcast',{event:'knock'},e=>{if(s.closed)return;const d=e.payload||{};
  if(typeof d.id!=='string'||!(/^[a-f0-9-]{36}$/i).test(d.id)||typeof d.name!=='string')return;
  if(d.id===s.active)return;s.waiting.set(d.id,d.name.trim().slice(0,50)||'طالب تجريبي');queueView(s)});
 ch.on('broadcast',{event:'signal'},async e=>{const d=e.payload||{};if(!s.pc||d.to!=='host'||d.from!==s.active)return;
 try{if(d.kind==='answer'){await s.pc.setRemoteDescription(new RTCSessionDescription(d.data));
 for(const candidate of s.iceQueue)await s.pc.addIceCandidate(candidate);s.iceQueue=[]}
 if(d.kind==='candidate'){const c=new RTCIceCandidate(d.data);if(s.pc.remoteDescription)await s.pc.addIceCandidate(c);else s.iceQueue.push(c)}
 if(d.kind==='hangup'){await disconnect(s);status(s,'انتهى تسميع الطالب')}}catch(err){status(s,'خطأ في الاتصال: '+err.message)}});
 ch.subscribe((state,err)=>{if(s.closed)return;if(state==='SUBSCRIBED'){s.ready=true;status(s,'جاهز؛ انسخ الرابط لجهاز الاختبار وانتظر الطلب.')}
 else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT')status(s,'خطأ بإشارة الاتصال: '+(err?.message||state))});
 current=s;
}
window.SanabilFreeLive={open,stop};
window.addEventListener('pagehide',()=>stop().catch(()=>{}));
})();