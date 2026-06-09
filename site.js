const sb = window.skyhawkSupabase;

function esc(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function money(v){return v===null||v===undefined||v==="" ? "" : Number(v).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0});}
function files(p){return Array.isArray(p.aircraft_files)?p.aircraft_files:[];}
function tiers(p){return Array.isArray(p.aircraft_pricing_tiers)?p.aircraft_pricing_tiers:[];}

async function signUrls(aircraft){
  const paths = aircraft.flatMap(p => files(p)).filter(f => f.file_path).map(f => f.file_path);
  if(!paths.length) return aircraft;
  const {data,error}=await sb.storage.from(AIRCRAFT_FILES_BUCKET).createSignedUrls(paths,3600);
  if(error){console.warn(error);return aircraft;}
  const map=new Map((data||[]).map(x=>[x.path,x.signedUrl]));
  aircraft.forEach(p=>files(p).forEach(f=>f.signedUrl=map.get(f.file_path)||""));
  return aircraft;
}

function primaryVisual(p){
  return files(p).filter(f=>f.is_public && ["photo","video"].includes(f.file_category))
    .sort((a,b)=>(b.is_primary-a.is_primary)||((a.display_order||0)-(b.display_order||0)))[0];
}
function publicDocs(p){
  return files(p).filter(f=>f.is_public && !["photo","video"].includes(f.file_category))
    .sort((a,b)=>(a.display_order||0)-(b.display_order||0));
}
function renderMedia(p,i){
  const f=primaryVisual(p);
  if(!f||!f.signedUrl) return `<div class="photo-slot photo-${i%4+1}"><span>Add aircraft photo</span></div>`;
  if(f.file_category==="video") return `<div class="photo-slot media-slot"><video src="${esc(f.signedUrl)}" muted controls playsinline></video></div>`;
  return `<div class="photo-slot photo-${i%4+1}" style="background-image:linear-gradient(rgba(16,42,67,.16),rgba(16,42,67,.16)),url('${esc(f.signedUrl)}')"></div>`;
}
function renderPricing(p){
  const list=tiers(p).filter(t=>t.is_public).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
  if(!list.length) return `<div class="pricing-box"><strong>Pricing</strong><p>Contact for current lease pricing.</p></div>`;
  return `<div class="pricing-box"><strong>Pricing options</strong>${list.map(t=>{
    let line = t.tier_type==="unlimited"
      ? `${money(t.monthly_price)} / month · unlimited hours`
      : t.tier_type==="minimum"
        ? `${money(t.monthly_price)} / month · ${esc(t.included_hours||"")} hrs included${t.overage_rate?`, ${money(t.overage_rate)}/hr overage`:""}`
        : (t.monthly_price ? `${money(t.monthly_price)} / month` : "Call for quote");
    return `<div class="price-tier"><b>${esc(t.tier_name)}</b><span>${line}</span>${t.notes?`<small>${esc(t.notes)}</small>`:""}</div>`;
  }).join("")}</div>`;
}
function renderDocs(p){
  const docs=publicDocs(p);
  if(!docs.length) return "";
  return `<div class="public-docs"><strong>Public records</strong>${docs.map(f=>`<a href="${esc(f.signedUrl)}" target="_blank" rel="noopener">${esc(f.caption||f.file_name||f.file_category)}</a>`).join("")}</div>`;
}
async function getAircraft(){
  const {data,error}=await sb.from("aircraft").select(`
    *,
    aircraft_pricing_tiers (*),
    aircraft_files (*)
  `).eq("is_public",true).order("display_order",{ascending:true});
  if(error){console.error(error);return [];}
  return signUrls(data||[]);
}
async function renderFleet(filter="all"){
  const grid=document.getElementById("fleet-grid");
  grid.innerHTML=`<div class="empty-state">Loading aircraft…</div>`;
  const all=await getAircraft();
  const visible=all.filter(p=>filter==="all" || (filter==="Available"?p.status==="Available":p.category===filter));
  document.getElementById("aircraft-count").textContent=all.length;
  document.getElementById("fleet-heading").textContent=`${all.length} aircraft currently available for lease.`;
  if(!visible.length){grid.innerHTML=`<div class="empty-state">No aircraft match this filter.</div>`;return;}
  grid.innerHTML=visible.map((p,i)=>`
    <article class="aircraft-card">
      ${renderMedia(p,i)}
      <div class="aircraft-body">
        <div class="aircraft-topline"><p>${esc(p.category)}</p><span>${esc(p.status)}</span></div>
        <h3>${esc(p.tail_number)}</h3>
        <p class="aircraft-summary">${esc(p.summary)}</p>
        <dl>
          <div><dt>Year</dt><dd>${esc(p.year||"Available on request")}</dd></div>
          <div><dt>Model</dt><dd>${esc(p.model)}</dd></div>
          <div><dt>Panel</dt><dd>${esc(p.panel)}</dd></div>
          <div><dt>Time</dt><dd>${esc(p.total_time)} / ${esc(p.engine_time)}</dd></div>
        </dl>
        ${renderPricing(p)}
        ${renderDocs(p)}
        <a href="#signup" class="text-link">Request terms for ${esc(p.tail_number)} →</a>
      </div>
    </article>`).join("");
}
async function handleLead(e){
  e.preventDefault();
  const form=e.currentTarget;
  const msg=document.getElementById("lead-message");
  const row=Object.fromEntries(new FormData(form).entries());
  row.marketing_consent = form.marketing_consent.checked;
  row.source = "website";
  msg.textContent="Saving…";
  const {data,error}=await sb.from("customers").insert(row).select().single();
  if(error){msg.textContent=error.message;return;}
  try{ await sb.functions.invoke("mailchimp-sync",{body:{customer:data}}); }catch(err){ console.warn("Mailchimp sync not deployed/configured.",err); }
  form.reset();
  msg.textContent="Thanks — you are on the availability list.";
}
document.addEventListener("DOMContentLoaded",()=>{
  renderFleet();
  document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>renderFleet(b.dataset.filter)));
  document.getElementById("lead-form").addEventListener("submit",handleLead);
});
