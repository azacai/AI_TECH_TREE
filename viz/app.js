/* app.js —— 布局 + 交互逻辑（数据由 boot 注入：发布态为内嵌 TREE_DATA，开发态 fetch enriched JSON）
   布局原则：主干 = 横向子树带；横轴 = 全局依赖深度（所有依赖边严格从左到右） */
function main(DATA, BUILD){
const CFG = window.VIZCFG;
const NW=CFG.NW, NH=CFG.NH, VG=CFG.VG, ROW=NH+VG, LEVEL_W=CFG.LEVEL_W, BAND_PAD=CFG.BAND_PAD, HDR=CFG.HDR, TOP=CFG.TOP, LX=CFG.LX;
const COLOR = CFG.COLOR;
const TR = DATA.trunks;
const TORDER = TR.map(t=>t.id);
const TINFO = {}; TR.forEach(t=>TINFO[t.id]=t);
const NODES = DATA.nodes;
const BY = {}; NODES.forEach(n=>BY[n.id]=n);
function groupsOf(n){return (n.prereqs||[]).map(p=>[p]).concat(n.prereqsAny||[]);}
const KIDS = {}; NODES.forEach(n=>groupsOf(n).forEach(g=>g.forEach(p=>{(KIDS[p]=KIDS[p]||[]).push(n.id);})));
const lit = new Set();
let constraint = false;
const DOM = DATA.constraintMode;

/* ================= 布局：横轴 = 全局深度；y 轴 = 主干内 tidy-tree ================= */
/* 主父亲 = 同主干内全局深度最大的前置（用于 y 轴子树排布）；x = 全局深度，保证子恒在父右侧 */
const primaryP={};
NODES.slice().sort((a,b)=>a.depth-b.depth).forEach(n=>{
 let best=null; groupsOf(n).forEach(g=>g.forEach(p=>{if(BY[p].trunk===n.trunk&&(!best||BY[p].depth>BY[best].depth))best=p;}));
 primaryP[n.id]=best;
});
const kidsP={}; NODES.forEach(n=>{const p=primaryP[n.id];if(p){(kidsP[p]=kidsP[p]||[]).push(n.id);}});
function layoutTrunk(t){
 let cursor=0; const y={};
 function place(id){const ks=(kidsP[id]||[]).slice().sort();
  if(!ks.length){y[id]=cursor;cursor+=1;return y[id];}
  const ys=ks.map(place);y[id]=(ys[0]+ys[ys.length-1])/2;return y[id];}
 NODES.filter(n=>n.trunk===t&&primaryP[n.id]===null).map(n=>n.id).sort().forEach(place);
 return {y:y,count:cursor};
}
const MAXD=Math.max(...NODES.map(n=>n.depth));
const BANDS={}; let by=TOP; const POS={};
TORDER.forEach(t=>{
 const L=layoutTrunk(t);
 const h=HDR+L.count*ROW+BAND_PAD;
 const ds=NODES.filter(n=>n.trunk===t).map(n=>n.depth);
 BANDS[t]={y:by,h:h,count:L.count,dmin:Math.min(...ds),dmax:Math.max(...ds)};
 NODES.filter(n=>n.trunk===t).forEach(n=>{POS[n.id]={x:LX+n.depth*LEVEL_W,y:by+HDR+L.y[n.id]*ROW};});
 by+=h;
});
const W=LX+(MAXD+1)*LEVEL_W+40, H=by+30;

/* ================= SVG 绘制 ================= */
const svg=document.getElementById("tree"), world=document.getElementById("world");
const NS="http://www.w3.org/2000/svg";
function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);(parent||world).appendChild(e);return e;}
/* 主干带背景 */
TORDER.forEach(t=>{
 const b=BANDS[t],c=COLOR[t];
 el("rect",{x:12,y:b.y,width:W-24,height:b.h,rx:14,class:"bandbg"});
 el("line",{x1:12,y1:b.y+2,x2:12,y2:b.y+b.h-2,class:"bandaccent",stroke:c});
});
/* 全局深度标尺 + 纵向栅格 */
for(let d=0;d<=MAXD;d++){
 el("line",{x1:LX+d*LEVEL_W-10,y1:TOP-8,x2:LX+d*LEVEL_W-10,y2:H-16,class:"grid"});
 const lt=el("text",{x:LX+d*LEVEL_W+NW/2,y:TOP-18,"text-anchor":"middle",class:"dlab"});
 lt.textContent="深度"+d;
}
/* 主干带表头 */
TORDER.forEach(t=>{
 const b=BANDS[t],c=COLOR[t];
 const g=el("g",{transform:"translate("+(LX-58)+","+(b.y+10)+")"});
 el("rect",{x:0,y:0,width:44,height:36,rx:8,fill:c,opacity:.16,stroke:c,"stroke-width":1.2},g);
 const tt=el("text",{x:22,y:24,"text-anchor":"middle",fill:c,style:"font-size:17px;font-weight:800"},g);tt.textContent=t;
 const t1=el("text",{x:54,y:16,class:"btitle"},g);t1.textContent=TINFO[t].name;
 const t2=el("text",{x:54,y:32,class:"bq"},g);t2.textContent=TINFO[t].question;
 const t3=el("text",{x:W-120,y:16,class:"bmeta","text-anchor":"end",fill:c},g);
 t3.textContent=(TINFO[t].type==="后发型"?"后发型主干（入口前置跨主干）":"常规主干")+" · "+NODES.filter(n=>n.trunk===t).length+" 节点 · 全局深度 "+BANDS[t].dmin+"~"+BANDS[t].dmax;
});
/* 依赖边：primary（主干内主父子）加粗着色，其余弱化 */
const edgeEls=[];
NODES.forEach(n=>{
 const seen=new Set();
 groupsOf(n).forEach(g=>g.forEach(p=>{
  if(seen.has(p))return; seen.add(p);
  const isPri=(primaryP[n.id]===p);
  const a=POS[p],b=POS[n.id];
  const x1=a.x+NW,y1=a.y+NH/2,x2=b.x,y2=b.y+NH/2;
  const dx=Math.min(150,Math.max(46,(x2-x1)*0.5));
  const path=el("path",{d:"M "+x1+" "+y1+" C "+(x1+dx)+" "+y1+", "+(x2-dx)+" "+y2+", "+x2+" "+y2,
   class:"edge"+(isPri?" primary":"")+((n.prereqsAny||[]).some(x=>x.includes(p))?" dashed":""),
   id:"E_"+p+"_"+n.id});
  if(isPri)path.setAttribute("stroke",COLOR[n.trunk]);
  edgeEls.push({p:p,c:n.id,el:path});
 }));
});
/* 节点 */
NODES.forEach(n=>{
 const g=el("g",{class:"node locked",id:"N_"+n.id,transform:"translate("+POS[n.id].x+","+POS[n.id].y+")"});
 g.style.setProperty("--tc",COLOR[n.trunk]);
 const fo=document.createElementNS(NS,"foreignObject");
 fo.setAttribute("width",NW);fo.setAttribute("height",NH);g.appendChild(fo);
 const div=document.createElement("div");div.setAttribute("xmlns","http://www.w3.org/1999/xhtml");div.className="ncard";
 div.innerHTML='<div class="nm">'+n.name+'</div><div class="ds">'+(n.desc||"")+'</div>'+
  '<div class="iid">'+n.id+'</div><div class="st"></div>'+
  '<div class="badge">'+(n.frontier?'<span class="fr" title="2025H2-2026 前沿节点">★</span>':'')+
  ((DOM.domesticNodes||[]).includes(n.id)?'<span class="dm" title="V5 约束模式：国产化必点">主</span>':'')+'</div>';
 fo.appendChild(div);
});

/* ================= 状态机 ================= */
function available(n){if(lit.has(n.id))return false;return groupsOf(n).every(g=>g.some(p=>lit.has(p)));}
function ancestors(id){const s=new Set(),st=[...(BY[id].prereqs||[])];(BY[id].prereqsAny||[]).forEach(g=>st.push(...g));
 while(st.length){const x=st.pop();if(s.has(x))continue;s.add(x);st.push(...(BY[x].prereqs||[]));(BY[x].prereqsAny||[]).forEach(g=>st.push(...g));}return s;}
function descendants(id){const s=new Set(),st=[...(KIDS[id]||[])];while(st.length){const x=st.pop();if(s.has(x))continue;s.add(x);st.push(...(KIDS[x]||[]));}return s;}
function refresh(){
 let avail=0;
 NODES.forEach(n=>{const g=document.getElementById("N_"+n.id);g.classList.remove("locked","available","lit");
  if(lit.has(n.id))g.classList.add("lit");else if(available(n)){g.classList.add("available");avail++;}else g.classList.add("locked");});
 edgeEls.forEach(e=>e.el.classList.toggle("on",lit.has(e.p)));
 document.getElementById("stats").innerHTML="已点亮 <b>"+lit.size+"</b>/"+NODES.length+" · 可点亮 <i>"+avail+"</i>";
 updatePanel();
}
function toggle(id){
 const n=BY[id];
 if(lit.has(id)){
  const rm=[...descendants(id)].filter(x=>lit.has(x));
  lit.delete(id);rm.forEach(x=>lit.delete(x));
  toast("已取消 "+id+" "+n.name+(rm.length?"（级联取消 "+rm.length+" 个下游节点）":""));
 }else if(available(n)){lit.add(id);}
 else{
  const need=[];groupsOf(n).forEach(g=>{if(!g.some(p=>lit.has(p)))need.push(g.map(p=>p+" "+BY[p].name).join("/"));});
  toast("前置未满足："+id+" 需要 "+need.join("、"));return;
 }
 refresh();
}
world.addEventListener("click",e=>{const g=e.target.closest&&e.target.closest("g.node");if(g)toggle(g.id.slice(2));});

/* ================= 悬停：高亮祖先链/解锁树 + tooltip ================= */
const tip=document.getElementById("tooltip");
world.addEventListener("mousemove",e=>{
 const g=e.target.closest&&e.target.closest("g.node");
 document.querySelectorAll("g.node.hlg").forEach(x=>x.classList.remove("hlg"));
 document.querySelectorAll("path.edge.hlg").forEach(x=>x.classList.remove("hlg"));
 if(!g){tip.style.display="none";return;}
 const id=g.id.slice(2),n=BY[id];
 const chain=ancestors(id);chain.add(id);
 const des=descendants(id);
 chain.forEach(x=>document.getElementById("N_"+x).classList.add("hlg"));
 des.forEach(x=>document.getElementById("N_"+x).classList.add("hlg"));
 edgeEls.forEach(e=>{if((chain.has(e.p)&&chain.has(e.c))||(des.has(e.c)&&e.p===id)||(e.c===id&&chain.has(e.p)))e.el.classList.add("hlg");});
 const pre=groupsOf(n).map(gp=>gp.map(p=>p+" "+BY[p].name).join(" / ")).join("；")||"无";
 tip.innerHTML="<b>"+id+" "+n.name+"</b>"+(n.frontier?" <span style='color:#f5c542'>★前沿</span>":"")+
  "<br><span class='tv'>"+n.trunk+" "+TINFO[n.trunk].name+(n.sub?" · "+n.sub:"")+" · 全局深度 "+n.depth+" · 解锁 "+(KIDS[id]||[]).length+" 个后继</span>"+
  "<br>"+(n.desc||"")+(n.profile?"<br><span class='tv'>算力画像："+n.profile+"</span>":"")+
  "<br><span class='tc2'>点亮判据： "+n.criteria+"</span><br><span class='td'>前置："+pre+"</span>";
 tip.style.display="block";
 const r=document.getElementById("stage").getBoundingClientRect();
 let x=e.clientX-r.left+16,y=e.clientY-r.top+14;
 if(x+340>r.width)x-=360;if(y+180>r.height)y-=190;
 tip.style.left=x+"px";tip.style.top=y+"px";
});

/* ================= 平移缩放 ================= */
let view={x:0,y:0,k:1};
function apply(){world.setAttribute("transform","translate("+view.x+","+view.y+") scale("+view.k+")");}
svg.addEventListener("wheel",e=>{e.preventDefault();const r=svg.getBoundingClientRect();
 const mx=e.clientX-r.left,my=e.clientY-r.top,f=e.deltaY<0?1.15:1/1.15;
 const k2=Math.min(2.4,Math.max(.06,view.k*f));
 view.x=mx-(mx-view.x)*k2/view.k;view.y=my-(my-view.y)*k2/view.k;view.k=k2;apply();},{passive:false});
let pan=null;
svg.addEventListener("pointerdown",e=>{if(e.target.closest&&e.target.closest("g.node"))return;
 pan={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y};svg.classList.add("panning");svg.setPointerCapture(e.pointerId);});
svg.addEventListener("pointermove",e=>{if(!pan)return;view.x=pan.vx+e.clientX-pan.x;view.y=pan.vy+e.clientY-pan.y;apply();});
svg.addEventListener("pointerup",()=>{pan=null;svg.classList.remove("panning");});
function fit(){const r=svg.getBoundingClientRect();view.k=Math.min(r.width/W,r.height/H)*.96;
 view.x=(r.width-W*view.k)/2;view.y=16;apply();}
function fitWidth(){const r=svg.getBoundingClientRect();view.k=r.width/W*.98;view.x=8;view.y=16;apply();}
function center(id){const p=POS[id],r=svg.getBoundingClientRect();view.x=r.width/2-(p.x+NW/2)*view.k;view.y=r.height/2-(p.y+NH/2)*view.k;apply();
 const g=document.getElementById("N_"+id);g.classList.add("flash");setTimeout(()=>g.classList.remove("flash"),1300);}
document.getElementById("btnFit").onclick=fit;
document.getElementById("btnZin").onclick=()=>{const r=svg.getBoundingClientRect();const k2=Math.min(2.4,view.k*1.25);
 view.x=r.width/2-(r.width/2-view.x)*k2/view.k;view.y=r.height/2-(r.height/2-view.y)*k2/view.k;view.k=k2;apply();};
document.getElementById("btnZout").onclick=()=>{const r=svg.getBoundingClientRect();const k2=Math.max(.06,view.k/1.25);
 view.x=r.width/2-(r.width/2-view.x)*k2/view.k;view.y=r.height/2-(r.height/2-view.y)*k2/view.k;view.k=k2;apply();};
document.getElementById("btnReset").onclick=()=>{lit.clear();refresh();toast("已重置全部点亮状态");};
document.getElementById("btnAll").onclick=()=>{NODES.forEach(n=>lit.add(n.id));refresh();toast("已点亮全部节点（探索模式）");};
document.getElementById("search").addEventListener("keydown",e=>{
 if(e.key!=="Enter")return;const q=e.target.value.trim().toLowerCase();if(!q)return;
 let hit=BY[q.toUpperCase()];
 if(!hit)hit=NODES.find(n=>n.name.toLowerCase().includes(q)||(n.desc||"").toLowerCase().includes(q));
 if(hit)center(hit.id);else toast("未找到匹配节点");});

/* ================= toast ================= */
let tmo=null;
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.style.display="block";
 clearTimeout(tmo);tmo=setTimeout(()=>t.style.display="none",2600);}

/* ================= 侧栏：胜利条件面板 ================= */
function needSet(path){const s=new Set(path.closure);if(constraint)DOM.domesticNodes.forEach(d=>s.add(d));return s;}
function findPath(pid){for(const v of DATA.victories)for(const p of v.paths)if(p.id===pid)return p;return null;}
function buildSidebar(){
 const sb=document.getElementById("sidebar");
 let html="<h1>大智算科技树 · 胜利条件面板</h1><div class='sub'>"+DATA.meta.nodeCount+" 节点 / "+edgeEls.length+" 依赖边（主干内主边加粗） / "+DATA.victories.length+" 胜利条件 · "+DATA.victories.reduce((a,v)=>a+v.paths.length,0)+" 条达成路径"+
  " · 数据 v"+DATA.meta.version+(BUILD?" · 构建 "+BUILD:" · 开发模式")+"</div>";
 html+="<div class='modeRow'><label><span class='switch' id='cmsw'><i></i></span><span><b>V5 约束模式</b>（国产化硬约束）<br><span style='color:#8b98ad'>"+DOM.description+"</span></span></label></div>";
 DATA.victories.forEach(v=>{
  html+="<div class='vcard' id='VC_"+v.id+"'><div class='vhead'><span class='vid'>"+v.id+"</span>"+v.name+"<span class='ach'>✓ 已达成</span></div>"+
   "<div class='vdef'>"+v.definition+"</div><div class='vtiers'>";
  for(const k in v.tiers)html+="<span><b>"+k+"：</b>"+v.tiers[k]+"</span>";
  html+="</div>";
  v.paths.forEach(p=>{
   html+="<div class='path' id='PT_"+p.id+"'><div class='prow'><div class='pname'>"+p.name+"（最小集 "+p.nodes.length+" → 闭包 "+p.closureSize+"）"+
    "<span class='rep'>产业参考档位："+p.currentTier+" · "+p.representatives+"</span></div>"+
    "<span class='pnum' id='PN_"+p.id+"'></span><button class='demoBtn' data-p='"+p.id+"'>演示点亮</button></div>"+
    "<div class='pbar'><div class='pfill' id='PF_"+p.id+"'></div></div><div class='pnodes'>";
   p.nodes.forEach(nd=>html+="<span class='chip' data-n='"+nd+"' title='"+nd+" "+BY[nd].name+"'>"+nd+"</span>");
   html+="</div></div>";
  });
  html+="</div>";
 });
 html+="<div class='foot'>布局：每个主干为一条横向子树带；<b>横轴=全局依赖深度，所有依赖边严格从左到右</b>——依赖外部主干的高阶入口节点（如 H 通智一体、K 部分节点）自动右移。粗彩色边=主干内主路径，细灰边=跨主干/次级依赖（同样是必要前置，悬停可高亮完整祖先链）。<br>"+
  "点亮规则：前置全部点亮后才可点击；再次点击取消并级联取消下游。虚线边=多选前置（或逻辑）。<br>★前沿=2025H2-2026 研究前沿；「主」=V5 约束模式生效时的国产化必点节点。</div>";
 sb.innerHTML=html;
 document.getElementById("cmsw").parentElement.addEventListener("click",e=>{
  e.preventDefault();constraint=!constraint;
  document.getElementById("cmsw").classList.toggle("on",constraint);
  document.body.classList.toggle("constraint",constraint);refresh();
  toast(constraint?"V5 约束模式已开启：所有胜利路径需追加国产化节点（+5）":"V5 约束模式已关闭");});
 sb.addEventListener("click",e=>{
  const d=e.target.closest(".demoBtn");if(d){const p=findPath(d.dataset.p);
   const s=needSet(p);s.forEach(x=>lit.add(x));refresh();toast("已演示点亮 "+p.id+" "+p.name+"（闭包 "+s.size+" 节点）");return;}
  const c=e.target.closest(".chip");if(c){center(c.dataset.n);}});
}
function updatePanel(){
 DATA.victories.forEach(v=>{
  let any=false;
  v.paths.forEach(p=>{
   const s=needSet(p);let done=0;s.forEach(x=>{if(lit.has(x))done++;});
   const ok=done===s.size;any=any||ok;
   document.getElementById("PF_"+p.id).style.width=(done/s.size*100).toFixed(1)+"%";
   const pn=document.getElementById("PN_"+p.id);pn.textContent=done+"/"+s.size+(constraint&&DOM.domesticNodes.some(d=>!p.closure.includes(d))?"（含约束+5）":"");
   pn.className="pnum"+(ok?" done":"");
   document.getElementById("PT_"+p.id).classList.toggle("done",ok);
   p.nodes.forEach(nd=>{const chip=document.querySelector("#PT_"+p.id+" .chip[data-n='"+nd+"']");
    if(chip)chip.classList.toggle("lit",lit.has(nd));});
  });
  document.getElementById("VC_"+v.id).classList.toggle("achieved",any);
 });
}

/* ================= 图例 & 启动 ================= */
document.getElementById("legend").innerHTML=
 "<span class='lg'><span class='sw' style='background:linear-gradient(150deg,#4a7fbf,#2a4a72);border:2px solid #fff'></span>已点亮 ✓</span>"+
 "<span class='lg'><span class='sw' style='background:#0c1320;border:2px solid #60a5fa;box-shadow:0 0 8px #60a5ba'></span>● 可点亮（前置已满足）</span>"+
 "<span class='lg'><span class='sw' style='background:#0f1522;border:1.5px solid #242f4a;opacity:.5'></span>锁定</span>"+
 "<span class='lg'><span style='width:22px;height:0;border-top:3px solid #a78bfa;display:inline-block'></span>主干内主路径</span>"+
 "<span class='lg'><span style='width:22px;height:0;border-top:1.5px solid #415070;display:inline-block'></span>跨主干/次级依赖</span>"+
 "<span class='lg'>★前沿 · 虚线=多选前置（或） · 悬停看依赖链</span>";
buildSidebar();
refresh();
fitWidth();

/* ================= 内置自检（URL 加 ?selftest 触发） ================= */
if(/selftest/.test(location.search)){
 const R=[];let fail=0;
 const T=(name,ok,detail)=>{R.push((ok?"✅ ":"❌ ")+name+(detail?"  ["+detail+"]":""));if(!ok)fail++;};
 function closureJS(seed){const s=new Set(seed);let ch=true;
  while(ch){ch=false;for(const nid of Array.from(s)){const n=BY[nid];
   for(const p of (n.prereqs||[]))if(!s.has(p)){s.add(p);ch=true;}
   for(const g of (n.prereqsAny||[]))if(!g.some(x=>s.has(x))){s.add(g[0]);ch=true;}}}
  return s;}
 T("节点数=meta.nodeCount", NODES.length===DATA.meta.nodeCount, NODES.length+" vs "+DATA.meta.nodeCount);
 const roots=NODES.filter(n=>groupsOf(n).length===0);
 let av=0;NODES.forEach(n=>{if(available(n))av++;});
 T("初始可点亮=根节点数", av===roots.length, av+" vs "+roots.length+"（"+roots.map(n=>n.id).join(",")+"）");
 DATA.victories.forEach(v=>v.paths.forEach(p=>{
  const c=closureJS(p.nodes);
  T("闭包一致 "+p.id, c.size===p.closureSize&&[...c].sort().join()===[...p.closure].sort().join(), c.size+" vs "+p.closureSize);
  let mini=true;
  p.nodes.forEach(a=>p.nodes.forEach(b=>{if(a!==b&&ancestors(b).has(a))mini=false;}));
  T("最小集无冗余 "+p.id, mini);
 }));
 /* 演示 + 级联 */
 lit.clear();const cl=closureJS(findPath("V1P1").nodes);cl.forEach(x=>lit.add(x));refresh();
 const willLose=[...descendants("A2")].filter(x=>cl.has(x)).length;
 toggle("A2");
 T("级联取消 A2", lit.size===cl.size-1-willLose, lit.size+" vs "+(cl.size-1-willLose));
 /* 约束模式 */
 constraint=true;const ns=needSet(findPath("V1P1"));
 const extra=DOM.domesticNodes.filter(d=>!findPath("V1P1").closure.includes(d)).length;
 T("约束模式 +"+extra, ns.size===findPath("V1P1").closureSize+extra, ns.size+" vs "+(findPath("V1P1").closureSize+extra));
 constraint=false;lit.clear();refresh();
 /* 布局不变量：所有依赖边从左到右 */
 let bad=0;edgeEls.forEach(e=>{if(!(POS[e.c].x>POS[e.p].x))bad++;});
 T("全部依赖边从左到右", bad===0, bad+" 条违规");
 T("祖先集不含自身（无环）", NODES.every(n=>!ancestors(n.id).has(n.id)));
 const st=document.getElementById("selftest");
 st.style.display="block";
 st.innerHTML=("<b>SELFTEST "+(fail?"FAIL":"PASS")+"</b>（"+R.length+" 项）\n"+
  R.join("\n")).replace(/❌ /g,"<span style='color:#f87171'>❌ </span>").replace(/✅ /g,"<span style='color:#34d399'>✅ </span>");
 document.title=(fail?"[FAIL] ":"[PASS] ")+document.title;
}
}

/* ================= 启动：发布态用内嵌 TREE_DATA，开发态 fetch enriched JSON ================= */
(function boot(){
 const build=window.__BUILD__||null;
 if(window.TREE_DATA){main(window.TREE_DATA,build);return;}
 fetch("../智算科技树-graph-v0.3.enriched.json").then(r=>r.json())
  .then(d=>main(d,build))
  .catch(e=>{
   document.body.insertAdjacentHTML("beforeend",
    "<div style='position:fixed;left:0;right:0;bottom:0;background:#5c1d1d;color:#fff;padding:10px 16px;z-index:99;font-size:13px'>"+
    "开发模式数据加载失败（"+e+"）。请在项目根目录启动本地服务（python build_viz.py --dev）后访问 /viz/ 。</div>");
  });
})();
