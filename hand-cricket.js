// Hand Cricket: a free, dependency-free team game for phones.
// Run:  node hand-cricket.js     (Node 16 or newer, no packages needed)
// The server only keeps score and timers. Visuals, animation and sound all run in the browser.
const http = require('http');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');

const ASSETS = {"app.html":"<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>Hand Cricket</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\"><link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;600;700&display=swap\">\n<link rel=\"stylesheet\" href=\"/style.css\"></head>\n<body>\n<canvas id=\"fx\"></canvas>\n<div class=\"wrap\">\n  <header>\n    <div class=\"brand\">\n      <svg class=\"logo\" viewBox=\"0 0 40 40\" aria-hidden=\"true\"><circle cx=\"20\" cy=\"20\" r=\"17\" fill=\"#b3202a\"/><path d=\"M8 12 Q20 20 8 28 M32 12 Q20 20 32 28\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2\" stroke-dasharray=\"3 2.5\"/></svg>\n      <div><h1>Hand <span>Cricket</span></h1><div class=\"room\" id=\"room\"></div></div>\n    </div>\n    <div class=\"hr\"><div class=\"timer\" id=\"timer\"></div><button class=\"icon\" id=\"snd\" aria-label=\"Sound on or off\">🔊</button></div>\n  </header>\n  <nav class=\"tabs\" aria-label=\"Sections\"><button id=\"tabGame\" data-act=\"tab\" data-t=\"game\">Game</button><button id=\"tabRules\" data-act=\"tab\" data-t=\"rules\">Rules</button></nav>\n  <main id=\"app\"></main>\n</div>\n<div class=\"hint\" id=\"hint\" hidden>🔊 Tap anywhere to turn on sound</div>\n<script>\n(function(){\n'use strict';\nvar PATH_HOST=location.pathname.replace(/\\/$/,'')==='/host';\nvar $=function(id){return document.getElementById(id);};\nvar esc=function(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});};\nvar store={\n  get:function(k){try{return localStorage.getItem(k);}catch(e){return null;}},\n  set:function(k,v){try{localStorage.setItem(k,v);}catch(e){}},\n  del:function(k){try{localStorage.removeItem(k);}catch(e){}}\n};\nvar parse=function(s){try{return JSON.parse(s);}catch(e){return null;}};\nvar reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;\nvar S=null,role=null,code=null,pid=null,hostKey=null,es=null,clockOff=0,info={urls:[]};\nvar tab='game',landing=new URLSearchParams(location.search).get('room')?'join':'choose',msg='',armed=null,armTimer=null,lastSig='',lastTick=-1;\nvar draft={bat:[],bowl:[]},draftInnings=0;\nvar muted=store.get('hcMute')==='1';\nvar tn=function(t){return esc(S.teamNames[t]);};\nvar tc=function(t){return t===0?'ta':'tb';};\nvar P=function(id){return S.players.filter(function(p){return p.id===id;})[0];};\nvar nm=function(id){var p=P(id);return p?esc(p.name):'Someone';};\nvar ovr=function(b){return Math.floor(b/6)+'.'+(b%6);};\nvar plural=function(n,w){return n+' '+w+(n===1?'':'s');};\n\n/* ---------- sound (made in the browser, no files) ---------- */\nvar AC=null,nb=null;\nfunction ctx(){\n  if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){AC=null;}}\n  if(AC&&AC.state==='suspended'){try{AC.resume();}catch(e){}}\n  return AC;\n}\nfunction live(){return AC&&!muted&&AC.state==='running';}\nfunction env(g,t,a,d,v){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+d);}\nfunction tone(f,d,type,v,delay,f2){\n  if(!live())return;\n  var t=AC.currentTime+(delay||0),o=AC.createOscillator(),g=AC.createGain();\n  o.type=type||'sine';o.frequency.setValueAtTime(f,t);\n  if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);\n  env(g,t,0.005,d,v||0.2);o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+d+0.05);\n}\nfunction noise(d,v,delay,ft,ff){\n  if(!live())return;\n  if(!nb){nb=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);var x=nb.getChannelData(0);for(var i=0;i<x.length;i++)x[i]=Math.random()*2-1;}\n  var t=AC.currentTime+(delay||0),s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();\n  s.buffer=nb;s.loop=true;f.type=ft||'lowpass';f.frequency.value=ff||1000;\n  env(g,t,Math.min(0.04,d/3),d,v);s.connect(f);f.connect(g);g.connect(AC.destination);s.start(t);s.stop(t+d+0.05);\n}\nvar SND={\n  lock:function(){tone(700,0.07,'square',0.07);tone(1000,0.08,'square',0.07,0.06);},\n  tick:function(){tone(1200,0.04,'square',0.06);},\n  ding:function(){tone(880,0.12,'sine',0.18);tone(1320,0.18,'sine',0.12,0.1);},\n  coin:function(){[0,0.14,0.28].forEach(function(d,i){tone(1500+i*200,0.14,'sine',0.14,d);});},\n  hit:function(){noise(0.09,0.4,0,'bandpass',1800);tone(170,0.14,'sine',0.4,0,60);},\n  cheer:function(){SND.hit();noise(1.2,0.25,0.15,'bandpass',1100);[523,659,784,1047].forEach(function(f,i){tone(f,0.25,'triangle',0.12,0.2+i*0.09);});},\n  wicket:function(){noise(0.45,0.45,0,'lowpass',900);tone(320,0.4,'sawtooth',0.16,0,70);tone(200,0.45,'square',0.09,0.05,50);},\n  fanfare:function(){[523,659,784,1047,784,1047].forEach(function(f,i){tone(f,0.28,'triangle',0.16,i*0.16);});}\n};\nfunction syncHint(){\n  var h=$('hint');if(h)h.hidden=muted||(AC&&AC.state==='running');\n  $('snd').textContent=muted?'🔇':'🔊';\n}\n\n/* ---------- confetti (canvas, browser only) ---------- */\nfunction confetti(){\n  if(reduce)return;\n  var c=$('fx'),g=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;\n  var cols=['#ffcf3f','#63c7ff','#6be3a0','#ff6b6b','#f6f1e1'],ps=[],i;\n  for(i=0;i<140;i++)ps.push({x:Math.random()*c.width,y:-20-Math.random()*c.height*0.5,vx:(Math.random()-0.5)*3,vy:2+Math.random()*4,s:5+Math.random()*7,r:Math.random()*6,vr:(Math.random()-0.5)*0.3,c:cols[i%cols.length]});\n  var start=Date.now();\n  (function frame(){\n    g.clearRect(0,0,c.width,c.height);\n    ps.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;g.save();g.translate(p.x,p.y);g.rotate(p.r);g.fillStyle=p.c;g.fillRect(-p.s/2,-p.s/3,p.s,p.s*0.6);g.restore();});\n    if(Date.now()-start<4200)requestAnimationFrame(frame);else g.clearRect(0,0,c.width,c.height);\n  })();\n}\n\n/* ---------- network ---------- */\nasync function post(path,body){\n  try{\n    var r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});\n    return await r.json();\n  }catch(e){return {error:'network'};}\n}\nfunction doAct(type,extra){return post('/api/act',Object.assign({code:code,pid:pid,key:hostKey,type:type},extra||{}));}\n\nfunction connect(){\n  if(es)es.close();\n  var url='/api/events?code='+code+(role==='host'?'&role=host&key='+hostKey:'&pid='+pid);\n  es=new EventSource(url);\n  es.onmessage=function(e){onState(JSON.parse(e.data));};\n  es.addEventListener('gone',function(){leave('That room is no longer available.');});\n  es.addEventListener('closed',function(e){\n    var d=parse(e.data)||{};\n    leave(d.reason==='host_closed'?'The host closed the room.':d.reason==='host_left'?'The host left, so the room closed.':'The room was closed.');\n  });\n  es.addEventListener('kicked',function(){leave('The host removed you from the room.');});\n}\nfunction leave(m){\n  if(es)es.close();es=null;S=null;role=null;code=pid=hostKey=null;\n  store.del('hcHost');store.del('hcPlayer');\n  msg=m||'';landing='choose';tab='game';render(true);\n}\nasync function hostGame(){\n  var r=await post('/api/create',{});\n  if(!r.code){msg=r.error==='busy'?'The server is busy. Try again in a minute.':'Could not create a room. Check your connection.';render(true);return;}\n  role='host';code=r.code;hostKey=r.key;store.set('hcHost',JSON.stringify({code:code,key:hostKey}));msg='';connect();\n}\nasync function joinGame(){\n  var c=$('rc').value.trim().toUpperCase(),n=$('nm').value.trim();\n  var r=await post('/api/join',{code:c,name:n});\n  if(r.error){$('err').textContent=({no_room:'Room not found',name_taken:'That name is taken',bad_name:'Enter a name',full:'Room is full',started:'That match has already started',locked:'The host has locked this room',network:'Network error'})[r.error]||r.error;return;}\n  role='player';code=c;pid=r.pid;store.set('hcPlayer',JSON.stringify({code:c,pid:pid}));msg='';connect();\n}\nfunction postSettings(){\n  doAct('settings',{overs:+$('sOv').value,ballSec:+$('sBs').value,names:[$('tnA').value,$('tnB').value]});\n}\n\n/* ---------- state changes: sounds and effects ---------- */\nfunction onState(n){\n  var p=S;S=n;clockOff=n.now-Date.now();\n  if(p&&p.phase!==n.phase){\n    if(n.phase==='result'&&n.play&&n.play.lastBall){var lb=n.play.lastBall;if(lb.out)SND.wicket();else if(lb.runs>=6)SND.cheer();else SND.hit();}\n    else if(n.phase==='ball'||n.phase==='toss_call')SND.ding();\n    else if(n.phase==='toss_result')SND.coin();\n    else if(n.phase==='final'){SND.fanfare();if(n.final&&n.final.winner!==null)confetti();}\n  }\n  render(false);\n}\nsetInterval(function(){\n  var t=$('timer'),txt='',low=false;\n  if(S&&S.deadline){\n    var rem=Math.max(0,Math.ceil((S.deadline-(Date.now()+clockOff))/1000));\n    txt=rem;low=rem<=3&&(S.phase==='ball'||S.phase==='toss_num');\n    if(rem!==lastTick){lastTick=rem;if(low&&rem>0)SND.tick();}\n  }\n  t.textContent=txt;t.className='timer'+(low?' low':'');\n},200);\n\n/* ---------- pieces ---------- */\nfunction pad(act,sel,locked){\n  var h='<div class=\"pad\">';\n  for(var i=0;i<=10;i++)h+='<button class=\"'+(sel===i?'sel':'')+'\" data-act=\"'+act+'\" data-n=\"'+i+'\"'+(locked?' disabled':'')+'>'+i+'</button>';\n  return h+'</div>';\n}\nfunction lockChip(label,ok){return '<span class=\"chip'+(ok?' on':'')+'\">'+label+(ok?' ✓':' …')+'</span>';}\nfunction overDots(){\n  var p=S.play,idx=S.phase==='result'?Math.floor((p.balls-1)/6):Math.floor(p.balls/6);\n  var items=p.log.filter(function(x){return x.label.split('.')[0]==String(idx);}).reverse();\n  if(!items.length)return '';\n  return '<div class=\"over\" aria-label=\"This over\">'+items.map(function(x){return '<span class=\"dotb'+(x.out?' w':(x.runs>=6?' big6':''))+'\">'+(x.out?'W':x.runs)+'</span>';}).join('')+'</div>';\n}\nfunction board(zero){\n  var p=S.play,runs=zero?0:p.runs,w=zero?0:p.wkts,b=zero?0:p.balls,f=p.results&&p.results[1];\n  var h='<div class=\"board '+tc(p.battingTeam)+'\"><div class=\"meta\"><span class=\"tn\">'+tn(p.battingTeam)+' batting</span><span>Innings '+S.innings+'</span></div>'+\n    '<div class=\"rs'+(S.phase==='result'&&!zero?' bump':'')+'\">'+runs+'/'+w+'</div>'+\n    '<div class=\"meta\"><span>Overs '+ovr(b)+' / '+S.overs+'</span>'+(f&&S.innings===2?'<span>'+tn(f.team)+' '+f.runs+'/'+f.wkts+'</span>':'')+'</div>';\n  if(p.target){var need=p.target-runs,left=S.overs*6-b;h+='<div class=\"need\">Target '+p.target+(need>0?' · need '+need+' from '+plural(left,'ball'):' · target reached')+'</div>';}\n  if(!zero)h+=overDots();\n  return h+'</div>';\n}\nfunction field(mode){\n  var p=S.play,lb=p.lastBall,cls='field '+tc(p.battingTeam),pop='';\n  if(mode==='result'){\n    cls+=' deliver '+(lb.out?'wicket shake':'hit'+(lb.runs>=6?' sixer':''));\n    pop='<div class=\"pop '+(lb.out?'out\">OUT!':'run\">+'+lb.runs)+'</div>';\n  }else cls+=' ready';\n  var st=function(x,y,c){return '<rect class=\"stump '+c+'\" x=\"'+x+'\" y=\"'+y+'\" width=\"4\" height=\"34\" rx=\"1\"/>';};\n  return '<div class=\"'+cls+'\" style=\"--bt:var(--'+tc(p.bowlingTeam)+')\"><svg viewBox=\"0 0 240 300\" role=\"img\" aria-label=\"Cricket pitch\">'+\n    '<rect x=\"84\" y=\"6\" width=\"72\" height=\"288\" rx=\"5\" fill=\"#cfa96d\"/>'+\n    '<g stroke=\"#f6f1e1\" stroke-width=\"2\" opacity=\".9\"><line x1=\"70\" y1=\"70\" x2=\"170\" y2=\"70\"/><line x1=\"70\" y1=\"236\" x2=\"170\" y2=\"236\"/></g>'+\n    st(112,36,'s1')+st(118,36,'s2')+st(124,36,'s3')+\n    '<rect class=\"bail\" x=\"112\" y=\"32\" width=\"8\" height=\"3\" rx=\"1\"/><rect class=\"bail\" x=\"120\" y=\"32\" width=\"8\" height=\"3\" rx=\"1\"/>'+\n    st(112,240,'')+st(118,240,'')+st(124,240,'')+\n    '<g class=\"batter-fig\" style=\"fill:var(--tc)\"><circle cx=\"100\" cy=\"92\" r=\"8\"/><rect x=\"92\" y=\"98\" width=\"16\" height=\"22\" rx=\"6\"/><rect x=\"108\" y=\"84\" width=\"4\" height=\"30\" rx=\"2\" fill=\"#d9ad6a\"/></g>'+\n    '<g style=\"fill:var(--bt)\"><circle cx=\"146\" cy=\"262\" r=\"8\"/><rect x=\"138\" y=\"268\" width=\"16\" height=\"20\" rx=\"6\"/></g>'+\n    '<g class=\"ball\"><circle class=\"c\" r=\"7\"/><path class=\"s\" d=\"M-5.5,-3 Q0,0 -5.5,3 M5.5,-3 Q0,0 5.5,3\"/></g>'+\n    '</svg>'+pop+'</div>';\n}\nfunction side(role,id,mine,locked,num,showNum){\n  return '<div class=\"side '+(role==='Batter'?'bat':'bowl')+(mine?' me':'')+'\"><div class=\"role\">'+role+'</div><div class=\"who\">'+nm(id)+(mine?' (you)':'')+'</div>'+\n    (showNum?'<div class=\"num\">'+num+'</div>':'<div class=\"st'+(locked?' ok':'')+'\">'+(locked?'Locked in ✓':'Choosing…')+'</div>')+'</div>';\n}\nfunction logCard(){\n  var l=S.play.log;if(!l.length)return '';\n  return '<div class=\"card\"><h3>Recent balls</h3><ul class=\"log\">'+l.map(function(x){\n    return '<li><span>'+x.label+' · '+nm(x.batter)+' '+x.b+' vs '+nm(x.bowler)+' '+x.w+'</span>'+(x.out?'<span class=\"o\">OUT</span>':'<span class=\"r\">+'+x.runs+'</span>')+'</li>';\n  }).join('')+'</ul></div>';\n}\nfunction hostBar(){\n  var me='<div class=\"card\"><h3>Host controls</h3>';\n  if(S.phase!=='lobby'){\n    var on=S.players.filter(function(p){return p.connected;}).length;\n    me+='<p class=\"mut\">'+on+' of '+S.players.length+' players connected.</p>';\n  }\n  me+='<div class=\"row2\">';\n  if(S.phase!=='lobby')me+='<button class=\"alt\" data-act=\"h-end\">'+(armed==='end'?'Tap again to end match':'End match')+'</button>';\n  me+='<button class=\"danger\" data-act=\"h-close\">'+(armed==='close'?'Tap again to close':'Close room')+'</button></div><p class=\"mut\" style=\"margin:8px 0 0\">The room also closes if you close this page.</p></div>';\n  return me;\n}\n\n/* ---------- screens ---------- */\nfunction landingHTML(){\n  var h='';\n  if(msg)h+='<div class=\"card\"><p style=\"margin:0\">'+esc(msg)+'</p></div>';\n  h+='<div class=\"card center\"><h2>Pick a number. Beat the bowler.</h2><p class=\"mut\" style=\"margin:0\">A quick two-team cricket game played on your phones. Check the Rules tab before your first match.</p></div>';\n  h+='<div class=\"choose\"><button data-act=\"l-host\">Host a game</button><button class=\"alt\" data-act=\"l-join\">Join a game</button></div>';\n  h+='<p class=\"mut center\" style=\"margin-top:10px\">Host on a laptop or TV. Players join on their own phones with the room code.</p>';\n  if(landing==='join'){\n    var qs=new URLSearchParams(location.search).get('room')||'';\n    h+='<div class=\"card\" style=\"margin-top:12px\"><h2>Join a game</h2><input id=\"rc\" placeholder=\"ROOM CODE\" maxlength=\"4\" autocapitalize=\"characters\" autocomplete=\"off\" value=\"'+esc(qs.toUpperCase())+'\"><input id=\"nm\" placeholder=\"Your name\" maxlength=\"14\" autocomplete=\"off\"><div class=\"err\" id=\"err\"></div><button data-act=\"join\">Join</button></div>';\n  }\n  return h;\n}\nfunction inviteCard(){\n  var local=/^(localhost|127\\.)/.test(location.hostname);\n  var base=(local&&info.urls[0])?info.urls[0]:location.origin;\n  return '<div class=\"card\"><div class=\"center\"><div class=\"mut\">Players open</div><div class=\"big\">'+esc(base.replace(/^https?:\\/\\//,''))+'</div><div class=\"mut\">and enter the room code</div><div class=\"code\">'+esc(S.code)+'</div></div>'+\n    '<div class=\"invite\" style=\"margin-top:8px\"><span class=\"mut\" style=\"overflow-wrap:anywhere\">'+esc(base)+'/?room='+esc(S.code)+'</span><button class=\"sm alt\" data-act=\"h-copy\">Copy invite link</button></div></div>';\n}\nfunction hostLobby(){\n  var un=S.players.filter(function(p){return p.team===null;});\n  var ready=!un.length&&S.players.some(function(p){return p.team===0;})&&S.players.some(function(p){return p.team===1;});\n  var opts=function(from,to,cur,suffix){var o='';for(var i=from;i<=to;i++)o+='<option value=\"'+i+'\"'+(i===cur?' selected':'')+'>'+i+suffix+'</option>';return o;};\n  var h=inviteCard();\n  h+='<div class=\"card\"><h3>Match settings</h3><div class=\"grid2\"><div><label class=\"l\" for=\"sOv\">Overs per innings</label><select id=\"sOv\">'+opts(1,10,S.overs,'')+'</select></div><div><label class=\"l\" for=\"sBs\">Seconds per ball</label><select id=\"sBs\">'+opts(3,10,S.ballSec,' s')+'</select></div>'+\n    '<div><label class=\"l\" for=\"tnA\">First team name</label><input id=\"tnA\" maxlength=\"14\" value=\"'+esc(S.teamNames[0])+'\"></div><div><label class=\"l\" for=\"tnB\">Second team name</label><input id=\"tnB\" maxlength=\"14\" value=\"'+esc(S.teamNames[1])+'\"></div></div></div>';\n  var col=function(t){\n    var mem=S.players.filter(function(p){return p.team===t;});\n    return '<div class=\"team '+tc(t)+'\"><h3>'+tn(t)+'</h3><ul>'+(mem.length?mem.map(function(p){\n      return '<li class=\"'+(p.connected?'':'off')+'\"><span>'+esc(p.name)+(p.captain?'<span class=\"cap\">captain</span>':'')+'</span><span class=\"acts\">'+(p.captain?'':'<button class=\"sm alt\" data-act=\"h-cap\" data-id=\"'+p.id+'\" title=\"Make captain\" aria-label=\"Make '+esc(p.name)+' captain\">★</button>')+\n        '<button class=\"sm alt\" data-act=\"h-move\" data-id=\"'+p.id+'\" data-t=\"'+(1-t)+'\" title=\"Move to other team\" aria-label=\"Move '+esc(p.name)+' to the other team\">⇄</button><button class=\"sm danger\" data-act=\"h-kick\" data-id=\"'+p.id+'\" title=\"Remove\" aria-label=\"Remove '+esc(p.name)+'\">✕</button></span></li>';\n    }).join(''):'<li class=\"mut\">No players yet</li>')+'</ul></div>';\n  };\n  h+='<div class=\"teams\">'+col(0)+col(1)+'</div>';\n  if(un.length)h+='<div class=\"card\" style=\"margin-top:12px\"><h3>Choosing a team</h3><ul class=\"log\">'+un.map(function(p){\n    return '<li><span>'+esc(p.name)+'</span><span class=\"acts\" style=\"display:flex;gap:4px\"><button class=\"sm alt\" data-act=\"h-move\" data-id=\"'+p.id+'\" data-t=\"0\">→ '+tn(0)+'</button><button class=\"sm alt\" data-act=\"h-move\" data-id=\"'+p.id+'\" data-t=\"1\">→ '+tn(1)+'</button><button class=\"sm danger\" data-act=\"h-kick\" data-id=\"'+p.id+'\" aria-label=\"Remove '+esc(p.name)+'\">✕</button></span></li>';\n  }).join('')+'</ul></div>';\n  h+='<div class=\"card\" style=\"margin-top:12px\"><p class=\"mut\">The first player in each team is its captain. Captains do the toss and set the batting and bowling order.</p>'+\n    '<div class=\"row2\"><button class=\"alt\" data-act=\"h-lock\">'+(S.locked?'Room locked: tap to unlock':'Lock room (no new players)')+'</button><button data-act=\"h-start\"'+(ready?'':' disabled')+'>Start match</button></div>'+\n    '<p class=\"mut\" style=\"margin:8px 0 0\">'+(ready?'Ready when you are.':'Every player needs a team, and each team needs at least one player.')+'</p></div>';\n  return h+hostBar();\n}\nfunction playerLobby(){\n  var me=S.me,un=S.players.filter(function(p){return p.team===null;});\n  var col=function(t){\n    var mem=S.players.filter(function(p){return p.team===t;});\n    return '<div class=\"team '+tc(t)+'\"><h3>'+tn(t)+'</h3><ul>'+(mem.length?mem.map(function(p){return '<li class=\"'+(p.connected?'':'off')+'\"><span>'+esc(p.name)+(p.captain?'<span class=\"cap\">captain</span>':'')+(p.id===me.id?' (you)':'')+'</span></li>';}).join(''):'<li class=\"mut\">No players yet</li>')+'</ul>'+\n      (me.team===t?'<p class=\"mut\" style=\"margin:0\">You are in this team.</p>':'<button class=\"join\" data-act=\"team\" data-t=\"'+t+'\">'+(me.team===null?'Join '+tn(t):'Switch to '+tn(t))+'</button>')+'</div>';\n  };\n  var h='<div class=\"card\"><h2>You are in, '+esc(me.name)+'</h2><p class=\"mut\" style=\"margin:0\">'+S.overs+' over'+(S.overs===1?'':'s')+' per innings · '+S.ballSec+' seconds per ball. Pick a team below.</p></div>';\n  h+='<div class=\"teams\">'+col(0)+col(1)+'</div>';\n  if(un.length)h+='<div class=\"card\" style=\"margin-top:12px\"><span class=\"mut\">Choosing a team: </span>'+un.map(function(p){return esc(p.name);}).join(', ')+'</div>';\n  h+='<div class=\"card center mut\" style=\"margin-top:12px\">Waiting for the host to start the match…<br>The first player in each team is its captain.</div>';\n  return h;\n}\nfunction tossCall(){\n  var t=S.toss,cap=null;\n  S.players.forEach(function(p){if(p.team===t.callerTeam&&p.captain)cap=p;});\n  var h='<div class=\"card center\"><h2>The toss</h2><p>Each captain picks 0 to 10. If the total matches the call, the calling team wins the toss and bats first.</p><p style=\"margin:0\"><b class=\"tcol '+tc(t.callerTeam)+'\">'+tn(t.callerTeam)+'</b> captain <b>'+(cap?esc(cap.name):'')+'</b> makes the call.</p></div>';\n  if(S.me&&S.me.isCaptain&&S.me.team===t.callerTeam)h+='<div class=\"card\"><h3>Your call</h3><div class=\"row2\"><button data-act=\"call\" data-c=\"odd\">Odd</button><button data-act=\"call\" data-c=\"even\">Even</button></div></div>';\n  return h;\n}\nfunction tossNum(){\n  var t=S.toss,other=1-t.callerTeam;\n  var h='<div class=\"card center\"><h2>The toss</h2><p><b class=\"tcol '+tc(t.callerTeam)+'\">'+tn(t.callerTeam)+'</b> called <b>'+t.choice.toUpperCase()+'</b>. <b class=\"tcol '+tc(other)+'\">'+tn(other)+'</b> has <b>'+(t.choice==='odd'?'EVEN':'ODD')+'</b>.</p><div class=\"chips\" style=\"justify-content:center\">'+lockChip(tn(0)+' captain',t.locked[0])+lockChip(tn(1)+' captain',t.locked[1])+'</div></div>';\n  if(S.me&&S.me.isCaptain){var m=S.me.pick;h+='<div class=\"card\"><h3>'+(m===null?'Pick a number (no pick counts as 0)':'Locked in: '+m)+'</h3>'+pad('tosspick',m,m!==null)+'</div>';}\n  return h;\n}\nfunction tossResult(){\n  var t=S.toss,par=t.sum%2===1?'odd':'even';\n  return '<div class=\"card center\"><h2>Toss result</h2><div class=\"coin\"><i>'+t.sum+'</i></div><div class=\"big\">'+t.picks[0]+' + '+t.picks[1]+' = '+t.sum+'</div><p class=\"mut\">That is '+par+'.</p><div class=\"big tcol '+tc(t.winnerTeam)+'\">'+tn(t.winnerTeam)+' win the toss</div><p class=\"mut\" style=\"margin-top:8px\">They bat first.</p></div>';\n}\nfunction builder(kind,team){\n  var mem=S.players.filter(function(p){return p.team===team;});\n  var d=draft[kind],saved=kind==='bat'?S.play.orderBat:S.play.orderBowl,done=S.play.confirmed[kind];\n  if(!d.length&&saved&&saved.length)d=draft[kind]=saved.slice();\n  var h='<div class=\"card\"><h3>'+(kind==='bat'?'Set your batting order':'Set your bowling order (one bowler per over)')+'</h3><p class=\"mut\">Tap players in the order you want. Tap again to remove.</p><div class=\"chips\">';\n  mem.forEach(function(p){var i=d.indexOf(p.id);h+='<button class=\"chip'+(i>=0?' on':'')+'\" data-act=\"dr\" data-k=\"'+kind+'\" data-id=\"'+p.id+'\">'+(i>=0?'<b>'+(i+1)+'</b>':'')+esc(p.name)+'</button>';});\n  h+='</div><div class=\"row2\"><button class=\"alt\" data-act=\"dr-auto\" data-k=\"'+kind+'\">Use join order</button><button data-act=\"dr-ok\" data-k=\"'+kind+'\"'+(d.length===mem.length?'':' disabled')+'>'+(done?'Update order':'Confirm')+'</button></div>'+(done?'<p style=\"margin:8px 0 0;color:var(--ok)\">Order confirmed. You can still change it.</p>':'')+'</div>';\n  return h;\n}\nfunction lineup(){\n  if(draftInnings!==S.innings){draft={bat:[],bowl:[]};draftInnings=S.innings;}\n  var p=S.play,me=S.me,h='';\n  if(S.innings===2)h+=board(true);\n  h+='<div class=\"card\"><h2>Innings '+S.innings+'</h2><p><b class=\"tcol '+tc(p.battingTeam)+'\">'+tn(p.battingTeam)+'</b> bats, <b class=\"tcol '+tc(p.bowlingTeam)+'\">'+tn(p.bowlingTeam)+'</b> bowls.'+(p.target?' Target: <b>'+p.target+'</b>.':'')+'</p><div class=\"chips\">'+lockChip('Batting order',p.confirmed.bat)+lockChip('Bowling order',p.confirmed.bowl)+'</div><p class=\"mut\" style=\"margin:0\">Captains set their order. Any order left unset uses join order when the timer ends.</p></div>';\n  if(me&&me.isCaptain){\n    if(me.team===p.battingTeam)h+=builder('bat',p.battingTeam);\n    else if(me.team===p.bowlingTeam)h+=builder('bowl',p.bowlingTeam);\n  }\n  return h;\n}\nfunction ball(){\n  var p=S.play,me=S.me,h=board(false)+field('ready');\n  var iBat=me&&me.id===p.curBatter,iBowl=me&&me.id===p.curBowler;\n  h+='<div class=\"vs\">'+side('Batter',p.curBatter,iBat,p.batLocked,0,false)+side('Bowler',p.curBowler,iBowl,p.bowlLocked,0,false)+'</div>';\n  if(iBat||iBowl){var m=me.pick;h+='<div class=\"card\"><h3>You are '+(iBat?'batting':'bowling')+'. '+(m===null?'Pick 0 to 10 (no pick counts as 0)':'Locked in: '+m)+'</h3>'+pad('ball',m,m!==null)+'</div>';}\n  else h+='<div class=\"card center mut\">'+nm(p.curBatter)+' is batting against '+nm(p.curBowler)+'.</div>';\n  return h+logCard();\n}\nfunction result(){\n  var p=S.play,lb=p.lastBall,me=S.me;\n  var h=board(false)+field('result');\n  h+='<div class=\"vs\">'+side('Batter',lb.batter,me&&me.id===lb.batter,true,lb.b,true)+side('Bowler',lb.bowler,me&&me.id===lb.bowler,true,lb.w,true)+'</div>';\n  h+='<div class=\"verdict '+(lb.out?'out':'runs')+'\">'+(lb.out?'OUT!':(lb.runs>=6?'WHAT A HIT! +':'+')+lb.runs+(lb.runs===1?' run':' runs'))+'</div>';\n  if(!lb.out&&lb.b===0&&lb.w>0)h+='<p class=\"center mut\">Batter played 0, so the bowler\\'s '+lb.w+' counts as runs.</p>';\n  if(lb.timedOut.bat||lb.timedOut.bowl)h+='<p class=\"center mut\">'+(lb.timedOut.bat?'The batter':'')+(lb.timedOut.bat&&lb.timedOut.bowl?' and ':'')+(lb.timedOut.bowl?'The bowler':'')+' ran out of time and played 0.</p>';\n  return h+logCard();\n}\nfunction brk(){\n  var r=S.play.results[1];\n  return '<div class=\"card center\"><h2>Innings over</h2><div class=\"big tcol '+tc(r.team)+'\">'+tn(r.team)+' '+r.runs+'/'+r.wkts+'</div><p class=\"mut\">in '+ovr(r.balls)+' overs</p><div class=\"big\">Target: '+S.play.target+'</div><p class=\"mut\" style=\"margin:6px 0 0\">'+tn(1-r.team)+' bat next.</p></div>';\n}\nfunction final(){\n  var f=S.final,r=S.play.results,h='<div class=\"card center\"><div class=\"mut\">Match result</div>';\n  h+=f.winner===null?'<div class=\"big\">Match tied</div>':'<div class=\"big tcol '+tc(f.winner)+'\">'+tn(f.winner)+' '+f.text+'</div>';\n  h+='</div><div class=\"teams\">';\n  [1,2].forEach(function(i){var x=r[i];if(x)h+='<div class=\"team '+tc(x.team)+'\"><h3>'+tn(x.team)+'</h3><div class=\"big\">'+x.runs+'/'+x.wkts+'</div><div class=\"mut\">'+ovr(x.balls)+' overs</div></div>';});\n  h+='</div>';\n  if(role==='host')h+='<div class=\"card\" style=\"margin-top:12px\"><button data-act=\"h-restart\">Play again</button></div>';\n  return h;\n}\nfunction rules(){\n  return '<div class=\"card rules\"><h3>The idea</h3><p>Two teams, one ball at a time. The batter and the bowler each secretly pick a number from 0 to 10. If the numbers match, the batter is out. If not, the batter scores.</p>'+\n  '<h3>1. The toss</h3><ul><li>One captain is chosen to call <b>odd</b> or <b>even</b>. The other team gets the opposite.</li><li>Both captains pick a number from 0 to 10 within the time limit. No pick counts as 0.</li><li>The two numbers are added. If the total matches the call, the calling team wins the toss.</li><li>The toss winner bats first.</li></ul>'+\n  '<h3>2. Batting and bowling order</h3><ul><li>The batting captain sets who bats in which order.</li><li>The bowling captain sets who bowls. Each over of 6 balls is bowled by the next bowler in the list.</li><li>Orders not set in time use the order players joined the team.</li></ul>'+\n  '<h3>3. Every ball</h3><ul><li>The batter and the bowler each tap a number from 0 to 10 before the timer ends. No pick counts as 0.</li><li><b>Same number:</b> the batter is OUT.</li><li><b>Different numbers:</b> the batter\\'s number is added to the team score.</li><li><b>Special rule:</b> if the batter plays 0 and the bowler plays a number above 0, the bowler\\'s number is added to the score.</li></ul>'+\n  '<table class=\"ex\"><tr><th>Batter</th><th>Bowler</th><th>Result</th></tr><tr><td>4</td><td>2</td><td>+4 runs</td></tr><tr><td>3</td><td>3</td><td>OUT</td></tr><tr><td>0</td><td>5</td><td>+5 runs (bowler\\'s number)</td></tr><tr><td>0</td><td>0</td><td>OUT</td></tr><tr><td>no pick</td><td>6</td><td>+6 runs (no pick counts as 0)</td></tr></table>'+\n  '<h3>4. Innings and the chase</h3><ul><li>An innings ends when all overs are bowled or every batter is out.</li><li>The second team then bats and must beat the target, which is the first team\\'s score plus 1.</li><li>The match ends as soon as the chasing team passes the target. Equal scores are a tie.</li></ul>'+\n  '<h3>Tips</h3><ul><li>Change your numbers often. Bowlers who repeat get caught.</li><li>Tap fast. The timer is short.</li><li>Tap the speaker button to turn sound on or off.</li></ul></div>';\n}\n\nfunction gameHTML(){\n  if(!S)return landingHTML();\n  switch(S.phase){\n    case 'lobby':return role==='host'?hostLobby():playerLobby();\n    case 'toss_call':return tossCall()+(role==='host'?hostBar():'');\n    case 'toss_num':return tossNum()+(role==='host'?hostBar():'');\n    case 'toss_result':return tossResult()+(role==='host'?hostBar():'');\n    case 'lineup':return lineup()+(role==='host'?hostBar():'');\n    case 'ball':return ball()+(role==='host'?hostBar():'');\n    case 'result':return result()+(role==='host'?hostBar():'');\n    case 'break':return brk()+(role==='host'?hostBar():'');\n    case 'final':return final()+(role==='host'?hostBar():'');\n  }\n  return '';\n}\n\nfunction render(force){\n  var sig=tab+'|'+role+'|'+armed+'|'+msg+'|'+landing+'|'+(S?JSON.stringify(S,function(k,v){return k==='now'?undefined:v;}):'');\n  if(!force&&sig===lastSig)return;\n  lastSig=sig;\n  document.body.className=(role==='host'||PATH_HOST)?'host':'';\n  $('room').textContent=S?'Room '+S.code:'';\n  $('tabGame').className=tab==='game'?'on':'';$('tabRules').className=tab==='rules'?'on':'';\n  var keep=null,ae=document.activeElement;\n  if(ae&&ae.id&&$('app').contains(ae)&&(ae.tagName==='INPUT')){keep={id:ae.id,v:ae.value,s:ae.selectionStart,e:ae.selectionEnd};}\n  $('app').innerHTML=tab==='rules'?rules():gameHTML();\n  if(keep){var el=$(keep.id);if(el){el.value=keep.v;el.focus();try{el.setSelectionRange(keep.s,keep.e);}catch(x){}}}\n  syncHint();\n}\n\n/* ---------- clicks ---------- */\nfunction arm(name){armed=name;clearTimeout(armTimer);armTimer=setTimeout(function(){armed=null;render(true);},4000);render(true);}\ndocument.addEventListener('click',async function(e){\n  ctx();syncHint();\n  if(e.target.id==='snd'){muted=!muted;store.set('hcMute',muted?'1':'0');syncHint();if(!muted){ctx();SND.ding();}return;}\n  var b=e.target.closest&&e.target.closest('[data-act]');\n  if(!b||b.disabled)return;\n  var a=b.dataset.act,k=b.dataset.k;\n  if(a==='tab'){tab=b.dataset.t;render(true);}\n  else if(a==='l-host')await hostGame();\n  else if(a==='l-join'){landing='join';render(true);}\n  else if(a==='join')await joinGame();\n  else if(a==='team')await doAct('team',{team:+b.dataset.t});\n  else if(a==='call')await doAct('call',{choice:b.dataset.c});\n  else if(a==='tosspick'||a==='ball'){SND.lock();S.me.pick=+b.dataset.n;render(true);await doAct(a,{n:+b.dataset.n});}\n  else if(a==='dr'){var d=draft[k],i=d.indexOf(b.dataset.id);if(i>=0)d.splice(i,1);else d.push(b.dataset.id);render(true);}\n  else if(a==='dr-auto'){var team=k==='bat'?S.play.battingTeam:S.play.bowlingTeam;draft[k]=S.players.filter(function(p){return p.team===team;}).map(function(p){return p.id;});render(true);}\n  else if(a==='dr-ok')await doAct('order',{kind:k,order:draft[k]});\n  else if(a==='h-start')await doAct('start');\n  else if(a==='h-lock')await doAct('lock',{locked:!S.locked});\n  else if(a==='h-kick')await doAct('kick',{id:b.dataset.id});\n  else if(a==='h-move')await doAct('move',{id:b.dataset.id,team:+b.dataset.t});\n  else if(a==='h-cap')await doAct('captain',{id:b.dataset.id});\n  else if(a==='h-restart')await doAct('restart');\n  else if(a==='h-end'){if(armed==='end'){armed=null;await doAct('endmatch');render(true);}else arm('end');}\n  else if(a==='h-close'){if(armed==='close'){armed=null;await doAct('close');}else arm('close');}\n  else if(a==='h-copy'){\n    var local=/^(localhost|127\\.)/.test(location.hostname),base=(local&&info.urls[0])?info.urls[0]:location.origin,link=base+'/?room='+S.code;\n    try{await navigator.clipboard.writeText(link);b.textContent='Copied';}catch(x){b.textContent='Copy it from the text on the left';}\n  }\n});\ndocument.addEventListener('change',function(e){\n  if(['sOv','sBs','tnA','tnB'].indexOf(e.target.id)>=0)postSettings();\n});\ndocument.addEventListener('keydown',function(e){\n  if(e.key==='Enter'&&(e.target.id==='nm'||e.target.id==='rc'))joinGame();\n});\n\n/* ---------- start ---------- */\nasync function boot(){\n  try{info=await (await fetch('/api/info')).json();}catch(e){}\n  var hs=parse(store.get('hcHost')),ps=parse(store.get('hcPlayer'));\n  if(PATH_HOST){\n    if(hs&&hs.code){role='host';code=hs.code;hostKey=hs.key;connect();}else await hostGame();\n  }else if(ps&&ps.code){role='player';code=ps.code;pid=ps.pid;connect();}\n  else if(hs&&hs.code){role='host';code=hs.code;hostKey=hs.key;connect();}\n  else render(true);\n  syncHint();\n}\nboot();\n})();\n</script></body></html>\n","style.css":"/* Layout: a cricket ground. Striped outfield behind, dark-green panels, a stadium scoreboard and a pitch graphic. */\n:root{\n  --grass1:#14502c;--grass2:#18592f;--panel:rgba(6,32,18,.86);--panel2:rgba(255,255,255,.08);--line:rgba(246,241,225,.18);\n  --cream:#f6f1e1;--mute:#a9c4b2;--pitch:#cfa96d;--leather:#b3202a;--board:#0a0e0b;--amber:#ffb400;\n  --ta:#ffcf3f;--tb:#63c7ff;--ok:#6be3a0;--bad:#ff6b6b;--btn:#f6f1e1;--btn-ink:#0b2a17;\n  --display:\"Oswald\",\"Arial Narrow\",\"Impact\",system-ui,sans-serif;\n  --body:\"Inter\",system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;\n}\n*{box-sizing:border-box}\nhtml,body{margin:0}\nbody{color:var(--cream);font-family:var(--body);line-height:1.45;min-height:100vh;\n  background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,0) 220px),repeating-linear-gradient(90deg,var(--grass1) 0 64px,var(--grass2) 64px 128px);background-color:var(--grass1)}\n.wrap{max-width:660px;margin:0 auto;padding:12px 16px 56px}\n.host .wrap{max-width:1040px}\nheader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}\n.brand{display:flex;align-items:center;gap:10px;min-width:0}\n.logo{width:34px;height:34px;flex:none}\nh1{margin:0;font-family:var(--display);font-weight:700;font-size:1.5rem;letter-spacing:.06em;text-transform:uppercase;line-height:1}\nh1 span{color:var(--ta)}\n.room{color:var(--mute);font-size:.75rem;text-transform:uppercase;letter-spacing:.14em}\n.hr{display:flex;align-items:center;gap:8px}\n.timer{font-family:var(--display);font-size:2.2rem;font-weight:700;color:var(--amber);font-variant-numeric:tabular-nums;min-width:1.4ch;text-align:right;text-shadow:0 0 12px rgba(255,180,0,.45)}\n.timer.low{color:#ff6b6b;animation:blink 1s steps(2) infinite}\n.icon{width:42px;height:42px;padding:0;margin:0;border-radius:50%;background:var(--panel);color:var(--cream);border:1px solid var(--line);font-size:1.1rem;flex:none}\n.tabs{display:flex;gap:8px;margin-bottom:12px}\n.tabs button{flex:1;margin:0;background:var(--panel);color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:10px;font-family:var(--display);font-size:1rem;letter-spacing:.08em;text-transform:uppercase}\n.tabs button.on{background:var(--cream);color:var(--btn-ink)}\nh2{margin:0 0 8px;font-family:var(--display);font-weight:600;font-size:1.5rem;letter-spacing:.03em;line-height:1.15}\nh3{margin:0 0 6px;font-family:var(--display);font-weight:600;font-size:1.1rem;letter-spacing:.04em;text-transform:uppercase}\np{margin:0 0 10px}\n.mut{color:var(--mute)}\n.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px;min-width:0;animation:rise .35s ease both}\n.ta{--tc:var(--ta)}\n.tb{--tc:var(--tb)}\n.tcol{color:var(--tc)}\n.center{text-align:center}\n.code{font-family:var(--display);font-size:clamp(3.8rem,15vw,7.5rem);font-weight:700;letter-spacing:.16em;color:var(--ta);text-align:center;line-height:1.05;text-shadow:0 0 22px rgba(255,207,63,.35)}\n.big{font-family:var(--display);font-size:2.3rem;font-weight:700;line-height:1.1;overflow-wrap:anywhere}\ninput,select{width:100%;font:inherit;color:#111;background:#fff;border:0;border-radius:10px;padding:12px 14px;margin-bottom:10px}\nbutton{font:inherit;font-weight:700;border:0;border-radius:12px;padding:13px 16px;cursor:pointer;width:100%;background:var(--btn);color:var(--btn-ink);margin-top:4px}\nbutton.alt{background:var(--panel2);color:var(--cream);border:1px solid var(--line)}\nbutton.danger{background:#7d1f26;color:#fff}\nbutton.sm{width:auto;padding:6px 10px;font-size:.8rem;margin:0;border-radius:8px}\nbutton:disabled{opacity:.45;cursor:default}\nbutton:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--ta);outline-offset:2px}\n.err{color:var(--bad);min-height:1.2em;margin:0 0 6px;font-size:.9rem}\nlabel.l{display:block;font-size:.8rem;color:var(--mute);margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em}\n.row2{display:flex;gap:10px}.row2>*{flex:1;min-width:0}\n.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.choose{display:grid;gap:12px}\n\n/* teams and lobby */\n.teams{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.team{background:var(--panel);border:2px solid var(--tc);border-radius:14px;padding:14px;min-width:0}\n.team h3{color:var(--tc)}\n.team ul{list-style:none;margin:0 0 8px;padding:0}\n.team li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}\n.team li:last-child{border-bottom:0}\n.team li .acts{display:flex;gap:4px;flex:none}\n.cap{font-family:var(--display);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;background:var(--tc);color:#111;border-radius:6px;padding:1px 6px;margin-left:6px}\n.off{opacity:.45}\n.team button.join{background:var(--tc);color:#111}\n.invite{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}\n\n/* scoreboard */\n.board{background:var(--board);border:2px solid var(--tc,#555);border-radius:14px;padding:12px 16px;margin-bottom:12px;box-shadow:inset 0 0 30px rgba(0,0,0,.6);animation:rise .35s ease both}\n.board .tn{font-family:var(--display);color:var(--tc);letter-spacing:.14em;text-transform:uppercase;font-size:.85rem}\n.board .rs{font-family:var(--display);font-size:3.6rem;font-weight:700;line-height:1;color:var(--amber);text-shadow:0 0 16px rgba(255,180,0,.5);font-variant-numeric:tabular-nums}\n.board .rs.bump{animation:pop .5s ease}\n.board .meta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;color:var(--mute);font-size:.9rem}\n.board .need{margin-top:6px;font-family:var(--display);letter-spacing:.05em;color:var(--ok);font-size:1.05rem}\n.over{display:flex;gap:6px;margin-top:8px}\n.dotb{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-family:var(--display);font-size:.9rem;background:#1b2a21;color:var(--cream);border:1px solid #3b5a47}\n.dotb.w{background:var(--bad);color:#fff;border-color:var(--bad)}\n.dotb.big6{background:var(--ok);color:#06281a;border-color:var(--ok)}\n\n/* pitch */\n.field{position:relative;margin-bottom:12px;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.18);border:1px solid var(--line)}\n.field svg{display:block;width:100%;max-height:340px}\n.host .field svg{max-height:420px}\n.stump{fill:#f6e9c0}\n.bail{fill:#e8d28a}\n.ball .c{fill:var(--leather)}\n.ball .s{fill:none;stroke:#fff;stroke-width:1.2;opacity:.8}\n.ball{transform:translate(120px,238px)}\n.ready .ball{animation:bob 1.1s ease-in-out infinite}\n.deliver .ball{animation:deliver .7s cubic-bezier(.3,.1,.5,1) forwards}\n.deliver.hit .ball{animation:deliver .7s cubic-bezier(.3,.1,.5,1) forwards,fly .9s ease-out .7s forwards}\n.deliver.hit.sixer .ball{animation:deliver .7s cubic-bezier(.3,.1,.5,1) forwards,flyhigh 1.3s ease-out .7s forwards}\n.deliver.wicket .ball{animation:deliver .7s cubic-bezier(.3,.1,.5,1) forwards,through .5s ease-out .7s forwards}\n.deliver.wicket .s1{animation:fall1 .7s ease-out .68s forwards}\n.deliver.wicket .s2{animation:fall2 .7s ease-out .68s forwards}\n.deliver.wicket .s3{animation:fall3 .7s ease-out .68s forwards}\n.deliver.wicket .bail{animation:bailfly .9s ease-out .68s forwards}\n.s1,.s2,.s3{transform-box:fill-box;transform-origin:50% 100%}\n.bailL{transform-box:fill-box;transform-origin:50% 50%}\n.batter-fig{transform-box:fill-box;transform-origin:50% 100%}\n.deliver.hit .batter-fig{animation:swing .5s ease-out .55s both}\n.pop{position:absolute;left:0;right:0;top:34%;text-align:center;font-family:var(--display);font-weight:700;font-size:4rem;line-height:1;pointer-events:none;animation:floatup 1.6s ease-out .8s both;text-shadow:0 3px 12px rgba(0,0,0,.6);opacity:0}\n.pop.run{color:var(--ok)}\n.pop.out{color:var(--bad);font-size:4.6rem}\n.shake{animation:shake .5s ease .75s}\n\n/* ball by ball */\n.vs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}\n.side{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;text-align:center;min-width:0;animation:rise .35s ease both}\n.side.me{border-color:var(--ta);box-shadow:0 0 0 2px rgba(255,207,63,.25)}\n.side .role{color:var(--mute);font-size:.72rem;text-transform:uppercase;letter-spacing:.14em}\n.side .who{font-family:var(--display);font-weight:600;font-size:1.25rem;overflow-wrap:anywhere}\n.side .st{font-size:.85rem;margin-top:4px;color:var(--mute)}\n.side .st.ok{color:var(--ok);font-weight:700}\n.side .num{font-family:var(--display);font-size:4.4rem;font-weight:700;line-height:1.1;color:var(--ta);animation:flip .55s ease both}\n.side.bowl .num{animation-delay:.12s}\n.verdict{text-align:center;font-family:var(--display);font-size:2.4rem;font-weight:700;letter-spacing:.04em;margin:2px 0 8px;animation:pop .5s ease .7s both}\n.verdict.out{color:var(--bad)}\n.verdict.runs{color:var(--ok)}\n.pad{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}\n.pad button{margin:0;padding:16px 0;font-family:var(--display);font-size:1.9rem;background:var(--panel2);color:var(--cream);border:2px solid var(--line)}\n.pad button.sel{background:var(--ta);color:#241a00;border-color:var(--ta)}\n.pad button:disabled{opacity:.5}\n.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}\n.chip{display:inline-flex;align-items:center;gap:8px;background:var(--panel2);border:2px solid var(--line);border-radius:999px;padding:8px 14px;font:inherit;font-weight:700;color:var(--cream);width:auto;margin:0}\n.chip b{display:inline-flex;align-items:center;justify-content:center;min-width:1.6em;height:1.6em;border-radius:50%;background:var(--ta);color:#241a00;font-size:.85rem}\n.chip.on{border-color:var(--ta)}\n.log{list-style:none;margin:0;padding:0;font-size:.9rem}\n.log li{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--line)}\n.log li:last-child{border-bottom:0}\n.log .o{color:var(--bad);font-weight:800}\n.log .r{color:var(--ok);font-weight:800}\n\n/* toss coin */\n.coin{width:120px;height:120px;margin:6px auto 12px;perspective:600px}\n.coin i{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;font-style:normal;font-family:var(--display);font-size:3rem;font-weight:700;color:#4a3300;background:radial-gradient(circle at 35% 30%,#ffe58a,#d9a521 70%,#a87400);border:4px solid #f3c744;box-shadow:0 6px 18px rgba(0,0,0,.5);animation:coin 1.1s ease-out both}\n\n/* rules */\n.rules h3{margin-top:14px;color:var(--ta)}\n.rules h3:first-child{margin-top:0}\n.rules ul,.rules ol{margin:0 0 10px;padding-left:1.2em}\n.rules li{margin:4px 0}\ntable.ex{width:100%;border-collapse:collapse;font-size:.9rem;margin:6px 0 10px}\ntable.ex th,table.ex td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}\ntable.ex th{color:var(--mute);font-weight:600;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em}\n\n#fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50}\n.hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);padding:8px 14px;border-radius:999px;font-size:.85rem;color:var(--mute);z-index:20}\n\n@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}\n@keyframes pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.18);opacity:1}100%{transform:scale(1);opacity:1}}\n@keyframes flip{0%{transform:rotateX(90deg) scale(.7);opacity:0}100%{transform:none;opacity:1}}\n@keyframes blink{50%{opacity:.35}}\n@keyframes bob{0%,100%{transform:translate(120px,238px)}50%{transform:translate(120px,229px)}}\n@keyframes deliver{0%{transform:translate(120px,238px) scale(1)}55%{transform:translate(120px,130px) scale(.8)}100%{transform:translate(120px,84px) scale(1)}}\n@keyframes fly{0%{transform:translate(120px,84px)}100%{transform:translate(250px,-40px) scale(.5);opacity:0}}\n@keyframes flyhigh{0%{transform:translate(120px,84px)}60%{transform:translate(200px,-50px) scale(1.3)}100%{transform:translate(260px,-120px) scale(.4);opacity:0}}\n@keyframes through{0%{transform:translate(120px,84px)}100%{transform:translate(122px,10px) scale(.6);opacity:.2}}\n@keyframes fall1{to{transform:rotate(-70deg) translate(-8px,6px)}}\n@keyframes fall2{to{transform:rotate(12deg) translate(0,22px)}}\n@keyframes fall3{to{transform:rotate(75deg) translate(8px,6px)}}\n@keyframes bailfly{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(18px,-34px) rotate(200deg);opacity:0}}\n@keyframes swing{0%{transform:rotate(0)}50%{transform:rotate(-60deg)}100%{transform:rotate(-20deg)}}\n@keyframes floatup{0%{opacity:0;transform:translateY(20px) scale(.7)}25%{opacity:1;transform:translateY(0) scale(1.1)}100%{opacity:0;transform:translateY(-50px) scale(1)}}\n@keyframes shake{0%,100%{transform:translate(0)}20%{transform:translate(-6px,2px)}40%{transform:translate(6px,-2px)}60%{transform:translate(-4px,1px)}80%{transform:translate(4px,-1px)}}\n@keyframes coin{0%{transform:translateY(60px) rotateX(0)}60%{transform:translateY(-30px) rotateX(1080deg)}100%{transform:translateY(0) rotateX(1440deg)}}\n\n@media (max-width:440px){.teams,.grid2{grid-template-columns:1fr}.pad{gap:8px}.board .rs{font-size:3.1rem}}\n@media (prefers-reduced-motion:reduce){\n  *,*::before,*::after{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important}\n}\n@media (max-width:600px){.field svg{max-height:230px}}\n"};
const GZ = {};
for (const k of Object.keys(ASSETS)) GZ[k] = zlib.gzipSync(ASSETS[k]);

const PORT = +process.env.PORT || 3000;
const K = +process.env.SPEED_SCALE || 1;            // only used for fast testing
const BASE = { GRACE: 700, RESULT: 4500, TOSS_CALL: 15000, TOSS_SHOW: 5000, LINEUP: 60000, BREAK: 6000, HOST_GRACE: 30000 };
const T = k => BASE[k] * K;
const BALLS_PER_OVER = 6, MAX_PLAYERS = 12, MAX_NUM = 10;
const rooms = new Map();

const rnd = n => Math.random() * n | 0;
const validNum = n => Number.isInteger(n) && n >= 0 && n <= MAX_NUM;
const clamp = (n, lo, hi, d) => { n = Math.round(+n); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const ballMs = r => r.ballSec * 1000 * K;

function makeCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => L[rnd(L.length)]).join(''); } while (rooms.has(c));
  return c;
}

function createRoom() {
  const r = {
    code: makeCode(), hostKey: crypto.randomBytes(12).toString('hex'), hostConns: 0, hostTimer: null,
    phase: 'lobby', players: new Map(), clients: new Set(), locked: false,
    overs: 2, ballSec: 5, teamNames: ['Team A', 'Team B'],
    innings: 0, toss: null, battingTeam: null, bowlingTeam: null,
    score: { runs: 0, wkts: 0, balls: 0 }, target: null, results: {}, log: [], lastBall: null,
    orderBat: null, orderBowl: null, confirmed: { bat: false, bowl: false },
    cur: { batter: null, bowler: null }, picks: { bat: null, bowl: null },
    final: null, deadline: 0, timer: null, last: Date.now()
  };
  rooms.set(r.code, r);
  return r;
}

const membersOf = (r, t) => [...r.players.values()].filter(p => p.team === t).sort((a, b) => a.teamAt - b.teamAt);
const capOf = (r, t) => { const m = membersOf(r, t); return m.length ? m[0].id : null; };

function schedule(r, ms, fn) {
  clearTimeout(r.timer);
  r.deadline = Date.now() + ms;
  r.timer = setTimeout(() => { try { fn(r); } catch (e) { console.error(e); } }, ms);
}

// ---------- state sent to clients (never includes hidden picks) ----------
function view(r, pid, isHost) {
  const caps = [capOf(r, 0), capOf(r, 1)];
  const v = {
    code: r.code, phase: r.phase, overs: r.overs, ballSec: r.ballSec, teamNames: r.teamNames, locked: r.locked,
    innings: r.innings, deadline: r.deadline, now: Date.now(), isHost: !!isHost,
    players: [...r.players.values()].sort((a, b) => (a.teamAt || a.at) - (b.teamAt || b.at)).map(p => ({
      id: p.id, name: p.name, team: p.team, connected: p.conns > 0,
      captain: p.team !== null && caps[p.team] === p.id
    }))
  };
  const me = pid && r.players.get(pid);
  if (me) {
    v.me = { id: me.id, name: me.name, team: me.team, isCaptain: me.team !== null && caps[me.team] === me.id, pick: null };
  }
  if (r.toss) {
    const t = r.toss, reveal = r.phase === 'toss_result';
    v.toss = {
      callerTeam: t.callerTeam, choice: t.choice, locked: [t.picks[0] !== null, t.picks[1] !== null],
      picks: reveal ? t.picks : null, sum: reveal ? t.sum : null, winnerTeam: reveal ? t.winnerTeam : null
    };
    if (me && me.team !== null && v.me.isCaptain && r.phase === 'toss_num') v.me.pick = t.picks[me.team];
  }
  if (r.innings >= 1) {
    const inLineup = r.phase === 'lineup';
    const own = team => me && v.me.isCaptain && me.team === team;
    v.play = {
      battingTeam: r.battingTeam, bowlingTeam: r.bowlingTeam, runs: r.score.runs, wkts: r.score.wkts, balls: r.score.balls,
      target: r.target, curBatter: r.cur.batter, curBowler: r.cur.bowler, lastBall: r.lastBall, log: r.log.slice(0, 8),
      results: r.results, confirmed: r.confirmed,
      batLocked: r.picks.bat !== null, bowlLocked: r.picks.bowl !== null,
      orderBat: (!inLineup || own(r.battingTeam)) ? r.orderBat : null,
      orderBowl: (!inLineup || own(r.bowlingTeam)) ? r.orderBowl : null
    };
    if (me && r.phase === 'ball') {
      if (me.id === r.cur.batter) v.me.pick = r.picks.bat;
      else if (me.id === r.cur.bowler) v.me.pick = r.picks.bowl;
    }
  }
  if (r.phase === 'final') v.final = r.final;
  return v;
}

function send(c, r) { c.res.write('data: ' + JSON.stringify(view(r, c.pid, c.isHost)) + '\n\n'); }

function broadcast(r) {
  for (const c of [...r.clients]) {
    if (c.pid && !r.players.has(c.pid)) {            // removed by the host
      c.res.write('event: kicked\ndata: {}\n\n'); c.res.end(); r.clients.delete(c); continue;
    }
    send(c, r);
  }
}

function closeRoom(r, reason) {
  clearTimeout(r.timer); clearTimeout(r.hostTimer);
  for (const c of [...r.clients]) { try { c.res.write('event: closed\ndata: ' + JSON.stringify({ reason }) + '\n\n'); c.res.end(); } catch (e) {} }
  r.clients.clear();
  rooms.delete(r.code);
}

// ---------- toss ----------
function startMatch(r) {
  r.innings = 0; r.results = {}; r.target = null; r.final = null;
  r.log = []; r.lastBall = null; r.battingTeam = r.bowlingTeam = null;
  r.toss = { callerTeam: rnd(2), choice: null, picks: [null, null], sum: null, winnerTeam: null };
  r.phase = 'toss_call';
  schedule(r, T('TOSS_CALL'), rr => setCall(rr, Math.random() < 0.5 ? 'odd' : 'even'));
  broadcast(r);
}

function setCall(r, choice) {
  if (r.phase !== 'toss_call') return;
  r.toss.choice = choice;
  r.phase = 'toss_num';
  schedule(r, ballMs(r) + T('GRACE'), resolveToss);
  r.deadline = Date.now() + ballMs(r);
  broadcast(r);
}

function resolveToss(r) {
  if (r.phase !== 'toss_num') return;
  const t = r.toss;
  t.picks = t.picks.map(p => (p === null ? 0 : p));
  t.sum = t.picks[0] + t.picks[1];
  const parity = t.sum % 2 === 1 ? 'odd' : 'even';
  t.winnerTeam = parity === t.choice ? t.callerTeam : 1 - t.callerTeam;
  r.phase = 'toss_result';
  schedule(r, T('TOSS_SHOW'), rr => beginInnings(rr, rr.toss.winnerTeam));
  broadcast(r);
}

// ---------- innings ----------
function beginInnings(r, battingTeam) {
  r.innings++;
  r.battingTeam = battingTeam; r.bowlingTeam = 1 - battingTeam;
  r.score = { runs: 0, wkts: 0, balls: 0 };
  r.log = []; r.lastBall = null;
  r.orderBat = r.orderBowl = null;
  r.confirmed = { bat: false, bowl: false };
  r.cur = { batter: null, bowler: null };
  r.phase = 'lineup';
  schedule(r, T('LINEUP'), finishLineup);
  broadcast(r);
}

function finishLineup(r) {
  if (r.phase !== 'lineup') return;
  if (!r.orderBat) r.orderBat = membersOf(r, r.battingTeam).map(p => p.id);
  if (!r.orderBowl) r.orderBowl = membersOf(r, r.bowlingTeam).map(p => p.id);
  r.confirmed = { bat: true, bowl: true };
  startBall(r);
}

function startBall(r) {
  const s = r.score;
  r.cur = {
    batter: r.orderBat[s.wkts],
    bowler: r.orderBowl[Math.floor(s.balls / BALLS_PER_OVER) % r.orderBowl.length]
  };
  r.picks = { bat: null, bowl: null };
  r.phase = 'ball';
  schedule(r, ballMs(r) + T('GRACE'), resolveBall);
  r.deadline = Date.now() + ballMs(r);
  broadcast(r);
}

function resolveBall(r) {
  if (r.phase !== 'ball') return;
  const b = r.picks.bat === null ? 0 : r.picks.bat;
  const w = r.picks.bowl === null ? 0 : r.picks.bowl;
  const out = b === w;
  const runs = out ? 0 : (b === 0 ? w : b);       // batter 0 and bowler not 0: the bowler's number is scored
  const s = r.score;
  const over = Math.floor(s.balls / BALLS_PER_OVER), ball = s.balls % BALLS_PER_OVER + 1;
  s.balls++;
  if (out) s.wkts++; else s.runs += runs;
  r.lastBall = {
    over, ball, batter: r.cur.batter, bowler: r.cur.bowler, b, w, out, runs,
    timedOut: { bat: r.picks.bat === null, bowl: r.picks.bowl === null }
  };
  r.log.unshift({ label: over + '.' + ball, batter: r.cur.batter, bowler: r.cur.bowler, b, w, out, runs });
  r.phase = 'result';
  schedule(r, T('RESULT'), afterBall);
  r.deadline = 0;
  broadcast(r);
}

function afterBall(r) {
  if (r.phase !== 'result') return;
  const s = r.score, size = membersOf(r, r.battingTeam).length;
  const over = s.wkts >= size || s.balls >= r.overs * BALLS_PER_OVER || (r.innings === 2 && s.runs >= r.target);
  if (over) endInnings(r); else startBall(r);
}

function endInnings(r) {
  const s = r.score;
  r.results[r.innings] = { team: r.battingTeam, runs: s.runs, wkts: s.wkts, balls: s.balls };
  if (r.innings === 1) {
    r.target = s.runs + 1;
    r.phase = 'break';
    schedule(r, T('BREAK'), rr => beginInnings(rr, 1 - rr.battingTeam));
    return broadcast(r);
  }
  const first = r.results[1], second = r.results[2];
  const size = membersOf(r, second.team).length;
  let winner, text;
  if (second.runs >= r.target) { winner = second.team; const left = size - second.wkts; text = 'won by ' + left + ' wicket' + (left === 1 ? '' : 's'); }
  else if (second.runs === first.runs) { winner = null; text = 'Match tied'; }
  else { winner = first.team; const d = first.runs - second.runs; text = 'won by ' + d + ' run' + (d === 1 ? '' : 's'); }
  r.final = { winner, text };
  r.phase = 'final'; r.deadline = 0; clearTimeout(r.timer);
  broadcast(r);
}

function toLobby(r) {
  clearTimeout(r.timer);
  r.phase = 'lobby'; r.innings = 0; r.toss = null; r.deadline = 0; r.final = null; r.lastBall = null;
  broadcast(r);
}

// ---------- HTTP ----------
const STATIC = {
  '/': ['app.html', 'text/html; charset=utf-8'], '/host': ['app.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8']
};

function json(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push('http://' + i.address + ':' + PORT);
  return out;
}

const isHostReq = (r, b) => typeof b.key === 'string' && b.key.length > 0 && b.key === r.hostKey;
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 14);

function act(r, b) {
  const p = r.players.get(b.pid);
  const host = isHostReq(r, b);
  switch (b.type) {
    // ----- host controls -----
    case 'settings': {
      if (!host) return { error: 'not_allowed' };
      if (r.phase !== 'lobby') return { error: 'bad_phase' };
      r.overs = clamp(b.overs, 1, 10, r.overs);
      r.ballSec = clamp(b.ballSec, 3, 10, r.ballSec);
      if (Array.isArray(b.names)) {
        const a = cleanName(b.names[0]), c = cleanName(b.names[1]);
        if (a) r.teamNames[0] = a;
        if (c) r.teamNames[1] = c;
        if (r.teamNames[0].toLowerCase() === r.teamNames[1].toLowerCase()) r.teamNames[1] = r.teamNames[1] + ' 2';
      }
      broadcast(r); return { ok: true };
    }
    case 'lock': {
      if (!host) return { error: 'not_allowed' };
      r.locked = !!b.locked; broadcast(r); return { ok: true };
    }
    case 'kick': {
      if (!host || r.phase !== 'lobby') return { error: 'not_allowed' };
      if (!r.players.delete(b.id)) return { error: 'no_player' };
      broadcast(r); return { ok: true };
    }
    case 'move': {
      if (!host || r.phase !== 'lobby') return { error: 'not_allowed' };
      const q = r.players.get(b.id);
      if (!q || ![0, 1, null].includes(b.team)) return { error: 'bad_args' };
      q.team = b.team; q.teamAt = b.team === null ? 0 : Date.now();
      broadcast(r); return { ok: true };
    }
    case 'captain': {
      if (!host || r.phase !== 'lobby') return { error: 'not_allowed' };
      const q = r.players.get(b.id);
      if (!q || q.team === null) return { error: 'bad_args' };
      const first = membersOf(r, q.team)[0];
      q.teamAt = first.teamAt - 1;
      broadcast(r); return { ok: true };
    }
    case 'start': {
      if (!host) return { error: 'not_allowed' };
      if (r.phase !== 'lobby') return { error: 'bad_phase' };
      if ([...r.players.values()].some(x => x.team === null)) return { error: 'unassigned' };
      if (!membersOf(r, 0).length || !membersOf(r, 1).length) return { error: 'need_both_teams' };
      startMatch(r); return { ok: true };
    }
    case 'endmatch': {
      if (!host) return { error: 'not_allowed' };
      if (r.phase === 'lobby') return { error: 'bad_phase' };
      toLobby(r); return { ok: true };
    }
    case 'restart': {
      if (!host) return { error: 'not_allowed' };
      if (r.phase !== 'final') return { error: 'bad_phase' };
      toLobby(r); return { ok: true };
    }
    case 'close': {
      if (!host) return { error: 'not_allowed' };
      closeRoom(r, 'host_closed'); return { ok: true };
    }
    // ----- player actions -----
    case 'team': {
      if (r.phase !== 'lobby' || !p) return { error: 'bad_phase' };
      if (b.team !== 0 && b.team !== 1) return { error: 'bad_team' };
      p.team = b.team; p.teamAt = Date.now();
      broadcast(r); return { ok: true };
    }
    case 'call': {
      if (r.phase !== 'toss_call' || !p || p.id !== capOf(r, r.toss.callerTeam)) return { error: 'not_allowed' };
      if (b.choice !== 'odd' && b.choice !== 'even') return { error: 'bad_choice' };
      setCall(r, b.choice); return { ok: true };
    }
    case 'tosspick': {
      if (r.phase !== 'toss_num' || !p || p.team === null || p.id !== capOf(r, p.team)) return { error: 'not_allowed' };
      if (!validNum(b.n) || r.toss.picks[p.team] !== null) return { error: 'bad_pick' };
      r.toss.picks[p.team] = b.n;
      if (r.toss.picks[0] !== null && r.toss.picks[1] !== null) resolveToss(r); else broadcast(r);
      return { ok: true };
    }
    case 'order': {
      if (r.phase !== 'lineup' || !p) return { error: 'bad_phase' };
      const kind = b.kind;
      if (kind !== 'bat' && kind !== 'bowl') return { error: 'bad_kind' };
      const team = kind === 'bat' ? r.battingTeam : r.bowlingTeam;
      if (p.team !== team || p.id !== capOf(r, team)) return { error: 'not_allowed' };
      const ids = membersOf(r, team).map(m => m.id);
      const order = Array.isArray(b.order) ? b.order : [];
      if (order.length !== ids.length || !ids.every(i => order.includes(i)) || new Set(order).size !== order.length) return { error: 'bad_order' };
      if (kind === 'bat') { r.orderBat = order; r.confirmed.bat = true; } else { r.orderBowl = order; r.confirmed.bowl = true; }
      if (r.confirmed.bat && r.confirmed.bowl) startBall(r); else broadcast(r);
      return { ok: true };
    }
    case 'ball': {
      if (r.phase !== 'ball' || !p) return { error: 'bad_phase' };
      if (!validNum(b.n)) return { error: 'bad_pick' };
      const slot = p.id === r.cur.batter ? 'bat' : p.id === r.cur.bowler ? 'bowl' : null;
      if (!slot || r.picks[slot] !== null) return { error: 'not_allowed' };
      r.picks[slot] = b.n;
      if (r.picks.bat !== null && r.picks.bowl !== null) resolveBall(r); else broadcast(r);
      return { ok: true };
    }
  }
  return { error: 'unknown' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  if (req.method === 'GET' && STATIC[path]) {
    const [name, type] = STATIC[path];
    const h = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Vary': 'Accept-Encoding' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      h['Content-Encoding'] = 'gzip';
      res.writeHead(200, h); return res.end(GZ[name]);
    }
    res.writeHead(200, h);
    return res.end(ASSETS[name]);
  }
  if (req.method === 'GET' && path === '/api/info') return json(res, { urls: lanUrls() });

  if (req.method === 'GET' && path === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const r = rooms.get((url.searchParams.get('code') || '').toUpperCase());
    const pid = url.searchParams.get('pid') || null;
    const asHost = url.searchParams.get('role') === 'host';
    const bad = !r || (asHost && url.searchParams.get('key') !== r.hostKey) || (!asHost && pid && !r.players.has(pid));
    if (bad) { res.write('event: gone\ndata: {}\n\n'); return res.end(); }
    const client = { res, pid: asHost ? null : pid, isHost: asHost };
    r.clients.add(client);
    if (asHost) { r.hostConns++; clearTimeout(r.hostTimer); }
    else if (pid) r.players.get(pid).conns++;
    r.last = Date.now();
    send(client, r);
    if (!asHost && pid) broadcast(r);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      r.clients.delete(client);
      if (asHost) {
        r.hostConns--;
        // The room closes when the host leaves (the short wait allows a page refresh).
        if (r.hostConns <= 0 && rooms.get(r.code) === r) r.hostTimer = setTimeout(() => closeRoom(r, 'host_left'), T('HOST_GRACE'));
      } else if (pid && r.players.has(pid)) { r.players.get(pid).conns--; broadcast(r); }
    });
    return;
  }

  if (req.method !== 'POST') { res.writeHead(404); return res.end('Not found'); }
  const b = await readBody(req);

  if (path === '/api/create') {
    if (rooms.size >= 200) return json(res, { error: 'busy' });
    const r = createRoom(); return json(res, { code: r.code, key: r.hostKey });
  }

  const r = rooms.get(String(b.code || '').toUpperCase());
  if (!r) return json(res, { error: 'no_room' });
  r.last = Date.now();

  if (path === '/api/join') {
    if (r.phase !== 'lobby') return json(res, { error: 'started' });
    if (r.locked) return json(res, { error: 'locked' });
    const name = cleanName(b.name);
    if (!name) return json(res, { error: 'bad_name' });
    if (r.players.size >= MAX_PLAYERS) return json(res, { error: 'full' });
    if ([...r.players.values()].some(x => x.name.toLowerCase() === name.toLowerCase())) return json(res, { error: 'name_taken' });
    const id = crypto.randomBytes(8).toString('hex');
    r.players.set(id, { id, name, team: null, teamAt: 0, at: Date.now(), conns: 0 });
    broadcast(r);
    return json(res, { pid: id });
  }
  if (path === '/api/act') return json(res, act(r, b));
  json(res, { error: 'unknown' }, 404);
});

setInterval(() => {
  for (const [, r] of rooms)
    if (r.clients.size === 0 && Date.now() - r.last > 30 * 60 * 1000) closeRoom(r, 'idle');
}, 300000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nHand Cricket is running!\n');
  console.log('  Host a game:        http://localhost:' + PORT + '/host');
  const urls = lanUrls();
  if (urls.length) console.log('  Players join at:    ' + urls.join('  or  '));
  console.log('\n  Everyone must be on the same Wi-Fi. Press Ctrl+C to stop.\n');
});
