const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=0,sequence=0;const frames=new Map(),timers=new Map();
const window={devicePixelRatio:1,matchMedia:()=>({matches:false})};
const context=vm.createContext({window,document:{addEventListener(){}},performance:{now:()=>now},requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{const id=++sequence;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),Math,Number,Intl,Date,clamp:(v,min,max)=>Math.min(max,Math.max(min,v))});
vm.runInContext(fs.readFileSync(__dirname+'/ui/reminder_ui.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
const event=(dy,legacy,time=now,extra={})=>({deltaY:dy,deltaX:0,deltaMode:0,wheelDeltaY:legacy,timeStamp:time,preventDefault(){this.prevented=true;},stopPropagation(){},...extra});
const advance=(milliseconds,frameTime=16)=>{const end=now+milliseconds;while(now<end){now=Math.min(end,now+frameTime);const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn(now);}};
function picker(start=30){
 let value=start,native=0;const root={isConnected:true,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
 context.root=root;context.pickerOptions={read:()=>value,paint:v=>{value=v;},max:500,prepare(){},native:()=>native++,finish(){}};
 const controller=run('bindPickerMouseWheel(root,pickerOptions)');
 return {root,controller,read:()=>value,native:()=>native,wheel:e=>root.listeners.wheel(e)};
}
// CSS pixel distance changes with zoom, OS lines and browser; spin stays one step.
for(const dpr of [1,1.15,1.25,1.5,2,2.5,3])for(const pixels of [4,50,80,100,160]){
 window.devicePixelRatio=dpr;context.input=event(pixels/dpr,-120);
 assert.equal(run('valueWheelUnits(input)'),1,`dpr=${dpr},pixels=${pixels}`);
 const p=picker();p.wheel(context.input);advance(500);assert.equal(p.read(),31,`picker dpr=${dpr},pixels=${pixels},native=${p.native()}`);assert.equal(frames.size,0);
}
// WebView2 divides both deltas by page zoom and quantizes legacy wheelDelta.
// OS DPI is independent: only the application's explicit zoom is undone.
for(const zoom of [1,1.15,1.2,1.25,1.5,2])for(const dpr of [1,1.5,2])for(const sign of [-1,1]){
 window.__worldClockWheelZoom=zoom;window.devicePixelRatio=dpr;
 context.input=event(sign*100/zoom,-sign*Math.floor(120/zoom));
 assert.equal(run('valueWheelUnits(input)'),sign,`zoom=${zoom},dpr=${dpr}`);
 const p=picker();p.wheel(context.input);advance(500);assert.equal(p.read(),30+sign);
 let total=0;for(let i=0;i<100;i++)total+=run('valueWheelUnits(input)');assert.equal(total,100*sign);
}
window.__worldClockWheelZoom=1;window.devicePixelRatio=1;
// Slow deliberate ticks, even while the previous animation is settling, stay exact.
for(const gap of [90,100,150,300]){const p=picker();for(let i=0;i<4;i++){p.wheel(event(100,-120));advance(gap);}advance(1800);assert.equal(p.read(),34);assert.equal(frames.size,0);}
// A high-resolution wheel can split one notch into four pulses; this is not a fling.
for(const zoom of [1,1.25,2]){window.__worldClockWheelZoom=zoom;const p=picker();for(let i=0;i<4;i++){p.wheel(event(25/zoom,-Math.round(30/zoom)));advance(5);}advance(1800);assert.equal(p.read(),31);}
window.__worldClockWheelZoom=1;window.devicePixelRatio=1;
// Fast complete detents create a decaying coast; the model is frame-rate independent.
const results=[];
for(const frameTime of [8,16,32]){const p=picker();for(let i=0;i<5;i++){p.wheel(event(100,-120));advance(20,frameTime);}advance(2200,frameTime);assert.ok(p.read()>35&&p.read()<45);assert.equal(p.read()%1,0);assert.equal(frames.size,0);results.push(p.read());}
assert.ok(Math.max(...results)-Math.min(...results)<=1,JSON.stringify(results));
// Reversing direction brakes the previous coast and permits one exact opposing step.
{const p=picker();for(let i=0;i<4;i++){p.wheel(event(100,-120));advance(20);}advance(150);const before=Math.round(p.read());p.wheel(event(-100,120));advance(1800);assert.equal(p.read(),before-1);}
// Native precise/momentum streams remain native and never receive a second inertia.
{const p=picker();for(const delta of [7,22,40,18,6,2]){const e=event(delta,-delta*3);p.wheel(e);assert.ok(!e.prevented);}assert.equal(p.native(),6);assert.equal(p.read(),30);assert.equal(frames.size,0);}
{const p=picker();const e=event(100,-120,now,{momentum:true});p.wheel(e);assert.ok(!e.prevented);assert.equal(frames.size,0);}
// Numeric intervals consume exact steps immediately, with no synthetic tail.
let numeric=0;const root={isConnected:true,listeners:{},addEventListener(t,f){this.listeners[t]=f;}};
context.root=root;context.numericOptions={read:()=>numeric,write:v=>{numeric=v;}};run('bindValueScroll(root,numericOptions)');
for(let i=0;i<5;i++){root.onwheel(event(50,-120));advance(20);}assert.equal(numeric,-5);advance(2000);assert.equal(numeric,-5);assert.equal(frames.size,0);
for(const fn of [...timers.values()])fn();timers.clear();assert.equal(numeric,-5);
window.__worldClockWheelLines=6;context.input=event(6,undefined,now,{deltaMode:1});assert.equal(run('valueWheelUnits(input)'),1);
context.input=event(1,-120,now,{deltaMode:2});assert.equal(run('valueWheelUnits(input)'),1);
// Bounds, reduced motion and detached controls cannot leave a running animation.
{const p=picker(500);p.wheel(event(100,-120));advance(800);assert.equal(p.read(),500);assert.equal(frames.size,0);}
window.matchMedia=()=>({matches:true});{const p=picker();for(let i=0;i<5;i++)p.wheel(event(100,-120,now+i*20));assert.equal(p.read(),35);assert.equal(frames.size,0);}
window.matchMedia=()=>({matches:false});{const p=picker();p.wheel(event(100,-120));p.root.isConnected=false;advance(100);assert.equal(frames.size,0);}
console.log('Wheel input: scale/DPI, slow ticks, split detents, fast coast, 60/120 Hz, reversal, native precision/momentum, numeric no-inertia, lines/pages, bounds and cancellation passed.');
