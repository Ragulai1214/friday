
"use strict";

const subjects = ["ジェイソン","おばあちゃん","河童","宇宙人","野良猫","友達","赤ちゃん","サンタクロース","佐藤","幽霊"];
const actions = ["殴られて","食べられて","抱きしめられて","キスされて","褒められて","無視されて","説教されて","笑われて","愛されすぎて","間違えて召喚されて","改造されて","弟子入りさせられて","くすぐられて","ネタバレされて","解雇されて"];
const outcomes = ["死亡","老衰","成仏","爆散","なぜか大丈夫だった"];

const GameState = Object.freeze({
  INTRO:"intro",
  READY:"ready",
  SPINNING:"spinning",
  RESULT:"result"
});

const $ = id => document.getElementById(id);
const slots = [...document.querySelectorAll(".slot")];
const pools = [subjects,actions,outcomes];

const iconNames = [
  ["jason","grandma","kappa","alien","cat","friends","baby","santa","sato","ghost"],
  ["punched","eaten","hugged","kissed","praised","ignored","scolded","laughed","overloved","summoned","modified","apprenticed","tickled","spoiled","fired"],
  ["death","old-age","ascended","exploded","survived"]
];

const iconGroups = ["subject","action","outcome"];

function iconPath(category,index) {
  return `./icon/${iconGroups[category]}-${iconNames[category][index]}.svg`;
}

function createIcon(category,value) {
  const index = pools[category].indexOf(value);
  const icon = document.createElement("img");
  icon.className = "fate-icon icon-" + iconNames[category][index];
  icon.src = iconPath(category,index);
  icon.alt = "";
  icon.width = 64;
  icon.height = 64;
  icon.draggable = false;
  icon.setAttribute("aria-hidden","true");
  return icon;
}

const iconPreloads = iconNames.flatMap((names,category) =>
  names.map((_,index) => {
    const image = document.createElement("img");
    image.src = iconPath(category,index);
    return image;
  })
);

function renderReel(index,value,settled=false) {
  const label = document.createElement("span");
  label.className = "reel-label";
  label.textContent = value + (settled && index === 0 ? "に" : "");
  slots[index].querySelector(".reel").replaceChildren(
    createIcon(index,value),label
  );
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

let state = GameState.INTRO;
let result = null;
let spinCount = 0;
let stopped = [false,false,false];
let timers = new Set();
let frame = 0;
let introTimer = 0;
let imageURL = null;
let resultVersion = 0; // Invalidates pending share/save callbacks on replay.
let effectPlayed = false;

function later(fn,ms) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  },ms);
  timers.add(id);
  return id;
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers.clear();
  cancelAnimationFrame(frame);
}

function randomIndex(length) {
  return Math.floor(Math.random()*length);
}

function generateResult() {
  return {
    subject:subjects[randomIndex(subjects.length)],
    action:actions[randomIndex(actions.length)],
    outcome:outcomes[randomIndex(outcomes.length)]
  };
}

const sound = {
  enabled:true,
  ctx:null,
  nodes:new Set(),
  loop:0,

  unlock() {
    if(!this.enabled)return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if(!Audio)return;
      this.ctx ||= new Audio();
      if(this.ctx.state === "suspended") {
        this.ctx.resume().catch(()=>{});
      }
    } catch {}
  },

  tone(freq=100,duration=.12,type="sine",volume=.06,delay=0,end=freq) {
    if(!this.enabled || !this.ctx ||
       this.ctx.state !== "running" || document.hidden)return;

    try {
      const ctx=this.ctx;
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      const t=ctx.currentTime+delay;

      osc.type=type;
      osc.frequency.setValueAtTime(freq,t);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1,end),t+duration
      );

      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(volume,t+.008);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      this.nodes.add(osc);

      osc.onended=()=>{
        this.nodes.delete(osc);
        osc.disconnect();
        gain.disconnect();
      };

      osc.start(t);
      osc.stop(t+duration+.02);
    } catch {}
  },

  startLoop(kind) {
    this.stop();

    const play=()=>kind==="intro"
      ? this.tone(48,1.4,"sine",.035,0,43)
      : this.tone(95,.035,"square",.018);

    play();
    this.loop=setInterval(play,kind==="intro"?1300:95);
  },

  stop() {
    clearInterval(this.loop);
    this.loop=0;

    for(const node of this.nodes) {
      try {node.stop();} catch {}
    }
    this.nodes.clear();
  },

  ending(value) {
    this.stop();

    if(value==="死亡") {
      this.tone(80,.7,"sine",.18,0,20);
    }

    if(value==="老衰") {
      for(let i=0;i<4;i++) {
        this.tone(i%2?1000:1400,.035,"triangle",.045,i*.22);
      }
    }

    if(value==="成仏") {
      [523,784,1047].forEach((f,i)=>
        this.tone(f,.85,"sine",.045,i*.12)
      );
    }

    if(value==="爆散") {
      this.tone(130,.5,"sawtooth",.085,0,22);
      this.tone(55,.7,"triangle",.12);
    }

    if(value==="なぜか大丈夫だった") {
      [523,659,784,1047].forEach((f,i)=>
        this.tone(f,.25,"triangle",.06,i*.1)
      );
    }
  }
};

function showScreen(next) {
  state=next;
  $("intro").hidden=next!==GameState.INTRO;
  $("game").hidden=![GameState.READY,GameState.SPINNING].includes(next);
  $("result").hidden=next!==GameState.RESULT;
}

const introLine="今日は13日の金曜日だ。\nなにか悪いことが起きなければいいけど...";
let introIndex=0;

function finishIntro() {
  clearInterval(introTimer);
  introIndex=introLine.length;
  $("intro-text").textContent=introLine;
  $("next").hidden=false;
  document.querySelector(".intro-hint").style.visibility="hidden";
}

introTimer=setInterval(()=>{
  $("intro-text").textContent=introLine.slice(0,++introIndex);
  if(introIndex>=introLine.length)finishIntro();
},45);

document.addEventListener("pointerdown",()=>{
  sound.unlock();
  if(state===GameState.INTRO && sound.enabled && !sound.loop) {
    sound.startLoop("intro");
  }
});

$("intro").addEventListener("click",event=>{
  if(event.target.closest("button"))return;
  finishIntro();
});

function resetEffects() {
  document.body.classList.remove("aged","shake");
  $("effect").className="";
  $("effect").style.animationDuration="";
  $("particles").replaceChildren();
}

function ready() {
  resultVersion++;
  clearTimers();
  sound.stop();
  resetEffects();
  effectPlayed=false;
  showScreen(GameState.READY);

  slots.forEach(slot=>{
    slot.className="slot";
    slot.querySelector(".reel").textContent="？？？";
  });

  $("spin").hidden=false;
  $("skip").hidden=true;
  $("spin-status").textContent="心の準備は、できましたか。";
  $("image-fallback").hidden=true;
  $("notice").textContent="";

  if(imageURL) {
    URL.revokeObjectURL(imageURL);
    imageURL=null;
  }

  $("spin").focus();
}

$("next").addEventListener("click",()=>{
  finishIntro();
  sound.unlock();
  ready();
});

$("again").addEventListener("click",ready);

function stopSlot(index) {
  if(stopped[index])return;

  stopped[index]=true;
  slots[index].className="slot stopped";

  renderReel(
    index,
    [result.subject,result.action,result.outcome][index],
    true
  );

  sound.tone(650,.06,"triangle",.055,0,170);
}

function ending(short=false) {
  if(effectPlayed)return;

  effectPlayed=true;
  const value=result.outcome;
  sound.ending(value);

  if(value==="老衰")document.body.classList.add("aged");

  const cls={
    "死亡":"death",
    "成仏":"ascend",
    "爆散":"blast",
    "なぜか大丈夫だった":"alive"
  }[value];

  if(cls) {
    $("effect").className=cls;
    if(short)$("effect").style.animationDuration=".22s";
  }

  if(value==="爆散"&&!reducedMotion.matches) {
    document.body.classList.add("shake");
  }

  if(["成仏","爆散"].includes(value)&&!reducedMotion.matches) {
    for(let i=0;i<(short?12:32);i++) {
      const p=document.createElement("i");
      p.className="particle";

      const angle=Math.random()*Math.PI*2;
      const range=80+Math.random()*260;

      p.style.setProperty("--x",`${Math.cos(angle)*range}px`);
      p.style.setProperty(
        "--y",
        `${value==="成仏"?-range:Math.sin(angle)*range}px`
      );
      p.style.setProperty(
        "--particle-color",
        value==="成仏"?"#81d4fa":"#ff5252"
      );

      $("particles").append(p);
    }

    later(()=>$("particles").replaceChildren(),1000);
  }
}

function displayResult() {
  cancelAnimationFrame(frame);
  showScreen(GameState.RESULT);

  $("result").dataset.outcome=result.outcome;

  $("result-icons").replaceChildren(
    ...[result.subject,result.action,result.outcome]
      .map((value,index)=>createIcon(index,value))
  );

  $("subject").textContent=result.subject+"に";
  $("action").textContent=result.action;
  $("outcome").textContent=result.outcome;
  $("again").focus();
}

function spin() {
  if(state!==GameState.READY)return;

  clearTimers();
  resetEffects();
  sound.unlock();

  result=generateResult();
  spinCount++;
  stopped=[false,false,false];
  effectPlayed=false;

  showScreen(GameState.SPINNING);

  $("spin").hidden=true;
  $("skip").hidden=false;
  $("skip").focus();
  $("spin-status").textContent="あなたの運命を、選んでいます。";

  sound.startLoop("spin");

  slots.forEach(slot=>slot.className="slot spinning");

  const start=performance.now();
  const last=[0,0,0];
  const indices=[0,0,0];
  const ends=[800,1600,2600];

  function animate(now) {
    if(state!==GameState.SPINNING)return;

    const elapsed=now-start;

    slots.forEach((slot,i)=>{
      if(stopped[i])return;

      const remaining=ends[i]-elapsed;
      const pace=remaining<300?150:65;

      slot.style.setProperty("--speed",`${pace}ms`);

      if(now-last[i]>pace) {
        renderReel(i,pools[i][indices[i]++%pools[i].length]);
        last[i]=now;
      }
    });

    frame=requestAnimationFrame(animate);
  }

  frame=requestAnimationFrame(animate);

  later(()=>stopSlot(0),800);

  later(()=>{
    sound.stop();
    stopSlot(1);
    $("spin-status").textContent="そして、あなたは……";
  },1600);

  later(()=>{
    stopSlot(2);
    ending();
  },2600);

  later(displayResult,2900);
}

$("spin").addEventListener("click",spin);

$("skip").addEventListener("click",()=>{
  if(state!==GameState.SPINNING)return;

  clearTimers();
  sound.stop();

  [0,1,2].forEach(stopSlot);
  ending(true);
  displayResult();
});

$("sound").addEventListener("click",()=>{
  sound.enabled=!sound.enabled;

  $("sound").setAttribute("aria-pressed",String(sound.enabled));
  $("sound").setAttribute(
    "aria-label",
    sound.enabled?"音声をオフにする":"音声をオンにする"
  );

  $("sound").querySelector("span").textContent=
    sound.enabled?"ON":"OFF";

  if(!sound.enabled) {
    sound.stop();
  } else {
    sound.unlock();
    if(state===GameState.INTRO)sound.startLoop("intro");
    if(state===GameState.SPINNING&&!stopped[1]) {
      sound.startLoop("spin");
    }
  }
});

document.addEventListener("visibilitychange",()=>{
  if(document.hidden)sound.stop();
});

// ============================================
// 共有機能
// ============================================

function shareText() {
  const url=location.protocol==="http:"||
            location.protocol==="https:" ? location.href : "";

  return `今日は13日の金曜日。

あなたは……
${result.subject}に
${result.action}
${result.outcome}

#13日の金曜日 #13日の金曜日ガチャ${url?"\n"+url:""}`;
}

// X Web Intent opens the compose screen with text prefilled.
// Posting still requires the user's confirmation on X.
function shareResult() {
  if(state!==GameState.RESULT)return;

  const url="https://twitter.com/intent/tweet?text="+
    encodeURIComponent(shareText());

  // Keep the navigation synchronous with the click to avoid popup blockers.
  const link=document.createElement("a");
  link.href=url;
  link.target="_blank";
  link.rel="noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}

$("share").addEventListener("click",shareResult);

// ============================================
// 結果画像生成
// ============================================

function makeImage() {
  const canvas=document.createElement("canvas");
  canvas.width=1200;
  canvas.height=675;

  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Canvas unavailable");

  const gradient=ctx.createRadialGradient(600,290,0,600,290,650);
  gradient.addColorStop(0,"#30202b");
  gradient.addColorStop(1,"#111014");

  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,1200,675);

  ctx.strokeStyle="#63343f";
  ctx.lineWidth=2;
  ctx.strokeRect(30,30,1140,615);
  ctx.textAlign="center";

  function line(text,y,size,color,weight=700) {
    ctx.fillStyle=color;

    do {
      ctx.font=`${weight} ${size--}px "Noto Sans JP", "Yu Gothic", sans-serif`;
    } while(ctx.measureText(text).width>1050 && size>12);

    ctx.fillText(text,600,y);
  }

  line("FRIDAY THE 13TH GACHA",80,15,"#c9919e",400);
  line("13日の金曜日ガチャ",132,34,"#f5f5f5");
  line("あなたは……",208,25,"#bfaeb6",400);
  line(result.subject+"に",295,48,"#f5f5f5");
  line(result.action,371,48,"#f5f5f5");

  line(
    result.outcome,
    485,
    82,
    {
      "成仏":"#81d4fa",
      "なぜか大丈夫だった":"#66bb6a",
      "老衰":"#dddddd"
    }[result.outcome]||"#ff5252"
  );

  line("#13日の金曜日ガチャ",596,24,"#bfaeb6",400);

  return canvas;
}

// ============================================
// 画像保存
// ============================================

$("save").addEventListener("click",()=>{
  if(state!==GameState.RESULT)return;
  const version=resultVersion;
  const saveButton=$("save");
  if(saveButton.disabled)return;
  saveButton.disabled=true;

  try {
    const canvas=makeImage();

    canvas.toBlob(blob=>{
      saveButton.disabled=false;
      if(version!==resultVersion || state!==GameState.RESULT)return;
      if(!blob) {
        $("notice").textContent=
          "画像を生成できませんでした。もう一度お試しください。";
        return;
      }

      if(imageURL)URL.revokeObjectURL(imageURL);

      imageURL=URL.createObjectURL(blob);

      const link=document.createElement("a");
      link.href=imageURL;
      link.download="friday13-fate.png";

      document.body.append(link);
      link.click();
      link.remove();

      $("saved-image").src=imageURL;
      $("image-fallback").hidden=false;

      $("notice").textContent=
        "PNG画像を生成しました。保存されない場合は下の画像から保存できます。";
    },"image/png");

  } catch {
    saveButton.disabled=false;
    $("notice").textContent=
      "画像を保存できませんでした。画面のスクリーンショットをご利用ください。";
  }
});
