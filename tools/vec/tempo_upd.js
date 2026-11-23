// node tools/vec/tempo_upd.js [ROM LABELS [SEED]]; live sound and input.
const R=require('path').resolve(__dirname,'../..');
const {Machine,FRAME_CYCLES}=require(R+'/tools/vec/machine.js');const {godPatch}=require(R+'/tools/vec/god.js');
const rom=process.argv[2]||R+'/build/xevious.rom', L=require(require('path').resolve(process.argv[3]||R+'/build/xevious.json'));
const m=new Machine();m.loadROM(rom);godPatch(m,L);m.profile=false;m.poke(L.title_skip,1);
let s=+(process.argv[4]||7);const rnd=()=>{s=(s*1103515245+12345)>>>0;return s/4294967296;};const K=[['LEFT','SPACE'],['RIGHT','M'],['UP','SPACE','M'],['DOWN','M'],['SPACE','M'],['LEFT'],['RIGHT'],['UP'],['DOWN'],[]];
let sc='',f=200;while(f<8000){const k=K[(rnd()*K.length)|0],n=5+((rnd()*30)|0);if(k.length)sc+=f+'-'+(f+n)+' '+k.map(x=>'+'+x).join(' ')+'\n';f+=n+1;}
m.loadScenario(sc);
const waitStart=L.plat_wait_vsync, after=L['plat_wait_vsync.late'];
let tIn=0, tPrev=0, comp=[], idle=[];
m.addBreak(waitStart,()=>{tIn=m.cycles;return false;});
m.addBreak(after,()=>{ if(m.frame>400){ comp.push(tIn-tPrev); idle.push(m.cycles-tIn);} tPrev=m.cycles; return false;});
m.runFrames(8000);
const F=FRAME_CYCLES, n=comp.length, avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const hist={}; for(const c of comp){const k=(c/F).toFixed(1);hist[k]=(hist[k]||0)+1;}
console.log('обновлений',n,'счёт в среднем (кадров)',(avg(comp)/F).toFixed(2),'ожидание',(avg(idle)/F).toFixed(2),'период',((avg(comp)+avg(idle))/F).toFixed(2));
console.log(Object.entries(hist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>k+':'+v).join(' '));
console.log(JSON.stringify({seed:+(process.argv[4]||7),updates:n,compute:avg(comp)/F,wait:avg(idle)/F,period:(avg(comp)+avg(idle))/F}));
