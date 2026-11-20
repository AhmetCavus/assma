'use strict';
const progressFilter={unit:"week",offset:0};
function plainDate(stamp){const d=new Date(Date.UTC(stamp.getUTCFullYear(),stamp.getUTCMonth(),stamp.getUTCDate()));return d.toISOString().slice(0,10)}
function dateAt(date){return new Date(date.slice(0,10)+"T00:00:00Z")}
function addDays(date,days){const v=new Date(date);v.setUTCDate(v.getUTCDate()+days);return v}
function periodBounds(unit,offset) {
  const day=dateAt(demoDay);
  if(unit==="month"){
    const year=day.getUTCFullYear(),month=day.getUTCMonth()+offset;
    return [new Date(Date.UTC(year,month,1)),new Date(Date.UTC(year,month+1,1))];
  }
  const monday=addDays(day,-((day.getUTCDay()+6)%7)+offset*7);
  return [monday,addDays(monday,7)];
}
function formatPeriodDate(date,opts){
  return new Intl.DateTimeFormat(S.lang==="de"?"de-DE":"en-GB",{...opts,timeZone:"UTC"}).format(date);
}
function submissionRecords(){
  return S.projects.flatMap(p=>{
    const records=versionsFor(p.id);
    if(records.length)return records.map((s,index)=>({id:p.id,index,company:s.project.company,title:s.project.title,channel:s.channel,when:s.when,status:p.status}));
    return p.channel&&p.when?[{id:p.id,index:0,company:p.company,title:p.title,channel:p.channel,when:p.when,status:p.status}]:[];
  }).filter(row=>row.when&&row.channel).sort((a,b)=>b.when.localeCompare(a.when));
}
function acquisitionStats(){
  const {unit,offset}=progressFilter;
  const all=submissionRecords(),[start,end]=periodBounds(unit,offset),[previousStart]=periodBounds(unit,offset-1);
  const within=(from,to)=>all.filter(s=>s.when.slice(0,10)>=plainDate(from)&&s.when.slice(0,10)<plainDate(to));
  const entries=within(start,end),previous=within(previousStart,start);
  const bins=[];
  for(let day=start;day<end;){
    const length=unit==="week"?1:7;
    const until=addDays(day,length)<end?addDays(day,length):end;
    const label=unit==="week"?formatPeriodDate(day,{weekday:"short"}):`${day.getUTCDate()}–${addDays(until,-1).getUTCDate()}`;
    const items=entries.filter(s=>s.when.slice(0,10)>=plainDate(day)&&s.when.slice(0,10)<plainDate(until));
    bins.push({label,count:items.length});day=until;
  }
  const unique=(selector)=>new Set(entries.map(selector).filter(Boolean));
  const label=unit==="month"?formatPeriodDate(start,{month:"long",year:"numeric"}):`${formatPeriodDate(start,{day:"numeric",month:"short"})} – ${formatPeriodDate(addDays(end,-1),{day:"numeric",month:"short",year:"numeric"})}`;
  return {entries,previous:previous.length,label,bins,companies:unique(x=>x.company.trim().toLocaleLowerCase()).size,interviews:new Set(entries.filter(x=>x.status==="interview").map(x=>x.id)).size,email:entries.filter(x=>x.channel==="email").length,portal:entries.filter(x=>x.channel==="portal").length};
}
function progressBrief(){
  const s=acquisitionStats(),n=s.entries.length;
  if(n===0)return L(`${s.label}: In diesem Zeitraum hast du noch keine Bewerbung vermerkt.`,`${s.label}: You have no recorded applications in this period.`);
  return L(`${s.label}: ${n} ${n===1?"Bewerbung":"Bewerbungen"}, davon ${s.email} per E-Mail und ${s.portal} über Portale. Im vorherigen Zeitraum waren es ${s.previous}.`,`${s.label}: ${n} ${n===1?"application":"applications"}, ${s.email} by email and ${s.portal} via portals. The preceding period had ${s.previous}.`);
}
function progressView(){
  const s=acquisitionStats(),n=s.entries.length,week=progressFilter.unit==="week",max=Math.max(1,...s.bins.map(x=>x.count)),diff=n-s.previous;
  const unitBtn=(u,label)=>`<button class="chip" data-act="progress-unit" data-id="${u}" aria-pressed="${progressFilter.unit===u}">${label}</button>`;
  const prev=week?L("Vorherige Woche","Previous week"):L("Vorheriger Monat","Previous month"),next=week?L("Nächste Woche","Next week"):L("Nächster Monat","Next month");
  const controls=`<div class="progress-controls"><div class="period-unit" role="group" aria-label="${L("Zeitraum","Time range")}">${unitBtn("week",L("Woche","Week"))}${unitBtn("month",L("Monat","Month"))}</div><div class="period-nav">${toolButton("period-prev",prev,"back")}<span aria-live="polite">${h(s.label)}</span>${toolButton("period-next",next,"next",progressFilter.offset>=0?"disabled":"")}</div></div>`;
  const delta=diff===0?L("Genauso viele wie zuvor","Same as the previous period"):L(`${diff>0?"+":""}${diff} ${week?"zur Vorwoche":"zum Vormonat"}`,`${diff>0?"+":""}${diff} vs. previous ${week?"week":"month"}`);
  const metrics=`<div class="stats progress-stats"><div class="stat"><span>${L("Bewerbungen","Applications")}</span><strong>${n}</strong><small>${delta}</small></div><div class="stat"><span>${L("Unternehmen","Companies")}</span><strong>${s.companies}</strong><small>${L("mit einer Bewerbung","with a submission")}</small></div><div class="stat"><span>${L("Aktuell im Interview","Now interviewing")}</span><strong>${s.interviews}</strong><small>${L("Projekte aus diesem Zeitraum","projects submitted in this period")}</small></div></div>`;
  const bars=`<div class="progress-plot" role="list" aria-label="${L("Bewerbungen im Zeitverlauf","Submissions over time")}">${s.bins.map(b=>`<div class="plot-bin" role="listitem" aria-label="${h(b.label)} · ${b.count}"><div class="plot-track" aria-hidden="true"><i style="height:${100*b.count/max}%"></i></div><strong aria-hidden="true">${b.count}</strong><span aria-hidden="true">${h(b.label)}</span></div>`).join("")}</div>`;
  const channels=[[L("E-Mail","Email"),s.email],["Portal",s.portal]].map(([label,count])=>`<li><div><strong>${label}</strong><span>${count} · ${n?Math.round(count/n*100):0} %</span></div><span class="channel-track" aria-hidden="true"><i style="width:${n?100*count/n:0}%"></i></span></li>`).join("");
  const list=s.entries.length?s.entries.map(s=>`<div class="row"><div><button class="tabletitle" data-act="submission-open" data-id="${h(s.id)}" data-version="${s.index}">${h(s.title)}</button><small>${h(s.company)} · ${s.channel==="portal"?"Portal":L("E-Mail","Email")}</small></div><span class="meta">${formatDate(s.when,true)}</span></div>`).join(""):`<p class="empty">${L("Für diesen Zeitraum ist keine Bewerbung vermerkt.","There are no submitted applications in this period.")}</p>`;
  return workHead(L("Fortschritt","Progress"),L("Wann hast du dich beworben, und über welchen Kanal?","When did you apply, and which channel did you use?"))+controls+metrics+
    `<div class="split">${surface(week?L("Bewerbungen pro Tag","Applications by day"):L("Bewerbungen im Monat","Applications this month"),bars)}${surface(L("Bewerbungskanäle","Application channels"),`<ul class="channel-list">${channels}</ul>`)}</div>`+
    surface(L("Bewerbungen im Zeitraum","Submissions in this period"),list);
}
function setProgressPeriod(action,id){
  if(action==="progress-unit"){progressFilter.unit=id==="month"?"month":"week";progressFilter.offset=0}
  else if(action==="period-prev")progressFilter.offset--;
  else if(action==="period-next")progressFilter.offset=Math.min(0,progressFilter.offset+1);
  else return false;
  resetDockContext();render();
  const el=[...document.querySelectorAll("[data-act]")].find(b=>b.dataset.act===action&&(!id||b.dataset.id===id)&&!b.disabled);
  el?.focus({preventScroll:true});
  return true;
}

