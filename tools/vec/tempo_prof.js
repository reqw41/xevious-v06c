const R=require('path').resolve(__dirname,'../..');
const {Machine}=require(R+'/tools/vec/machine.js');const {godPatch}=require(R+'/tools/vec/god.js');
const rom=process.argv[2]||R+'/build/xevious.rom', L=require(process.argv[3]||R+'/build/xevious.json');
const m=new Machine();m.loadROM(rom);godPatch(m,L);m.profile=true;m.poke(L.title_skip,1);
let s=7;const rnd=()=>{s=(s*1103515245+12345)>>>0;return s/4294967296;};const K=[['LEFT','SPACE'],['RIGHT','M'],['UP','SPACE','M'],['DOWN','M'],['SPACE','M'],['LEFT'],['RIGHT'],['UP'],['DOWN'],[]];
let sc='100-110 +JA.FIRE1\n',f=200;while(f<8000){const k=K[(rnd()*K.length)|0],n=5+((rnd()*30)|0);if(k.length)sc+=f+'-'+(f+n)+' '+k.map(x=>'+'+x).join(' ')+'\n';f+=n+1;}
m.loadScenario(sc);
let upd=0; m.addBreak(L.main,()=>{upd++;return false;});
m.runFrames(8000);
const inv=Object.entries(L).filter(([k,v])=>!k.includes('.')&&v>=0x100).sort((a,b)=>a[1]-b[1]);
const by={};let tot=0;for(let a=0x100;a<0x10000;a++){if(!m.prof[a])continue;tot+=m.prof[a];let n='?';for(let i=inv.length-1;i>=0;i--)if(inv[i][1]<=a){n=inv[i][0];break;}by[n]=(by[n]||0)+m.prof[a];}
console.log('обновлений',upd,'кадров на обновление',(8000/upd).toFixed(2));
console.log(Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,45).map(([k,v])=>k+' '+(v/upd|0)).join('  '));
