const R=require('path').resolve(__dirname,'../..');
const {Machine}=require(R+'/tools/vec/machine.js');
const rom=process.argv[2]||R+'/build/xevious.rom', L=require(require('path').resolve(process.argv[3]||R+'/build/xevious.json'));
const seed=+(process.argv[4]||7);
const m=new Machine();m.loadROM(rom);m.profile=false;
let s=seed;const rnd=()=>{s=(s*1103515245+12345)>>>0;return s/4294967296;};const K=[['LEFT','SPACE'],['RIGHT','M'],['UP','SPACE','M'],['DOWN','M'],['SPACE','M'],['LEFT'],['RIGHT'],[]];
let sc='100-110 +JA.FIRE1\n300-310 +JA.FIRE1\n',f=400;while(f<30000){const k=K[(rnd()*K.length)|0],n=5+((rnd()*30)|0);if(k.length)sc+=f+'-'+(f+n)+' '+k.map(x=>'+'+x).join(' ')+'\n';f+=n+1;}
m.loadScenario(sc);
let upd=0; m.addBreak(L.main,()=>{upd++;return false;});
let last=0;
let hang=0,stuck=0,pl=-1;for(let t=0;t<30000;t+=500){m.runFrames(500);const lives=m.peek(0x3D39);const d=upd-last;last=upd;if(d==250&&lives==pl)stuck++;else stuck=0;pl=lives;if(stuck>=3){hang=t;break;}}console.log(hang?"HANG at "+hang:"ok");
process.exitCode=hang?1:0;
