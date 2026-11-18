'use strict';
/* Reuse the actual h00k SVG robot eyes for the Windows installer and EXE.
 * Sharp renders SVG; all NSIS BMPs are 24-bit RGB; ICO holds PNG frames. */
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const OUT=path.resolve(__dirname,'..','build');
const source=fs.readFileSync(path.resolve(__dirname,'..','..','public','h00k-robot-logo.svg'),'utf8');
const match=source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>\s*$/i);
if(!match||!source.includes('robot-eye'))throw Error('Original h00k robot logo SVG missing');
const ROBOT=match[1].replace(/<style>[\s\S]*?<\/style>/gi,'');
const C='#22d3ee',LIGHT='#67e8f9',TEXT='#e2f3fa',MUTED='#94a3b8',BG='#0d1420',NAVY='#080d1e';
function robot(x,y,w,h){return '<svg x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" viewBox="23 2 50 40" preserveAspectRatio="xMidYMid meet">'+ROBOT+'</svg>';}
function svg(w,h,body){return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+body+'</svg>';}
const defs='<defs><linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1728"/><stop offset=".65" stop-color="#080d1e"/><stop offset="1" stop-color="#111c2f"/></linearGradient></defs>';
function appIcon(){
 // The Windows icon is the actual stationary robot bezel and eyes from
 // public/h00k-robot-logo.svg. No added panel, text, decorative border or stripe.
 // A transparent background prevents Windows Explorer from showing a square tile.
 return svg(256,256,robot(15,38,226,180));
}
function sidebar(uninstall){
 let grid='';
 for(let i=0;i<10;i++)grid+='<path d="M0 '+(35+i*27)+' H164"/>';
 for(let i=0;i<6;i++)grid+='<path d="M'+i*30+' 0 V314"/>';
 return svg(164,314,defs+'<rect width="164" height="314" fill="url(#night)"/>'
 +'<path d="M0 0H164" stroke="'+C+'" stroke-width="5"/>'
 +'<g opacity=".07" stroke="'+LIGHT+'" stroke-width=".55">'+grid+'</g>'
 +'<circle cx="82" cy="104" r="63" fill="#0c2335" stroke="'+C+'" stroke-opacity=".13"/>'
 +robot(22,70,120,93)
 +'<rect x="21" y="180" width="30" height="3" rx="1.5" fill="'+C+'"/>'
 +'<text x="20" y="217" font-family="Segoe UI,Arial,sans-serif" font-weight="800" font-size="32" fill="'+TEXT+'">h00k</text>'
 +'<text x="20" y="237" font-family="Segoe UI,Arial,sans-serif" letter-spacing="2" font-size="13" font-weight="700" fill="'+C+'">DESKTOP</text>'
 +'<text x="20" y="261" font-family="Segoe UI,Arial,sans-serif" font-size="10" fill="'+MUTED+'">WINDOWS</text>'
 +'<text x="20" y="297" font-family="Segoe UI,Arial,sans-serif" font-size="9" fill="'+LIGHT+'">'
 +'h00k.top</text>');
}
function header(){
 return svg(150,57,defs+'<rect width="150" height="57" fill="url(#night)"/>'
 +robot(6,6,51,44)
 +'<text x="58" y="28" font-family="Segoe UI,Arial,sans-serif" font-size="19" font-weight="800" fill="'+LIGHT+'">h00k</text>'
 +'<text x="59" y="42" font-family="Segoe UI,Arial,sans-serif" font-size="9" letter-spacing="1.3" fill="'+TEXT+'">DESKTOP</text>'
 +'<rect y="54" width="150" height="3" fill="'+C+'"/>');
}
async function ico(svgSource){
 const sizes=[16,24,32,48,64,128,256];
 const frames=await Promise.all(sizes.map(size=>sharp(Buffer.from(svgSource)).resize(size,size).png().toBuffer()));
 const table=Buffer.alloc(6+16*sizes.length);
 table.writeUInt16LE(0,0);table.writeUInt16LE(1,2);table.writeUInt16LE(sizes.length,4);
 let offset=table.length;
 for(let i=0;i<sizes.length;i++){
  const index=6+i*16,size=sizes[i];
  table.writeUInt8(size===256?0:size,index);table.writeUInt8(size===256?0:size,index+1);
  table.writeUInt16LE(1,index+4);table.writeUInt16LE(32,index+6);
  table.writeUInt32LE(frames[i].length,index+8);table.writeUInt32LE(offset,index+12);
  offset+=frames[i].length;
 }
 return Buffer.concat([table,...frames]);
}
async function bmp24(svgSource,width,height){
 const result=await sharp(Buffer.from(svgSource)).flatten({background:BG}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 if(result.info.width!==width||result.info.height!==height||result.info.channels!==3)throw Error('Bad BMP raster dimensions');
 const bytes=result.data,stride=(width*3+3)&~3;
 const pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const src=(y*width+x)*3,dst=(height-1-y)*stride+x*3;
  pixels[dst]=bytes[src+2];pixels[dst+1]=bytes[src+1];pixels[dst+2]=bytes[src];
 }
 const head=Buffer.alloc(54);
 head.write('BM',0);head.writeUInt32LE(54+pixels.length,2);head.writeUInt32LE(54,10);
 head.writeUInt32LE(40,14);head.writeInt32LE(width,18);head.writeInt32LE(height,22);
 head.writeUInt16LE(1,26);head.writeUInt16LE(24,28);head.writeUInt32LE(pixels.length,34);
 return Buffer.concat([head,pixels]);
}
async function main(){
 fs.mkdirSync(OUT,{recursive:true});
 const files={
  'h00k.ico':await ico(appIcon()),
  // A distinct installer asset makes NSIS executable resource verification explicit.
  'h00k-installer.ico':await ico(appIcon()),
  'h00k-robot-preview.png':await sharp(Buffer.from(appIcon())).png().toBuffer(),
  'installerSidebar.bmp':await bmp24(sidebar(false),164,314),
  'uninstallerSidebar.bmp':await bmp24(sidebar(true),164,314),
  'installerHeader.bmp':await bmp24(header(),150,57)
 };
 for(const [name,data] of Object.entries(files)){
  if(data.length<1000)throw Error('Truncated '+name);
  fs.writeFileSync(path.join(OUT,name),data);
  console.log('h00k installer asset',name,data.length+' bytes');
 }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
