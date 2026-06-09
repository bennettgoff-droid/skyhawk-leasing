const sb=window.skyhawkSupabase;
let aircraft=[], selectedPlane=null, currentPricing=[], currentFiles=[], customers=[], selectedCustomer=null;

function esc(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function clean(v){return String(v||"file").replace(/\s+/g,"-").replace(/[^a-zA-Z0-9._-]/g,"");}
function folder(t){return String(t||"aircraft").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");}
function money(v){return v ? Number(v).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0}) : "";}
function files(p){return Array.isArray(p.aircraft_files)?p.aircraft_files:[];}
function pricing(p){return Array.isArray(p.aircraft_pricing_tiers)?p.aircraft_pricing_tiers:[];}

async function checkSession(){
  const {data}=await sb.auth.getSession();
  const session=data?.session;
  if(!session){showLogin();return;}
  const {data:admin}=await sb.from("admin_users").select("user_id").eq("user_id",session.user.id).maybeSingle();
  if(!admin){document.getElementById("login-message").textContent="Signed in user is not in admin_users.";showLogin();return;}
  showAdmin(); await loadAll();
}
function showLogin(){document.getElementById("login-section").hidden=false;document.getElementById("admin-section").hidden=true;document.getElementById("logout-button").style.display="none";}
function showAdmin(){document.getElementById("login-section").hidden=true;document.getElementById("admin-section").hidden=false;document.getElementById("logout-button").style.display="inline-flex";}

async function loadAll(){
  document.getElementById("connection-status").textContent="Loading…";
  const {data,error}=await sb.from("aircraft").select("*,aircraft_pricing_tiers(*),aircraft_files(*)").order("display_order",{ascending:true});
  if(error){document.getElementById("connection-status").textContent=error.message;return;}
  aircraft=data||[];
  const cust=await sb.from("customers").select("*").order("created_at",{ascending:false}).limit(500);
  customers=cust.data||[];
  document.getElementById("connection-status").textContent="Connected.";
  renderAircraftList(); renderCustomers();
}
function renderAircraftList(){
  const el=document.getElementById("admin-aircraft-list");
  el.innerHTML=aircraft.map(p=>`<button class="admin-aircraft-item" data-id="${p.id}"><strong>${esc(p.tail_number)}</strong><span>${esc(p.status)} · ${esc(p.total_time)} / ${esc(p.engine_time)}</span><small>${pricing(p).length} pricing tier(s) · ${files(p).length} file(s)</small></button>`).join("") || `<p class="muted">No aircraft.</p>`;
  el.querySelectorAll("button").forEach(b=>b.onclick=()=>selectPlane(b.dataset.id));
}
async function signFiles(list){
  const paths=list.map(f=>f.file_path).filter(Boolean);
  if(!paths.length) return list;
  const {data}=await sb.storage.from(AIRCRAFT_FILES_BUCKET).createSignedUrls(paths,3600);
  const m=new Map((data||[]).map(x=>[x.path,x.signedUrl]));
  list.forEach(f=>f.signedUrl=m.get(f.file_path)||"");
  return list;
}
async function selectPlane(id){
  selectedPlane=aircraft.find(p=>p.id===id);
  if(!selectedPlane)return;
  document.getElementById("plane-id").value=selectedPlane.id;
  ["tail-number","status","category","display-order","year","model","panel","total-time","engine-time","lease","summary"].forEach(()=>{});
  document.getElementById("tail-number").value=selectedPlane.tail_number||"";
  document.getElementById("status").value=selectedPlane.status||"Available";
  document.getElementById("category").value=selectedPlane.category||"Glass Panel";
  document.getElementById("display-order").value=selectedPlane.display_order||0;
  document.getElementById("year").value=selectedPlane.year||"";
  document.getElementById("model").value=selectedPlane.model||"Cessna 172S Skyhawk";
  document.getElementById("panel").value=selectedPlane.panel||"";
  document.getElementById("total-time").value=selectedPlane.total_time||"";
  document.getElementById("engine-time").value=selectedPlane.engine_time||"";
  document.getElementById("lease").value=selectedPlane.lease_terms||"";
  document.getElementById("is-public").value=selectedPlane.is_public?"true":"false";
  document.getElementById("summary").value=selectedPlane.summary||"";
  currentPricing=pricing(selectedPlane).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
  currentFiles=await signFiles(files(selectedPlane).sort((a,b)=>(a.display_order||0)-(b.display_order||0)));
  renderPricingList(); renderFiles(); clearTier();
}
function planePayload(){
  return {
    tail_number:document.getElementById("tail-number").value.trim().toUpperCase(),
    status:document.getElementById("status").value,
    category:document.getElementById("category").value,
    display_order:Number(document.getElementById("display-order").value||0),
    year:document.getElementById("year").value.trim(),
    model:document.getElementById("model").value.trim(),
    panel:document.getElementById("panel").value.trim(),
    total_time:document.getElementById("total-time").value.trim(),
    engine_time:document.getElementById("engine-time").value.trim(),
    lease_terms:document.getElementById("lease").value.trim(),
    is_public:document.getElementById("is-public").value==="true",
    summary:document.getElementById("summary").value.trim(),
    updated_at:new Date().toISOString()
  }
}
async function savePlane(){
  const payload=planePayload();
  if(!payload.tail_number){alert("Tail number required.");return;}
  let q;
  if(document.getElementById("plane-id").value) q=await sb.from("aircraft").update(payload).eq("id",document.getElementById("plane-id").value).select().single();
  else q=await sb.from("aircraft").insert(payload).select().single();
  if(q.error){alert(q.error.message);return;}
  await loadAll(); await selectPlane(q.data.id); alert("Aircraft saved.");
}
function clearPlane(){selectedPlane=null;document.getElementById("aircraft-form").reset();document.getElementById("model").value="Cessna 172S Skyhawk";document.getElementById("lease").value="Monthly minimum + hourly overage";document.getElementById("display-order").value=aircraft.length+1;document.getElementById("plane-id").value="";currentPricing=[];currentFiles=[];renderPricingList();renderFiles();clearTier();}
async function deletePlane(){const id=document.getElementById("plane-id").value;if(!id)return alert("Select aircraft first.");if(!confirm("Delete selected aircraft?"))return;const {error}=await sb.from("aircraft").delete().eq("id",id);if(error)alert(error.message);else{clearPlane();await loadAll();}}

function tierPayload(){
  return {
    aircraft_id:selectedPlane?.id,
    tier_name:document.getElementById("tier-name").value.trim(),
    tier_type:document.getElementById("tier-type").value,
    monthly_price:document.getElementById("monthly-price").value||null,
    included_hours:document.getElementById("included-hours").value||null,
    overage_rate:document.getElementById("overage-rate").value||null,
    display_order:Number(document.getElementById("tier-display-order").value||0),
    is_public:document.getElementById("tier-public").value==="true",
    notes:document.getElementById("tier-notes").value.trim(),
    updated_at:new Date().toISOString()
  }
}
async function saveTier(e){e.preventDefault();if(!selectedPlane)return alert("Select aircraft first.");const p=tierPayload();if(!p.tier_name)return alert("Tier name required.");const id=document.getElementById("pricing-id").value;const res=id?await sb.from("aircraft_pricing_tiers").update(p).eq("id",id):await sb.from("aircraft_pricing_tiers").insert(p);if(res.error)alert(res.error.message);else{await loadAll();await selectPlane(selectedPlane.id);}}
function clearTier(){document.getElementById("pricing-id").value="";document.getElementById("pricing-form").reset();document.getElementById("tier-public").value="true";document.getElementById("tier-display-order").value=currentPricing.length+1;}
function renderPricingList(){
  document.getElementById("pricing-list").innerHTML=currentPricing.map(t=>`<button type="button" class="record-item" data-tier="${t.id}"><strong>${esc(t.tier_name)}</strong><span>${esc(t.tier_type)} · ${money(t.monthly_price)} · ${t.included_hours||""} hrs · ${t.overage_rate?money(t.overage_rate)+"/hr":""} · ${t.is_public?"Public":"Hidden"}</span></button>`).join("") || `<p class="helper-text">No pricing tiers yet.</p>`;
  document.querySelectorAll("[data-tier]").forEach(b=>b.onclick=()=>{const t=currentPricing.find(x=>x.id===b.dataset.tier); if(!t)return; document.getElementById("pricing-id").value=t.id; document.getElementById("tier-name").value=t.tier_name||""; document.getElementById("tier-type").value=t.tier_type||"minimum"; document.getElementById("monthly-price").value=t.monthly_price||""; document.getElementById("included-hours").value=t.included_hours||""; document.getElementById("overage-rate").value=t.overage_rate||""; document.getElementById("tier-display-order").value=t.display_order||0; document.getElementById("tier-public").value=t.is_public?"true":"false"; document.getElementById("tier-notes").value=t.notes||"";});
}
async function deleteTier(){const id=document.getElementById("pricing-id").value;if(!id)return alert("Select tier first.");const {error}=await sb.from("aircraft_pricing_tiers").delete().eq("id",id);if(error)alert(error.message);else{await loadAll();await selectPlane(selectedPlane.id);}}

async function uploadFiles(){
  if(!selectedPlane) return alert("Select aircraft first.");
  const selected=Array.from(document.getElementById("file-upload").files||[]);
  if(!selected.length)return alert("Choose files first.");
  const cat=document.getElementById("file-category").value, pub=document.getElementById("file-public").value==="true";
  for(let i=0;i<selected.length;i++){
    const f=selected[i], path=`${folder(selectedPlane.tail_number)}/${cat}/${Date.now()}-${i}-${clean(f.name)}`;
    const up=await sb.storage.from(AIRCRAFT_FILES_BUCKET).upload(path,f,{contentType:f.type||undefined,upsert:false});
    if(up.error) throw up.error;
    const ins=await sb.from("aircraft_files").insert({aircraft_id:selectedPlane.id,file_path:path,file_name:f.name,file_category:cat,mime_type:f.type||"",size_bytes:f.size||0,is_public:pub,is_primary:currentFiles.length===0&&["photo","video"].includes(cat),display_order:currentFiles.length+i+1});
    if(ins.error) throw ins.error;
  }
  document.getElementById("file-upload").value="";
  await loadAll(); await selectPlane(selectedPlane.id); alert("Files uploaded.");
}
function renderFiles(){
  document.getElementById("file-preview-list").innerHTML=currentFiles.map(f=>{
    const prev=f.file_category==="photo"&&f.signedUrl?`<img src="${f.signedUrl}">`:f.file_category==="video"&&f.signedUrl?`<video src="${f.signedUrl}" controls muted></video>`:`<div class="file-icon"><strong>${esc(f.file_category)}</strong><span>${esc(f.mime_type||"file")}</span></div>`;
    return `<div class="file-preview">${prev}<div class="file-meta"><strong>${esc(f.file_name||f.file_path)}</strong><span>${f.is_public?"Public":"Private"}${f.is_primary?" · Primary":""}</span></div><div class="media-controls"><button data-primary="${f.id}">Primary</button><button data-pub="${f.id}">${f.is_public?"Private":"Public"}</button><button data-open="${f.id}">Open</button><button data-del-file="${f.id}">Remove</button></div></div>`
  }).join("") || `<p class="helper-text">No files yet.</p>`;
  document.querySelectorAll("[data-primary]").forEach(b=>b.onclick=()=>setPrimary(b.dataset.primary));
  document.querySelectorAll("[data-pub]").forEach(b=>b.onclick=()=>toggleFilePublic(b.dataset.pub));
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{const f=currentFiles.find(x=>x.id===b.dataset.open); if(f?.signedUrl) window.open(f.signedUrl,"_blank");});
  document.querySelectorAll("[data-del-file]").forEach(b=>b.onclick=()=>deleteFile(b.dataset.delFile));
}
async function setPrimary(id){await sb.from("aircraft_files").update({is_primary:false}).eq("aircraft_id",selectedPlane.id).in("file_category",["photo","video"]);await sb.from("aircraft_files").update({is_primary:true}).eq("id",id);await loadAll();await selectPlane(selectedPlane.id);}
async function toggleFilePublic(id){const f=currentFiles.find(x=>x.id===id);await sb.from("aircraft_files").update({is_public:!f.is_public}).eq("id",id);await loadAll();await selectPlane(selectedPlane.id);}
async function deleteFile(id){const f=currentFiles.find(x=>x.id===id);if(!confirm("Remove file?"))return;await sb.storage.from(AIRCRAFT_FILES_BUCKET).remove([f.file_path]);await sb.from("aircraft_files").delete().eq("id",id);await loadAll();await selectPlane(selectedPlane.id);}

function customerPayload(){return {organization_name:document.getElementById("cust-org").value,contact_name:document.getElementById("cust-contact").value,email:document.getElementById("cust-email").value,phone:document.getElementById("cust-phone").value,city:document.getElementById("cust-city").value,state:document.getElementById("cust-state").value,customer_type:document.getElementById("cust-type").value,monthly_hours:document.getElementById("cust-hours").value,marketing_consent:document.getElementById("cust-consent").checked,notes:document.getElementById("cust-notes").value,source:"admin"}}
async function saveCustomer(){const p=customerPayload();if(!p.email)return alert("Email required.");const {error}=await sb.from("customers").insert(p);if(error)alert(error.message);else{await loadAll();alert("Customer saved.");}}
function renderCustomers(){
  document.getElementById("customer-list").innerHTML=customers.map(c=>`<button class="record-item" data-customer="${c.id}" type="button"><strong>${esc(c.organization_name||c.email)}</strong><span>${esc(c.contact_name||"")} · ${esc(c.email)} · ${esc(c.state||"")} · ${esc(c.customer_type||"")}</span></button>`).join("") || `<p class="helper-text">No customers yet.</p>`;
  document.querySelectorAll("[data-customer]").forEach(b=>b.onclick=()=>{selectedCustomer=customers.find(c=>c.id===b.dataset.customer); const c=selectedCustomer; document.getElementById("cust-org").value=c.organization_name||"";document.getElementById("cust-contact").value=c.contact_name||"";document.getElementById("cust-email").value=c.email||"";document.getElementById("cust-phone").value=c.phone||"";document.getElementById("cust-city").value=c.city||"";document.getElementById("cust-state").value=c.state||"";document.getElementById("cust-type").value=c.customer_type||"Flight School";document.getElementById("cust-hours").value=c.monthly_hours||"";document.getElementById("cust-consent").checked=!!c.marketing_consent;document.getElementById("cust-notes").value=c.notes||"";});
}
async function syncCustomer(){const c=selectedCustomer||customerPayload(); if(!c.email)return alert("Select or enter a customer."); const {error}=await sb.functions.invoke("mailchimp-sync",{body:{customer:c}}); if(error)alert(error.message); else alert("Sent to Mailchimp function.");}
function exportCSV(){const cols=["organization_name","contact_name","email","phone","city","state","customer_type","monthly_hours","marketing_consent","notes"];const rows=[cols.join(",")].concat(customers.map(c=>cols.map(k=>`"${String(c[k]??"").replaceAll('"','""')}"`).join(",")));document.getElementById("csv-output").value=rows.join("\\n");}
async function importCustomers(){const text=document.getElementById("bulk-csv").value.trim();if(!text)return;const rows=text.split(/\\r?\\n/).map(r=>r.split(",").map(x=>x.trim()));const data=rows.map(r=>({organization_name:r[0],email:r[1],contact_name:r[2],phone:r[3],city:r[4],state:r[5],customer_type:r[6]||"Flight School",source:"csv_import",marketing_consent:true})).filter(r=>r.email);const {error}=await sb.from("customers").insert(data);if(error)alert(error.message);else{await loadAll();alert(`Imported ${data.length} customers.`);}}

document.addEventListener("DOMContentLoaded",async()=>{
  document.getElementById("logout-button").style.display="none"; await checkSession();
  document.getElementById("login-form").onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.signInWithPassword({email:login_email.value,password:login_password.value}); if(error)login_message.textContent=error.message; else await checkSession();};
  document.getElementById("logout-button").onclick=async()=>{await sb.auth.signOut();showLogin();};
  document.getElementById("aircraft-form").onsubmit=e=>{e.preventDefault();savePlane();};
  document.getElementById("new-plane").onclick=clearPlane; document.getElementById("delete-plane").onclick=deletePlane; document.getElementById("refresh-data").onclick=loadAll;
  document.getElementById("pricing-form").onsubmit=saveTier; document.getElementById("new-tier").onclick=clearTier; document.getElementById("delete-tier").onclick=deleteTier;
  document.getElementById("upload-files").onclick=()=>uploadFiles().catch(e=>alert(e.message));
  document.getElementById("save-customer").onclick=saveCustomer; document.getElementById("sync-customer").onclick=syncCustomer; document.getElementById("export-customers").onclick=exportCSV; document.getElementById("import-customers").onclick=importCustomers;
});
