const STORAGE = "bf-office-v1";

// ==========================================
// 1. GitHub 自動同步設定
// ==========================================
const GITHUB_CONFIG = {
  owner: "JellyBall319",     // ⚠️ 請修改為你的 GitHub Username
  repo: "boyfriend-manager",         // ⚠️ 請修改為你的 Repository 名稱
  filePath: "boyfriend-office-backup.json", // 儲存在 Repo 內的 JSON 檔名
  branch: "main",             // 分支名稱 (通常是 main 或 master)
  token: ""                   // 可留空，建議在網頁「設定」頁面輸入 Token 儲存
};

const seed = {
  boyfriend: { name: "黃敏輝", nickname: "Sensei", startDate: "2026-07-23" },
  score: 100,
  threshold: 45,
  events: [],
  achievements: [],
  review: null,
  settings: {categories:["溝通問題","遲到／時間","訊息／電話","感情問題","唔記得","態度問題","日常生活","金錢","飲食","其他"]}
  ,timeline:[
    {title:'第一次約會',date:'2026-07-14',desc:'馬拉松式相睇大會，係咁俾人drill到勁深☕️仲要漏咗把遮行到九尺咁遠拎返!! 不過臨落車有人就話下次見🤓✨我哋會有幾多個下次呢',type:'positive'},
    {title:'開始喺一齊',date:'2026-07-23',desc:'會永遠記得有人點呃我表白🤗傻瓜到驚旅行返嚟我俾第二個match呃走咗🤌🏻但當聽到黃敏輝話驚失敗之後段關係就完結，如果未係時候，寧願再努力吓😗💦等到ready嘅時候開口就可以留住個關係☺️好啦放過你',type:'positive'}
  ]
};

const SHEET_URL = "https://script.google.com/macros/s/AKfycbyGg4migSNg5R7OpdjGle5oRqpUtE0lD0muNAAhxxOfe4L1sxQ9eSWWz-VTY7C8udL-/exec";

let data = load();
let _syncTimer = null;
let _lastSync = null;

function load(){
  try { return JSON.parse(localStorage.getItem(STORAGE)) || structuredClone(seed); }
  catch(e){ return structuredClone(seed); }
}

function save(){ 
  localStorage.setItem(STORAGE, JSON.stringify(data)); 
  syncToSheet(); 
  syncToGitHub(); // 每次儲存自動觸發 GitHub 同步
}

// 取得有效的 GitHub Token (優先使用 localStorage 內儲存的 Token)
function getGitHubToken() {
  return localStorage.getItem("bf-gh-token") || GITHUB_CONFIG.token;
}

// 取得 GitHub 上檔案現有的 SHA (GitHub API 覆蓋檔案時必填)
async function getGitHubFileSha() {
  const token = getGitHubToken();
  if (!token || !GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) return null;

  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.filePath}?ref=${GITHUB_CONFIG.branch}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (res.ok) {
      const json = await res.json();
      return json.sha;
    }
  } catch (err) {
    console.error("無法取得 GitHub 檔案 SHA:", err);
  }
  return null;
}

// 自動提交並覆蓋 GitHub Repository 內的 JSON 檔案
async function syncToGitHub() {
  const token = getGitHubToken();
  if (!token || !GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) return;

  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    try {
      const sha = await getGitHubFileSha();
      // 將 JSON 轉為 UTF-8 Base64 編碼
      const jsonString = JSON.stringify(data, null, 2);
      const contentEncoded = btoa(unescape(encodeURIComponent(jsonString)));

      const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.filePath}`;
      const body = {
        message: `auto: update boyfriend data [${new Date().toLocaleString()}]`,
        content: contentEncoded,
        branch: GITHUB_CONFIG.branch
      };
      if (sha) body.sha = sha;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json"
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        console.log("[GitHub Sync] 成功同步最新 JSON 到 GitHub Repo！");
        toast("已自動更新至 GitHub 檔案");
      } else {
        const errJson = await res.json();
        console.error("[GitHub Sync] 同步失敗:", errJson);
      }
    } catch (err) {
      console.error("[GitHub Sync] 發生錯誤:", err);
    }
  }, 500);
}

// 開頁時優先從 GitHub 讀取最新的 JSON 檔案
async function loadFromGitHub() {
  if (!GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo) return;
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.filePath}?t=${Date.now()}`;
  try {
    const res = await fetch(rawUrl);
    if (res.ok) {
      const githubData = await res.json();
      data = githubData;
      localStorage.setItem(STORAGE, JSON.stringify(data));
      console.log("[GitHub Load] 已載入 GitHub 最新資料");
      render("dashboard");
    }
  } catch (e) {
    console.log("[GitHub Load] 使用本地 localStorage 資料");
  }
}

// Mirror all data to the Google Apps Script web app (localStorage stays the source of truth).
function syncToSheet(){
  if(!SHEET_URL) return;
  const payload = {
    type:"snapshot",
    syncedAt:new Date().toISOString(),
    boyfriend:data.boyfriend,
    score:data.score,
    threshold:data.threshold,
    achievements:data.achievements,
    review:data.review,
    events:data.events
  };
  fetch(SHEET_URL,{
    method:"POST",
    mode:"no-cors",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify(payload)
  }).then(()=>{
    _lastSync = new Date();
    console.log("[v0] sheet sync sent", payload.events.length, "events");
  }).catch(err=>console.log("[v0] sheet sync failed", err));
}

function escapeHtml(s=""){ return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function uid(){ return Date.now()+Math.floor(Math.random()*1000); }
function score(){
  return Math.max(0, Math.min(100, data.score));
}
function statusFor(s){
  if(s===0) return ["停牌","black"];
  if(s<=45) return ["資格審核","red"];
  if(s<=59) return ["關係告急","orange"];
  if(s<=79) return ["需要留意","yellow"];
  return ["表現良好","green"];
}
function statusHtml(){
  const [t,c]=statusFor(score());
  return `<span class="status ${c}">${c==="black"?"🛑":c==="red"?"🚨":c==="orange"?"🟠":c==="yellow"?"🟡":"🟢"} ${t}</span>`;
}
function toast(msg){ const el=document.getElementById("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2200); }
function openModal(html){ const m=document.getElementById("modal"); m.innerHTML=html; document.getElementById("modalBackdrop").classList.remove("hidden"); 
  m.classList.remove('animate-in');
  void m.offsetWidth;
  m.classList.add('animate-in');
}
function closeModal(){ const m=document.getElementById("modal"); m.classList.remove('animate-in'); document.getElementById("modalBackdrop").classList.add("hidden"); }
document.getElementById("modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal()});

function render(page="dashboard"){
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const titles={dashboard:"我的男朋友",record:"記錄一件事",history:"男友歷史紀錄",performance:"男友表現",settings:"設定"};
  document.getElementById("pageTitle").textContent=titles[page];
  const c=document.getElementById("appContent");
  if(page==="dashboard") c.innerHTML=dashboard();
  if(page==="record") c.innerHTML=recordPage();
  if(page==="history") c.innerHTML=historyPage();
  if(page==="performance") c.innerHTML=performancePage();
  if(page==="settings") c.innerHTML=settingsPage();
  bindPage();
}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>render(b.dataset.page)));
document.getElementById("settingsQuick").onclick=()=>render("settings");

function dashboard(){
  const bad=data.events.filter(e=>e.type==="bad"), good=data.events.filter(e=>e.type==="good");
  const habits={};bad.forEach(e=>habits[e.title]=(habits[e.title]||0)+1);
  const repeat=Object.entries(habits).filter(x=>x[1]>=3).length;
  const distance=Math.max(0,score()-data.threshold);
  const recent=[...data.events].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  return `
  <div class="card hero">
    <div>
      <div class="hero-title">💗 男朋友表現指數</div>
      <div class="score">${score()}<small> / 100</small></div>
      ${statusHtml()}
      <div class="progress"><div class="progress-bar" style="width:${score()}%"></div></div>
      <div class="progress-note">${score()>data.threshold?`再扣 ${distance} 分將進入資格審核。`:"已達資格審核門檻，請處理目前狀態。"}</div>
      <div class="threshold">⚠️ 資格審核門檻：<strong>${data.threshold} 分</strong> · 停牌：<strong>0 分</strong></div>
      <div class="actions">
        <button class="btn danger-outline" onclick="showRecord('bad')">😡 記錄嬲事</button>
        <button class="btn soft-outline" onclick="showRecord('good')">❤️ 記錄好事</button>
        ${score()<=data.threshold?`<button class="btn primary" onclick="reviewModal()">🚨 開始資格審核</button>`:""}
      </div>
    </div>
    <div>
      <div class="card" style="box-shadow:none">
        <div class="hero-title">❤️ 在一起</div>
        <div class="stat-value">${daysTogether()} <span style="font-size:14px;color:var(--muted)">日</span></div>
        <div class="muted" style="font-size:12px;margin-top:4px">${escapeHtml(data.boyfriend.name)} · ${escapeHtml(data.boyfriend.nickname)}</div>
      </div>
    </div>
  </div>

  <div class="grid grid-4" style="margin-top:18px">
    ${statCard("😡","嬲事",bad.length,"查看全部","render('history');filterHistory('bad')")}
    ${statCard("❤️","好事",good.length,"查看全部","render('history');filterHistory('good')")}
    ${statCard("🔥","慣犯",repeat,"查看慣犯","render('performance')")}
    ${statCard("🏆","成就",data.achievements.length,"查看成就","achievementsModal()")}
  </div>

  <div class="section-head"><h2>最近紀錄</h2><button class="btn" onclick="render('history')">查看全部</button></div>
  <div class="event-list">${recent.length?recent.map(eventRow).join(""):`<div class="empty">暫時未有紀錄。</div>`}</div>
  
  ${timelineHtml()}
  `;
}

function timelineHtml(){
  const cards = data.timeline || [];
  return `<div class="timeline-wrap"><div class="section-head"><h2>重要時間線</h2><div style="display:flex;gap:10px;align-items:center"><div class="muted">點擊卡片以查看詳情</div><button class="btn" onclick="manageTimeline()">管理時間線</button></div></div><div class="timeline">${cards.map((c,i)=>`<div class="timeline-card ${c.type||'positive'} " onclick="timelineClick(${i})" data-idx="${i}"><div class="t-date">${escapeHtml(c.date)}</div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.desc)}</p></div>`).join('')}</div></div>`;
}

function manageTimeline(){
  const cards = data.timeline || [];
  const list = cards.map((c,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><div><div style="font-weight:800">${escapeHtml(c.title)}</div><div class="muted" style="font-size:13px">${escapeHtml(c.date)}</div></div><div style="display:flex;gap:8px"><button class="btn" onclick="editTimeline(${i})">編輯</button><button class="btn danger" onclick="deleteTimeline(${i})">刪除</button></div></div>`).join('');
  openModal(`<div class="modal-head"><div><div class="eyebrow">管理</div><h2>管理時間線</h2></div><button class="close" onclick="closeModal()">×</button></div><div style="margin-top:12px">${list||'<div class="empty">暫時未有卡片。</div>'}<div style="margin-top:12px" class="actions"><button class="btn" onclick="addTimeline()">新增卡片</button><button class="btn" onclick="closeModal()">完成</button></div></div>`);
}

function editTimeline(i){
  const c = data.timeline[i];
  openModal(`<div class="modal-head"><div><div class="eyebrow">編輯</div><h2>編輯卡片</h2></div><button class="close" onclick="closeModal()">×</button></div>
  <div class="field"><label>標題</label><input id="ttitle" value="${escapeHtml(c.title)}"></div>
  <div class="field"><label>日期</label><input id="tdate" value="${escapeHtml(c.date)}"></div>
  <div class="field"><label>描述</label><textarea id="tdesc">${escapeHtml(c.desc)}</textarea></div>
  <div class="field"><label>類型</label><select id="ttype"><option value="positive" ${c.type==='positive'?'selected':''}>好事</option><option value="negative" ${c.type==='negative'?'selected':''}>嬲事</option></select></div>
  <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" onclick="saveTimelineEdits(${i})">保存</button></div>`);
}

function addTimeline(){
  openModal(`<div class="modal-head"><div><div class="eyebrow">新增</div><h2>新增卡片</h2></div><button class="close" onclick="closeModal()">×</button></div>
  <div class="field"><label>標題</label><input id="ttitle" value=""></div>
  <div class="field"><label>日期</label><input id="tdate" value=""></div>
  <div class="field"><label>描述</label><textarea id="tdesc"></textarea></div>
  <div class="field"><label>類型</label><select id="ttype"><option value="positive">好事</option><option value="negative">嬲事</option></select></div>
  <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" onclick="saveTimelineEdits(null)">新增</button></div>`);
}

function saveTimelineEdits(i){
  const title=document.getElementById('ttitle').value.trim();
  const date=document.getElementById('tdate').value.trim();
  const desc=document.getElementById('tdesc').value.trim();
  const type=document.getElementById('ttype').value;
  if(!title||!date){toast('請填寫標題同日期。');return}
  if(!data.timeline) data.timeline=[];
  if(i===null){data.timeline.push({title,date,desc,type});}
  else{data.timeline[i]={title,date,desc,type};}
  save(); closeModal(); render('dashboard'); toast('已儲存時間線。');
}

function deleteTimeline(i){
  if(!confirm('確定刪除呢張卡片？')) return;
  data.timeline.splice(i,1); save(); closeModal(); render('dashboard'); toast('已刪除。');
}

function timelineClick(i){
  const cards = document.querySelectorAll('.timeline-card');
  cards.forEach(c=>c.classList.remove('active'));
  const el = document.querySelector(`.timeline-card[data-idx="${i}"]`);
  if(!el) return;
  el.classList.add('active');
  setTimeout(()=>{
    const title = el.querySelector('h3').textContent;
    const date = el.querySelector('.t-date').textContent;
    const desc = el.querySelector('p').textContent;
    openModal(`<div class="modal-head"><div><div class="eyebrow">時間線事件</div><h2>${escapeHtml(title)}</h2><div class="muted">${escapeHtml(date)}</div></div><button class="close" onclick="closeModal()">×</button></div><div style="margin-top:12px"><p>${escapeHtml(desc)}</p><div class="actions" style="margin-top:18px"><button class="btn" onclick="closeModal()">關閉</button></div></div>`);
  },220);
}

function statCard(icon,label,value,link,handler){
  return `<div class="card stat-card"><div class="stat-icon">${icon}</div><div class="stat-label">${label}</div><div class="stat-value">${value}</div><button class="btn" style="padding:0;border:0;background:none;color:var(--accent);font-size:12px" onclick="${handler}">${link} →</button></div>`;
}

function eventRow(e){
  return `<div class="event ${e.type==="bad"?"negative":"positive"}"><div class="event-icon">${e.type==="bad"?"😡":"❤️"}</div><div class="event-main"><div class="event-title">${escapeHtml(e.title)}</div><div class="event-meta">${escapeHtml(e.category)} · ${e.date}${e.remedyStatus==="pending"?" · ⏳ 補救中":e.remedyStatus==="done"?" · ✅ 已補救":""}</div></div><div class="points ${e.type==="bad"?"negative":"positive"}">${e.points>0?"+":""}${e.points}</div><button class="btn" onclick="eventDetail(${e.id})">查看</button></div>`;
}

function daysTogether(){
  const d=new Date(data.boyfriend.startDate), n=new Date(); return Math.max(0,Math.floor((n-d)/86400000));
}

function recordPage(){
 return `<div class="grid grid-2">
     <div class="card">
     <h2 style="margin-top:0">😡 記錄嬲事</h2><p class="muted">將今次事件正式記錄在案。</p>
     <button class="btn danger-outline" onclick="showRecord('bad')">開始記錄嬲事</button>
   </div>
   <div class="card">
     <h2 style="margin-top:0">❤️ 記錄好事</h2><p class="muted">值得嘉許嘅表現都應該留低。</p>
    <button class="btn soft-outline" onclick="showRecord('good')">開始記錄好事</button>
   </div>
 </div>
 <div class="card" style="margin-top:18px">
   <h3 style="margin-top:0">目前狀態</h3>${statusHtml()}<p class="muted" style="margin-bottom:0">目前 ${score()} 分，${score()>data.threshold?`距離資格審核仲有 ${score()-data.threshold} 分空間。`:"已進入資格審核範圍。"}</p>
 </div>`;
}

function showRecord(type){
 const bad=type==="bad";
 let severity=[["只係有啲唔gur",-2,"🙂"],["有啲嬲",-5,"😐"],["幾嬲吓",-10,"😤"],["真係嬲",-15,"😡"],["巨嬲",-20,"🤬"]];
 let good=[["幾好",2,"🙂"],["好貼心",5,"😊"],["非常貼心",10,"🥰"],["今日最佳",15,"👑"],["神級男友",20,"💎"]];
 const levels=bad?severity:good;
 const cats=bad?data.settings.categories:["體貼","送禮","陪食飯","陪伴","關心","幫手","特別安排","其他"];
 const today=new Date().toISOString().slice(0,10);
 openModal(`<div class="modal-head"><div><div class="eyebrow">${bad?"NEGATIVE EVENT":"POSITIVE EVENT"}</div><h2>${bad?"😡 記錄嬲事":"❤️ 記錄好事"}</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="field"><label>事件日期</label><input type="date" id="fdate" value="${today}"></div>
 <div class="field"><label>事件類別</label><select id="fcat">${cats.map(x=>`<option>${x}</option>`).join("")}</select></div>
 <div class="field"><label>${bad?"發生咗咩事？":"佢做咗咩值得記低？"}</label><textarea id="fdesc" placeholder="${bad?"例如：明明話 7 點到，結果 7:40 先出現…":"例如：返工之前主動買咗我鍾意嘅咖啡。"}"></textarea></div>
 <div class="field"><label>${bad?"今日有幾嬲？":"今次有幾值得嘉許？"}</label><div class="choice-grid">${levels.map((x,i)=>`<button class="choice ${i===1?"selected":""}" data-level="${i}" onclick="selectLevel(this)"><span>${x[2]}</span><strong>${x[0]}</strong><span>${x[1]>0?"+":""}${x[1]} 分</span></button>`).join("")}</div></div>
 ${bad?`<div class="field"><label>要唔要佢補救？</label><select id="fremedy"><option value="">唔使，記低就算</option><option>認真道歉</option><option>請我食飯</option><option>買花／買禮物</option><option>陪我</option><option>改善行為</option><option>自訂補救方案</option></select></div>`:""}
 <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn ${bad?"danger":"primary"}" onclick="submitEvent('${type}')">正式記錄</button></div>`);
 window._levels=levels;
}

function selectLevel(el){document.querySelectorAll(".choice").forEach(x=>x.classList.remove("selected"));el.classList.add("selected");}

function submitEvent(type){
 const level=[...document.querySelectorAll(".choice")].findIndex(x=>x.classList.contains("selected"));
 const desc=document.getElementById("fdesc").value.trim();
 if(!desc){toast("請先寫低發生咗咩事。");return}
 const date=document.getElementById("fdate").value;
 if(!date){toast("請選擇事件日期。");return}
 const lv=window._levels[level<0?0:level];
 const e={id:uid(),type,category:document.getElementById("fcat").value,title:desc.length>18?desc.slice(0,18)+"…":desc,description:desc,points:lv[1],severity:lv[0],date,remedy:type==="bad"?(document.getElementById("fremedy").value||null):null,remedyStatus:type==="bad"&&document.getElementById("fremedy").value?"pending":null,reply:null};
 data.events.push(e); data.score=Math.max(0,Math.min(100,data.score+e.points));
 save(); closeModal(); toast(type==="bad"?"已正式記錄在案。":"❤️ 已記錄呢份好表現。");
 if(data.score<=data.threshold) setTimeout(()=>reviewModal(),400);
 render("dashboard");
}

function historyPage(){
 const sorted=[...data.events].sort((a,b)=>b.date.localeCompare(a.date));
 return `<div class="card">
   <div class="section-head" style="margin-top:0"><h2>全部紀錄</h2><div class="actions" style="margin:0"><button class="btn" onclick="filterHistory('all')">全部</button><button class="btn" onclick="filterHistory('bad')">😡 嬲事</button><button class="btn" onclick="filterHistory('good')">❤️ 好事</button></div></div>
   <div id="historyList" class="event-list">${sorted.map(eventRow).join("")||`<div class="empty">暫時未有紀錄。</div>`}</div>
 </div>`;
}

function filterHistory(type){
 const list=document.getElementById("historyList");let es=[...data.events];if(type!=="all")es=es.filter(e=>e.type===type);es.sort((a,b)=>b.date.localeCompare(a.date));list.innerHTML=es.map(eventRow).join("")||`<div class="empty">沒有符合條件嘅紀錄。</div>`;
}

function eventDetail(id){
 const e=data.events.find(x=>x.id===id);if(!e)return;
 openModal(`<div class="modal-head"><div><div class="eyebrow">EVENT ${e.id}</div><h2>${e.type==="bad"?"😡":"❤️"} ${escapeHtml(e.title)}</h2><div class="muted">${e.date}</div></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="notice"><strong>${escapeHtml(e.category)}</strong> · ${e.points>0?"+":""}${e.points} 分</div>
 <div class="field"><label>事件內容</label><p>${escapeHtml(e.description)}</p></div>
 ${e.severity?`<div class="field"><label>情緒程度</label><span class="badge">${escapeHtml(e.severity)}</span></div>`:""}
 ${e.remedy?`<div class="field"><label>補救方案</label><p>${escapeHtml(e.remedy)}</p><p>${e.remedyStatus==="done"?'<span class="success-box">✅ 已完成補救</span>':'<span class="warning">⏳ 尚未完成補救</span>'}</p></div>`:""}
 ${e.reply?`<div class="field"><label>男朋友回條</label><div class="notice">回應：${escapeHtml(e.reply.text||"")}<br>處理結果：${e.reply.decision==="accepted"?"❤️ 已接受補救":e.reply.decision==="rejected"?"🚨 回條被拒":"⏳ 回條待審核"}</div></div>`:""}
 <div class="actions">
 ${e.type==="bad"&&!e.reply?`<button class="btn primary" onclick="replyModal(${e.id})">📄 查看／填寫回條</button>`:""}
 ${e.reply&&e.reply.decision==="pending"?`<button class="btn primary" onclick="replyReviewModal(${e.id})">📝 審核回條</button>`:""}
 ${e.remedyStatus==="pending"?`<button class="btn success" onclick="completeRemedy(${e.id})">✅ 標記已補救</button>`:""}
 <button class="btn" onclick="editEvent(${e.id})">編輯</button>
 <button class="btn danger" onclick="deleteEvent(${e.id})">刪除</button>
 </div>`);
}

function completeRemedy(id){const e=data.events.find(x=>x.id===id);e.remedyStatus="done";save();closeModal();toast("補救已完成。");render("history");}
function deleteEvent(id){if(!confirm("確定要刪除呢項紀錄？"))return;const i=data.events.findIndex(x=>x.id===id);if(i<0)return;const e=data.events[i];data.score=Math.max(0,Math.min(100,data.score-e.points));data.events.splice(i,1);save();closeModal();toast("紀錄已刪除。");render("history");}

function editEvent(id){
 const e=data.events.find(x=>x.id===id);if(!e)return;
 const bad=e.type==="bad";
 let severity=[["只係有啲唔gur",-2,"🙂"],["有啲嬲",-5,"😐"],["幾嬲吓",-10,"😤"],["真係嬲",-15,"😡"],["巨嬲",-20,"🤬"]];
 let good=[["幾好",2,"🙂"],["好貼心",5,"😊"],["非常貼心",10,"🥰"],["今日最佳",15,"👑"],["神級男友",20,"💎"]];
 const levels=bad?severity:good;
 const cats=bad?data.settings.categories:["體貼","送禮","陪食飯","陪伴","關心","幫手","特別安排","其他"];
 const selectedLevel=levels.findIndex(x=>x[0]===e.severity);
 const remedyOptions=bad?['','認真道歉','請我食飯','買花／買禮物','陪我','改善行為','自訂補救方案']:[];
 const remedySelect=bad?`<div class="field"><label>要唔要佢補救？</label><select id="fremedy">${remedyOptions.map(opt=>`<option value="${opt}"${opt===e.remedy?' selected':''}>${opt||'唔使，記低就算'}</option>`).join("")}</select></div>`:"";
 openModal(`<div class="modal-head"><div><div class="eyebrow">${bad?"EDIT NEGATIVE EVENT":"EDIT POSITIVE EVENT"}</div><h2>${bad?"😡 編輯嬲事":"❤️ 編輯好事"}</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="field"><label>事件日期</label><input type="date" id="fdate" value="${e.date}"></div>
 <div class="field"><label>事件類別</label><select id="fcat">${cats.map(x=>`<option${x===e.category?' selected':''}>${x}</option>`).join("")}</select></div>
 <div class="field"><label>${bad?"發生咗咩事？":"佢做咗咩值得記低？"}</label><textarea id="fdesc" placeholder="${bad?"例如：明明話 7 點到，結果 7:40 先出現…":"例如：返工之前主動買咗我鍾意嘅咖啡。"}">${escapeHtml(e.description)}</textarea></div>
 <div class="field"><label>${bad?"今日有幾嬲？":"今次有幾值得嘉許？"}</label><div class="choice-grid">${levels.map((x,i)=>`<button class="choice ${i===selectedLevel?"selected":""}" data-level="${i}" onclick="selectLevel(this)"><span>${x[2]}</span><strong>${x[0]}</strong><span>${x[1]>0?"+":""}${x[1]} 分</span></button>`).join("")}</div></div>
 ${remedySelect}
 <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn ${bad?"danger":"primary"}" onclick="saveEventEdits(${id})">儲存變更</button></div>`);
 window._levels=levels;
}

function saveEventEdits(id){
 const e=data.events.find(x=>x.id===id);if(!e)return;
 const level=[...document.querySelectorAll(".choice")].findIndex(x=>x.classList.contains("selected"));
 const desc=document.getElementById("fdesc").value.trim();
 const date=document.getElementById("fdate").value;
 if(!desc){toast("請先寫低發生咗嘅內容。");return}
 if(!date){toast("請選擇事件日期。");return}
 const lv=window._levels[level<0?0:level];
 const oldPoints=e.points;
 e.date=date;
 e.category=document.getElementById("fcat").value;
 e.description=desc;
 e.title=desc.length>18?desc.slice(0,18)+"…":desc;
 e.points=lv[1];
 e.severity=lv[0];
 if(e.type==="bad"){
   const remedy=document.getElementById("fremedy").value||null;
   if(!remedy){e.remedy=null;e.remedyStatus=null;} else {
     if(e.remedy!==remedy){e.remedyStatus="pending";} e.remedy=remedy;
   }
 }
 data.score=Math.max(0,Math.min(100,data.score-oldPoints+e.points));
 save();closeModal();toast("紀錄已更新。");render("history");
}

function replyModal(id){
 const e=data.events.find(x=>x.id===id);
 openModal(`<div class="modal-head"><div><div class="eyebrow">BOYFRIEND REPLY</div><h2>📄 男友事件回條</h2><div class="muted">${escapeHtml(e.title)}</div></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="field"><label>本人確認已閱讀上述事件紀錄。</label><div class="check-grid">
 <button class="check" data-reply="承認事件" onclick="selectReply(this)">😔 我承認</button>
 <button class="check" data-reply="部分承認" onclick="selectReply(this)">🫣 我承認部分內容</button>
 <button class="check" data-reply="不同意" onclick="selectReply(this)">🤨 我不同意</button>
 </div></div>
 <div class="field"><label>男朋友解釋／回應</label><textarea id="replyText" placeholder="你有咩想解釋？"></textarea></div>
 <div class="field"><label>補救方案</label><select id="replyRemedy"><option>認真道歉</option><option>請我食飯</option><option>買花／買禮物</option><option>陪我</option><option>改善行為</option><option>其他</option></select></div>
 <div class="field"><label>預計完成日期</label><input type="date" id="replyDate"></div>
 <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" onclick="submitReply(${id})">提交回條</button></div>`);
}

function selectReply(el){document.querySelectorAll(".check").forEach(x=>x.classList.remove("selected"));el.classList.add("selected");}

function submitReply(id){
 const e=data.events.find(x=>x.id===id), selected=document.querySelector(".check.selected");
 if(!selected){toast("請先選擇回應方式。");return}
 e.reply={decision:"pending",ack:selected.dataset.reply,text:document.getElementById("replyText").value.trim(),remedy:document.getElementById("replyRemedy").value,due:document.getElementById("replyDate").value,createdAt:new Date().toISOString()};
 e.remedy=e.reply.remedy;e.remedyStatus="pending";save();closeModal();toast("回條已提交，等待女朋友手動審核。");
}

function replyReviewModal(id){
 const e=data.events.find(x=>x.id===id);
 openModal(`<div class="modal-head"><div><div class="eyebrow">REVIEW</div><h2>👩‍⚖️ 審核男友回條</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="notice"><strong>${escapeHtml(e.reply.ack)}</strong><br>${escapeHtml(e.reply.text||"未填寫解釋")}</div>
 <p class="muted">補救方案：${escapeHtml(e.reply.remedy)}${e.reply.due?" · "+e.reply.due:""}</p>
 <div class="actions"><button class="btn success" onclick="acceptReply(${id})">❤️ 接受補救</button><button class="btn danger" onclick="rejectReply(${id})">🚨 拒絕回條</button></div>`);
}

function acceptReply(id){
 const e=data.events.find(x=>x.id===id);e.reply.decision="accepted";e.remedyStatus="done";
 const bonus=Math.min(3,100-data.score);data.score+=bonus;save();closeModal();toast(`補救接受，返還 ${bonus} 分。`);render("history");
}

function rejectReply(id){
 const e=data.events.find(x=>x.id===id);e.reply.decision="rejected";e.remedyStatus="pending";data.score=Math.max(0,data.score-5);save();closeModal();toast("回條被拒，追加扣 5 分。");render("history");
}

function performancePage(){
 const bad=data.events.filter(e=>e.type==="bad"), good=data.events.filter(e=>e.type==="good");
 const badCats={}, goodCats={};
 data.events.forEach(e=>{
   if(e.type==="bad") badCats[e.category]=(badCats[e.category]||0)+1;
   else goodCats[e.category]=(goodCats[e.category]||0)+1;
 });
 const topBad=Object.entries(badCats).sort((a,b)=>b[1]-a[1]).slice(0,6), maxBad=topBad[0]?.[1]||1;
 const topGood=Object.entries(goodCats).sort((a,b)=>b[1]-a[1]).slice(0,6), maxGood=topGood[0]?.[1]||1;
 const windowInfo=getMonthlyReviewWindow();
 return `<div class="grid grid-3">
   <div class="card"><div class="hero-title">目前指數</div><div class="stat-value">${score()}<small>/100</small></div>${statusHtml()}</div>
   <div class="card"><div class="hero-title">本月嬲事</div><div class="stat-value">${bad.length}</div><div class="muted">負面紀錄</div></div>
   <div class="card"><div class="hero-title">本月好事</div><div class="stat-value">${good.length}</div><div class="muted">正面紀錄</div></div>
 </div>
 <div class="card" style="margin-top:18px"><h2 style="margin-top:0">📅 每月回顧</h2><div class="muted">${windowInfo.reportLabel}</div><div class="notice" style="margin-top:12px">${windowInfo.available?`限定發送期間：${windowInfo.windowLabel}（僅限 7 日）`:`本功能於每月 1-7 日開放。下次可發送日期：${windowInfo.nextWindowLabel}`}</div>${windowInfo.available?`<div class="actions" style="margin-top:14px"><button class="btn primary" onclick="sendMonthlyReport()">發送本月回顧</button></div>`:""}</div>
 <div class="grid grid-2" style="margin-top:18px">
  <div class="card"><h2 style="margin-top:0">📊 負面類別分析</h2>${topBad.map(x=>`<div class="bar-row"><span>${escapeHtml(x[0])}</span><div class="bar"><i style="width:${x[1]/maxBad*100}%"></i></div><strong>${x[1]}</strong></div>`).join("")||'<div class="empty">暫時未有資料。</div>'}</div>
  <div class="card"><h2 style="margin-top:0">📊 正面類別分析</h2>${topGood.map(x=>`<div class="bar-row"><span>${escapeHtml(x[0])}</span><div class="bar"><i style="width:${x[1]/maxGood*100}%"></i></div><strong>${x[1]}</strong></div>`).join("")||'<div class="empty">暫時未有資料。</div>'}</div>
 </div>
 <div class="card" style="margin-top:18px"><h2 style="margin-top:0">🏆 男友 GPA</h2><div class="score" style="font-size:54px">${gpa()}<small> / 4.00</small></div><p class="muted">根據目前正負面事件比例估算。</p><button class="btn" onclick="monthlyReport()">生成男友表現報告</button></div>
 <div class="card" style="margin-top:18px"><h2 style="margin-top:0">🏆 成就</h2><div class="check-grid">${achievementList().map(a=>`<div class="check selected">${a.icon} <strong>${a.name}</strong><br><span class="muted">${a.desc}</span></div>`).join("")}</div></div>`;
}

function getMonthlyReviewWindow(){
 const now=new Date();
 const day=now.getDate();
 const prevMonth=new Date(now.getFullYear(), now.getMonth()-1, 1);
 const nextMonth=new Date(now.getFullYear(), now.getMonth()+1, 1);
 const label=`${prevMonth.getFullYear()} 年 ${prevMonth.getMonth()+1} 月`;
 const currentWindowLabel=`${now.getFullYear()} / ${now.getMonth()+1} 1-7`;
 const nextWindowLabel=`${nextMonth.getFullYear()} / ${nextMonth.getMonth()+1} 1-7`;
 return {
   available: day>=1 && day<=7,
   reportLabel:`上個月回顧：${label}`,
   windowLabel:currentWindowLabel,
   nextWindowLabel:nextWindowLabel,
   monthLabel: label,
   reportMonth: prevMonth
 };
}

function sendMonthlyReport(){
 const info=getMonthlyReviewWindow();
 if(!info.available){toast(`本功能僅於每月 1-7 日開放。下次可發送日期：${info.nextWindowLabel}`);return;}
 openModal(`<div class="modal-head"><div><div class="eyebrow">SEND MONTHLY REVIEW</div><h2>📤 發送 ${escapeHtml(info.monthLabel)} 回顧</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="notice">此功能僅於每月 1-7 日開放。請確認是否發送上個月回顧。</div>
 <div class="actions"><button class="btn" onclick="closeModal()">取消</button><button class="btn primary" onclick="confirmSendMonthlyReport()">確定發送</button></div>`);
}

function confirmSendMonthlyReport(){
 closeModal();
 toast("已發送本月回顧。限定期間內的發送已完成。");
}

function gpa(){
 if(data.events.length===0) return "4.00";
 return (score() / 100 * 4).toFixed(2);
}

function achievementList(){
 const bad=data.events.filter(e=>e.type==="bad"), good=data.events.filter(e=>e.type==="good");
 const now=new Date();
 const monthEvents=data.events.filter(e=>{
   const d=new Date(e.date);
   return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
 });
 const monthGood=monthEvents.filter(e=>e.type==="good");
 const monthBad=monthEvents.filter(e=>e.type==="bad");
 const monthBadCounts={};
 monthBad.forEach(e=>monthBadCounts[e.title]=(monthBadCounts[e.title]||0)+1);
 const monthRescueDone=monthBad.filter(e=>e.remedyStatus==="done").length;
 const monthRepairAccepted=monthBad.some(e=>e.reply?.decision==="accepted");
 const monthBestCount=monthGood.filter(e=>e.points>=15).length;
 const allTimeLegendCount=good.filter(e=>e.points>=20).length;
 const severeAllTimeCount = data.events.filter(e=>e.type==="bad" && (e.severity==="真係嬲" || e.severity==="巨嬲")).length;
 return [
  {icon:"❤️",name:"好男人",desc:monthGood.length>=10?"已解鎖：本月好事多於 10 次":`本月好事 ${monthGood.length}/10 次`},
  {icon:"🎯",name:"Boyfriend material",desc:monthBestCount>=10?"已解鎖：本月最佳多於 15 次":`本月最佳 ${monthBestCount}/15 次`},
  {icon:"🔥",name:"慣犯",desc:Object.values(monthBadCounts).some(x=>x>=3)?"已解鎖：本月同一問題多於 3 次":`本月同一問題 ${Math.max(...Object.values(monthBadCounts),0)}/3 次`},
  {icon:"🧯",name:"成功救火",desc:monthRescueDone>=5?"已解鎖：本月完成補救多於 5 次":`本月完成補救 ${monthRescueDone}/5 次`},
  {icon:"👑",name:"本月最佳男友",desc:monthGood.length>monthBad.length?"已解鎖：本月好事多過嬲事":"本月好事少於或等於嬲事"},
  {icon:"💍",name:"Husband material",desc:allTimeLegendCount>=50?"已解鎖：神級男友 50/50":`神級男友 ${allTimeLegendCount}/50 次`},
  {icon:"💀",name:"黑歷史",desc:severeAllTimeCount>=50?"已解鎖：黑歷史 50/50":`真係嬲+巨嬲 ${severeAllTimeCount}/50`},
  {icon:"☠️",name:"終極黑歷史",desc:severeAllTimeCount>=101?"已解鎖：終極黑歷史 101/101":`真係嬲+巨嬲 ${severeAllTimeCount}/101`},
  {icon:"🕊️",name:"關係修復師",desc:monthRepairAccepted?"已解鎖：本月成功接受補救":"本月尚未有成功補救"}
 ];
}

function achievementsModal(){openModal(`<div class="modal-head"><div><h2>🏆 成就</h2></div><button class="close" onclick="closeModal()">×</button></div><div class="check-grid">${achievementList().map(a=>`<div class="check selected">${a.icon} <strong>${a.name}</strong><br><span class="muted">${a.desc}</span></div>`).join("")}</div>`)}

function monthlyReport(){
 const bad=data.events.filter(e=>e.type==="bad"),good=data.events.filter(e=>e.type==="good");
 openModal(`<div class="modal-head"><div><div class="eyebrow">BOYFRIEND REPORT</div><h2>📄 男友表現報告</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="card" style="box-shadow:none;background:#f8f2eb"><h3>2026 年 8 月</h3><div class="grid grid-2"><div>😡 嬲事 <strong>${bad.length}</strong></div><div>❤️ 好事 <strong>${good.length}</strong></div><div>📉 負面分數 <strong>${bad.reduce((a,e)=>a+e.points,0)}</strong></div><div>📈 正面分數 <strong>+${good.reduce((a,e)=>a+e.points,0)}</strong></div></div><hr><strong>目前指數：${score()} / 100</strong><br>${statusHtml()}</div>
 <p class="muted">報告可以作為日後 PDF／分享功能嘅基礎。</p><div class="actions"><button class="btn primary" onclick="saveReportPdf()">保存為 PDF</button><button class="btn" onclick="closeModal()">完成</button></div>`);
}

function reviewModal(){
 openModal(`<div class="modal-head"><div><div class="eyebrow">QUALIFICATION REVIEW</div><h2>🚨 男友資格覆核</h2></div><button class="close" onclick="closeModal()">×</button></div>
 <div class="warning">目前 ${score()} 分，已達 ${data.threshold} 分覆核門檻。</div>
 <div class="field"><label>近期狀況</label><p>${data.events.filter(e=>e.type==="bad").length} 件嬲事 · ${data.events.filter(e=>e.type==="good").length} 件好事</p></div>
 <div class="actions"><button class="btn success" onclick="reviewDecision('pass')">❤️ 通過覆核</button><button class="btn primary" onclick="reviewDecision('improve')">📝 進入整改期</button><button class="btn" onclick="reviewDecision('cool')">🧊 進入冷靜期</button></div>`);
}

function reviewDecision(type){
 data.review={type,date:new Date().toISOString()};save();closeModal();
 const msg={pass:"覆核通過。男友資格暫時保留。",improve:"已進入男友整改期。",cool:"已進入冷靜期。"}[type];toast(msg);render("dashboard");
}

function settingsPage(){
 const savedToken = localStorage.getItem("bf-gh-token") || "";
 return `<div class="grid grid-2">
 <div class="card"><h2 style="margin-top:0">👨 男友資料</h2>
  <div class="field"><label>名字</label><input id="sname" value="${escapeHtml(data.boyfriend.name)}"></div>
  <div class="field"><label>暱稱</label><input id="snick" value="${escapeHtml(data.boyfriend.nickname)}"></div>
  <div class="field"><label>開始拍拖日期</label><input type="date" id="sdate" value="${data.boyfriend.startDate}"></div>
  <button class="btn filled primary" onclick="saveSettings()">儲存資料</button>
 </div>
 <div class="card"><h2 style="margin-top:0">⚖️ 分數設定</h2>
  <div class="field"><label>資格審核門檻</label><input type="number" id="sth" value="${data.threshold}" min="1" max="99"></div>
  <p class="muted">100 分為滿分；0 分為停牌。到達或低於門檻即觸發資格審核。</p>
  <button class="btn filled primary" onclick="saveSettings()">儲存設定</button>
 </div>
 </div>
 <div class="card" style="margin-top:18px"><h2 style="margin-top:0">🔗 GitHub 自動同步設定</h2>
  <div class="field"><label>GitHub Personal Access Token (PAT)</label><input type="password" id="sghtoken" value="${escapeHtml(savedToken)}" placeholder="ghp_xxxxxxxxxxxxxx"></div>
  <p class="muted">填寫後每次修改都會自動 Commit 並 Push 到 GitHub Repo 內的 <code>${GITHUB_CONFIG.filePath}</code> 檔案。</p>
  <button class="btn filled primary" onclick="saveGitHubToken()">儲存 Token 並立即同步</button>
 </div>
 <div class="card" style="margin-top:18px"><h2 style="margin-top:0">💾 資料管理</h2><div class="actions"><button class="btn" onclick="exportData()">匯出 JSON</button><label class="btn">匯入 JSON<input type="file" accept=".json" onchange="importData(event)" style="display:none"></label><button class="btn filled danger" onclick="resetData()">清除所有資料</button></div><div class="footer-note">資料會儲存喺瀏覽器 localStorage，並自動同步至 GitHub。</div></div>`;
}

function saveSettings(){
  data.boyfriend.name=document.getElementById("sname").value||"男朋友";
  data.boyfriend.nickname=document.getElementById("snick").value||"BF";
  data.boyfriend.startDate=document.getElementById("sdate").value||data.boyfriend.startDate;
  data.threshold=Math.max(1,Math.min(99,Number(document.getElementById("sth").value)||45));
  save();
  toast("設定已儲存。");
  render("dashboard");
}

function saveGitHubToken(){
  const token = document.getElementById("sghtoken").value.trim();
  if (token) {
    localStorage.setItem("bf-gh-token", token);
    toast("GitHub Token 已儲存！正在同步...");
    syncToGitHub();
  } else {
    localStorage.removeItem("bf-gh-token");
    toast("已清除 GitHub Token");
  }
}

function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="boyfriend-office-backup.json";a.click();URL.revokeObjectURL(a.href);}
function importData(ev){const f=ev.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{data=JSON.parse(r.result);save();toast("資料已匯入。");render("dashboard");}catch(e){toast("JSON 格式不正確。")}};r.readAsText(f);}
function resetData(){if(!confirm("確定要清除所有資料並回復示範資料？"))return;data=structuredClone(seed);save();toast("資料已重設。");render("dashboard");}

function saveReportPdf(){
 const reportContent=document.getElementById("modal").innerHTML;
 const printWindow=window.open("","_blank","width=900,height=700");
 if(!printWindow) {toast("無法開啟列印視窗。請允許彈出視窗。");return;}
 const html=`<!doctype html><html><head><meta charset="UTF-8"><title>男友表現報告</title><style>
 body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:24px;}
 .card{border:1px solid #ddd;border-radius:16px;padding:20px;margin-bottom:20px;}
 .modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px;}
 .modal-head .eyebrow{font-size:12px;letter-spacing:1px;color:#666;text-transform:uppercase;margin-bottom:6px;}
 .modal-head h2{margin:0;font-size:24px;}
 .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
 .grid div{padding:12px;background:#f7f7f7;border-radius:12px;}
 hr{border:none;border-top:1px solid #ddd;margin:18px 0;}
 strong{display:block;margin-top:12px;font-size:16px;}
 </style></head><body>${reportContent}</body></html>`;
 printWindow.document.write(html);
 printWindow.document.close();
 printWindow.focus();
 setTimeout(()=>printWindow.print(),100);
}

function bindPage(){
 document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>render(b.dataset.go));
}

// 頁面初始化：先從 GitHub 載入最新 JSON，再渲染頁面
loadFromGitHub().finally(() => {
  render("dashboard");
});
