// Dependency-free logic tests: node test.cjs
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
function element(){return {hidden:false,textContent:'',className:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){}},events:{},children:new Map(),addEventListener(k,fn){this.events[k]=fn},querySelector(k){if(!this.children.has(k))this.children.set(k,element());return this.children.get(k)},setAttribute(){},focus(){},replaceChildren(){},append(){},remove(){}};}
const els=new Map(),slots=[element(),element(),element()];
let time=0,id=0,jobs=new Map();
const document={hidden:false,body:element(),getElementById(k){if(!els.has(k))els.set(k,element());return els.get(k)},querySelector:()=>element(),querySelectorAll:()=>slots,addEventListener(){},createElement:()=>element()};
const context=vm.createContext({document,window:{},matchMedia:()=>({matches:false}),performance:{now:()=>time},setTimeout(fn,ms){jobs.set(++id,{fn,t:time+ms});return id},clearTimeout(i){jobs.delete(i)},setInterval(){return ++id},clearInterval(){},requestAnimationFrame(){return ++id},cancelAnimationFrame(){},location:{protocol:'file:',href:'file:///game'},URL,console});
vm.runInContext(readFileSync('script.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
function advance(ms){const until=time+ms;while(true){const next=[...jobs].filter(([,j])=>j.t<=until).sort((a,b)=>a[1].t-b[1].t)[0];if(!next)break;time=next[1].t;jobs.delete(next[0]);next[1].fn();}time=until;}
run(`finishIntro(); ready(); sound.enabled=false`);
assert.equal(run('state'),'ready');
// Enumerate every equal-sized random bucket, including first/last candidates.
assert.equal(run(`(()=>{const original=Math.random;const seen=new Set();try{for(let s=0;s<10;s++)for(let a=0;a<15;a++)for(let o=0;o<5;o++){const values=[(s+.5)/10,(a+.5)/15,(o+.5)/5];Math.random=()=>values.shift();seen.add(JSON.stringify(generateResult()));}}finally{Math.random=original;}return seen.size;})()`),750);
run('spin()');const first=run('JSON.stringify(result)');run('spin()');assert.equal(run('spinCount'),1);
advance(800);assert.equal(run('stopped.join()'),'true,false,false');
advance(800);assert.equal(run('stopped.join()'),'true,true,false');
advance(999);assert.equal(run('state'),'spinning');
advance(1);assert.equal(run('stopped.join()'),'true,true,true');
advance(300);assert.equal(run('state'),'result');assert.equal(run('JSON.stringify(result)'),first);
for(const delay of [0,900,1700,2700]){run('ready();spin()');const before=run('JSON.stringify(result)');advance(delay);els.get('skip').events.click();assert.equal(run('state'),'result');assert.equal(run('JSON.stringify(result)'),before);advance(4000);assert.equal(run('state'),'result');run('ready()');assert.equal(run('timers.size'),0);}
for(let o=0;o<5;o++){run(`ready(); result={subject:subjects[0],action:actions[0],outcome:outcomes[${o}]};ending();displayResult();`);assert.equal(els.get('outcome').textContent,run(`outcomes[${o}]`));}
assert.equal(run('shareText().includes("file://")'),false);
run(`location.protocol='https:';location.href='https://example.test/friday/';`);assert.equal(run('shareText().includes(location.href)'),true);
console.log('PASS: 750 combinations, duplicate-click guard, stop timing, 4 skip timings, replay cleanup, all 5 outcomes, share URL.');
