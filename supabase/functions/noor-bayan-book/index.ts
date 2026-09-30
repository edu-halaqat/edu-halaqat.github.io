const FILE_ID="1MDXoqUOHw5O7QGJo7upcIYIRTMOK4Tzo";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"range,content-type","Access-Control-Expose-Headers":"Content-Length,Content-Range,Accept-Ranges"};
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  const range=req.headers.get("range")||"";
  const urls=[
    `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${FILE_ID}&confirm=t`
  ];
  for(const url of urls){
    try{
      const h=new Headers({"User-Agent":"Mozilla/5.0"});
      if(range)h.set("Range",range);
      const r=await fetch(url,{headers:h,redirect:"follow"});
      const ct=(r.headers.get("content-type")||"").toLowerCase();
      if(r.ok&&(ct.includes("pdf")||ct.includes("octet-stream"))){
        const out=new Headers(cors);
        out.set("Content-Type","application/pdf");
        out.set("Content-Disposition","inline; filename=\"noor-al-bayan.pdf\"");
        for(const k of ["content-length","content-range","accept-ranges","etag","last-modified"]){
          const v=r.headers.get(k);if(v)out.set(k,v);
        }
        return new Response(r.body,{status:r.status,headers:out});
      }
    }catch{}
  }
  return new Response(JSON.stringify({error:"تعذر فتح نسخة نور البيان من المصدر العام."}),{status:502,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
});