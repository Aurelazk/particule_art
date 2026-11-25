'use strict';
/* VOIE LACTÉE — rendu WebGL (WebGL2 préféré, WebGL1 fallback)
   VAO, buffers préalloués, bufferSubData par morceaux, culling, LOD,
   cache textures LRU, perte de contexte, pause onglet caché. */
import { clamp, fin, norm, sub, mul, mPerspective, mLookAt, mMul, MOBILE, smoothstep } from './vl-core.js';

const VS = `
precision mediump float;
attribute vec3 aP,aC;attribute vec4 aR;attribute vec2 aN;attribute float aL;
uniform mat4 uVP;uniform vec3 uCam,uPos,uLight;uniform vec2 uRot;
uniform float uScale,uFocus,uAlpha,uTime,uDpr,uPoint,uRelief,uDrift,uDebug,uRoll;
varying vec3 vC,vAux;varying float vA,vSoft;
void main(){
  float f=clamp(uFocus,0.,1.);
  vec3 p=aP;float ph=aR.z*6.2831853;
  float dr=uDrift*(1.-f)*.014;
  p+=vec3(sin(uTime*.43+ph+aP.y*3.),cos(uTime*.37+ph*1.3+aP.x*3.),sin(uTime*.29+ph*.7))*dr*(.3+aR.w);
  p.z+=aL*.018;
  p*=uScale;
  float cy=cos(uRot.x),sy=sin(uRot.x),cx=cos(uRot.y),sx=sin(uRot.y);
  p=vec3(p.x*cy+p.z*sy,p.y,p.z*cy-p.x*sy);
  p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);
  float cz=cos(uRoll),sz=sin(uRoll);
  p=vec3(p.x*cz-p.y*sz,p.x*sz+p.y*cz,p.z);
  p+=uPos;
  gl_Position=uVP*vec4(p,1.);
  float dist=max(.5,length(uCam-p));
  float atten=clamp(7./dist,.26,2.5);
  float grain=.74+.48*aR.x;
  gl_PointSize=clamp(uDpr*uPoint*mix(2.6,1.7,f)*atten*(.68+.42*aR.w),1.,mix(8.,2.8,f)*uDpr);
  vec3 rn=vec3(-aN.x*uRelief*f*3.4,-aN.y*uRelief*f*3.4,1.);
  rn=vec3(rn.x*cy+rn.z*sy,rn.y,rn.z*cy-rn.x*sy);
  rn=vec3(rn.x,rn.y*cx-rn.z*sx,rn.y*sx+rn.z*cx);
  rn=vec3(rn.x*cz-rn.y*sz,rn.x*sz+rn.y*cz,rn.z);
  vec3 n=normalize(rn);
  float lam=max(0.,dot(n,normalize(uLight)));
  float rake=pow(lam,2.2);
  vec3 V=normalize(uCam-p);
  float spec=pow(max(0.,dot(reflect(-normalize(uLight),n),V)),18.);
  float rim=pow(1.-max(0.,dot(n,V)),2.);
  float shade=mix(.88,.91+lam*.10+rake*.09+spec*.20,f);
  vec3 col=pow(max(aC,vec3(0.)),vec3(2.2))*grain*shade*mix(.97,1.03,aL)+vec3((spec*.035+rim*.012)*f);
  float g=dot(col,vec3(.299,.587,.114));
  col=mix(mix(vec3(g),col,1.04),col,f);
  if(uDebug>.5&&uDebug<1.5)col=vec3(g);
  else if(uDebug>1.5&&uDebug<2.5)col=vec3(.5+aN.x*.5,.5+aN.y*.5,.5);
  else if(uDebug>2.5)col=aC;
  else col=pow(max(col,vec3(0.)),vec3(1./2.2));
  vC=col;vAux=vec3(aR.x,smoothstep(.68,1.,g)*f,spec*f);vA=clamp(uAlpha*mix(.52,1.,f),0.,1.);vSoft=1.-f;
}`;
const FS = `
precision mediump float;varying vec3 vC,vAux;varying float vA,vSoft;
void main(){vec2 c=gl_PointCoord-.5;float r=dot(c,c);if(r>.34)discard;
  float sharp=1.-smoothstep(.12,.25,r),soft=1.-smoothstep(0.,.25,r);
  float halo=exp(-r*17.)*vAux.y;
  float crack=smoothstep(.972,1.,sin((c.x*23.+c.y*17.+vAux.x*31.)*1.7))*.055*vAux.y;
  float varnish=pow(max(0.,1.-length(c)*1.6),2.)*vAux.z;
  vec3 col=vC*(1.-crack)+vec3(.58,.68,1.)*(halo*.42+varnish*.22);
  gl_FragColor=vec4(col,vA*clamp(mix(sharp,soft,vSoft)+halo*.34,0.,1.));}`;
const SVS = `precision mediump float;attribute vec3 aP;attribute float aS;
uniform mat4 uVP;uniform float uTime,uDpr;varying float vA;
void main(){gl_Position=uVP*vec4(aP,1.);gl_PointSize=clamp(uDpr*(.8+aS*1.2),1.,3.*uDpr);vA=(.18+.42*aS)*(.65+.35*sin(uTime*.7+aS*40.));}`;
const SFS = `precision mediump float;varying float vA;void main(){vec2 c=gl_PointCoord-.5;if(dot(c,c)>.25)discard;gl_FragColor=vec4(.72,.78,1.,vA);}`;
const LVS = `precision mediump float;attribute vec3 aP;uniform mat4 uVP;void main(){gl_Position=uVP*vec4(aP,1.);}`;
const LFS = `precision mediump float;uniform float uA;void main(){gl_FragColor=vec4(.32,.42,.72,uA);}`;

const STRIDE = 13;
const ATTRS = [['aP',3,0],['aC',3,3],['aR',4,6],['aN',2,10],['aL',1,12]];

function shader(gl,t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o;}
function program(gl,v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}

export function supportsWebGL2(){try{return !!document.createElement('canvas').getContext('webgl2')}catch(e){return false}}

export class GLRenderer{
  constructor(canvas){
    this.canvas=canvas;
    this.gl=null;this.type='webgl1';this.vaoExt=null;this.instExt=null;
    this.ctxLost=false;this.ctxLostPromise=null;this.ctxLostResolve=null;
    this.pProg=null;this.sProg=null;this.lProg=null;
    this.U={};this.SU={};this.LU={};
    this.bStars=null;this.bLines=null;this.starN=0;this.starData=null;
    this.W=1;this.H=1;this.DPR=1;this.viewportW=1;this.viewportH=1;
    this.maxTexSize=0;this.maxVaoAttribs=0;
    this.workVao=new Map(); // work -> {vao,buf,loCount,hiCount}
    this.textures=new Map();this.texOrder=[];this.texBytes=0;this.texBudget=0;
    this.hidden=false;this.paused=false;
    this.onContextLost=null;this.onContextRestored=null;
    this._boundLost=this._onLost.bind(this);this._boundRest=this._onRestored.bind(this);
  }
  async init(){
    const c=this.canvas;
    let gl=c.getContext('webgl2',{antialias:false,alpha:false,depth:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});
    let type='webgl2';
    if(!gl){gl=c.getContext('webgl',{antialias:false,alpha:false,depth:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});type='webgl1';}
    if(!gl)return false;
    this.gl=gl;this.type=type;
    if(type==='webgl1'){this.vaoExt=gl.getExtension('OES_vertex_array_object');this.instExt=gl.getExtension('ANGLE_instanced_arrays');}
    c.addEventListener('webglcontextlost',this._boundLost);c.addEventListener('webglcontextrestored',this._boundRest);
    this.maxTexSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxVaoAttribs=gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    this.texBudget=type==='webgl2'?Math.min(64*1024*1024,Math.floor((gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||4096)*16)):32*1024*1024;
    this.pProg=program(gl,VS,FS);
    this.sProg=program(gl,SVS,SFS);
    this.lProg=program(gl,LVS,LFS);
    this._uniformLocs(gl,this.pProg,['uVP','uCam','uPos','uLight','uRot','uScale','uFocus','uAlpha','uTime','uDpr','uPoint','uRelief','uDrift','uDebug','uRoll'],this.U);
    this._uniformLocs(gl,this.sProg,['uVP','uTime','uDpr'],this.SU);
    this._uniformLocs(gl,this.lProg,['uVP','uA'],this.LU);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0,0,0,1);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
    this.bStars=gl.createBuffer();this.bLines=gl.createBuffer();
    this.starN=MOBILE?700:1500;
    this.starData=new Float32Array(this.starN*4);const sr=mulberry32GL(9182);
    for(let i=0;i<this.starN;i++){const v=[sr()*2-1,sr()*2-1,sr()*2-1],d=norm(v),r=60+sr()*90;this.starData[i*4]=d[0]*r;this.starData[i*4+1]=d[1]*r;this.starData[i*4+2]=d[2]*r;this.starData[i*4+3]=sr();}
    gl.bindBuffer(gl.ARRAY_BUFFER,this.bStars);gl.bufferData(gl.ARRAY_BUFFER,this.starData,gl.STATIC_DRAW);
    this.resize();
    return true;
  }
  _uniformLocs(gl,p,names,out){names.forEach(k=>out[k]=gl.getUniformLocation(p,k));}
  _onLost(e){e.preventDefault();this.ctxLost=true;if(this.onContextLost)this.onContextLost();}
  _onRestored(){this.ctxLost=false;if(this.onContextRestored)this.onContextRestored();}
  async handleContextLoss(){if(!this.ctxLostPromise){this.ctxLostPromise=new Promise(res=>{this.ctxLostResolve=res;});}return this.ctxLostPromise;}
  restore(){try{this.initShadersAfterLoss();}catch(e){}this.ctxLostResolve&&this.ctxLostResolve();this.ctxLostPromise=null;}
  initShadersAfterLoss(){const gl=this.gl;this.pProg=program(gl,VS,FS);this.sProg=program(gl,SVS,SFS);this.lProg=program(gl,LVS,LFS);this._uniformLocs(gl,this.pProg,['uVP','uCam','uPos','uLight','uRot','uScale','uFocus','uAlpha','uTime','uDpr','uPoint','uRelief','uDrift','uDebug','uRoll'],this.U);this._uniformLocs(gl,this.sProg,['uVP','uTime','uDpr'],this.SU);this._uniformLocs(gl,this.lProg,['uVP','uA'],this.LU);this.workVao.forEach(v=>{if(v.vao)this.deleteVAO(v.vao);v.vao=null});this.workVao.clear();}
  setHidden(hidden){this.hidden=hidden;}
  setPaused(paused){this.paused=paused;}
  resize(){
    if(!this.gl)return;
    const dpr=Math.min(devicePixelRatio||1,2);
    const W=Math.max(1,Math.round(innerWidth*dpr)),H=Math.max(1,Math.round(innerHeight*dpr));
    const c=this.canvas;if(c.width!==W||c.height!==H){c.width=W;c.height=H;}
    this.W=W;this.H=H;this.DPR=dpr;this.viewportW=c.width;this.viewportH=c.height;
    this.gl.viewport(0,0,W,H);
  }
  setPixelRatio(dpr){if(!this.gl)return;this.DPR=clamp(dpr,0.5,2);this.resize();}
  deleteVAO(vao){const gl=this.gl;if(this.type==='webgl1'&&this.vaoExt)this.vaoExt.deleteVertexArrayOES(vao);else gl.deleteVertexArray(vao);}
  createVAO(){const gl=this.gl;if(this.type==='webgl1'&&this.vaoExt)return this.vaoExt.createVertexArrayOES();return gl.createVertexArray();}
  bindVAO(vao){const gl=this.gl;if(this.type==='webgl1'&&this.vaoExt)this.vaoExt.bindVertexArrayOES(vao);else gl.bindVertexArray(vao);}

  ensureWork(work,maxLo,maxHi){
    const gl=this.gl;let v=this.workVao.get(work);
    if(!v){v={vao:this.createVAO(),buf:gl.createBuffer(),loCount:0,hiCount:0,loCap:0,hiCap:0,loBytes:0,hiBytes:0,dirty:true};this.workVao.set(work,v);}
    const needLo=maxLo*STRIDE*4,needHi=maxHi*STRIDE*4;
    let total=0;
    if(needLo>v.loBytes){v.loBytes=Math.max(needLo,(v.loBytes||0)*2+needLo);total+=v.loBytes}else total+=v.loBytes;
    if(needHi>v.hiBytes){v.hiBytes=Math.max(needHi,(v.hiBytes||0)*2+needHi);total+=v.hiBytes}else total+=v.hiBytes;
    gl.bindBuffer(gl.ARRAY_BUFFER,v.buf);gl.bufferData(gl.ARRAY_BUFFER,total,gl.DYNAMIC_DRAW);
    return v;
  }
  upload(work,arr,count,kind){
    const gl=this.gl;const v=this.workVao.get(work);if(!v)return;
    const bytes=count*STRIDE*4;
    gl.bindBuffer(gl.ARRAY_BUFFER,v.buf);
    const offset=kind==='lo'?0:v.loBytes;
    if(offset+bytes>(v.loBytes+v.hiBytes)){v.dirty=true;return}
    gl.bufferSubData(gl.ARRAY_BUFFER,offset,new Uint8Array(arr.buffer,arr.byteOffset,bytes));
    if(kind==='lo'){v.loCount=count;v.loReady=true;}else{v.hiCount=count;v.hiReady=true;}
  }
  buildVAO(work,program){
    const gl=this.gl;const v=this.workVao.get(work);if(!v)return;
    if(v.vao)this.deleteVAO(v.vao);
    const vao=this.createVAO();this.bindVAO(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER,v.buf);
    ATTRS.forEach(([n,s,o],i)=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,s,gl.FLOAT,gl.FALSE,STRIDE*4,o*4);});
    this.bindVAO(null);
    v.vao=vao;v.prog=program;
  }
  drawFrame({VP,CAM,time,visibleWorks,dpr,pointScale,reduced,debug}){
    const gl=this.gl;if(!gl||this.ctxLost||this.hidden||this.paused)return 0;
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    // stars
    gl.useProgram(this.sProg);
    gl.uniformMatrix4fv(this.SU.uVP,false,VP);gl.uniform1f(this.SU.uTime,time);gl.uniform1f(this.SU.uDpr,dpr);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.bStars);
    for(let i=2;i<this.maxVaoAttribs;i++)gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,16,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,1,gl.FLOAT,false,16,12);
    gl.drawArrays(gl.POINTS,0,this.starN);
    gl.useProgram(this.pProg);
    gl.uniformMatrix4fv(this.U.uVP,false,VP);
    gl.uniform3fv(this.U.uCam,new Float32Array(CAM));
    gl.uniform3fv(this.U.uLight,new Float32Array(norm([-.65,.42,.75])));
    gl.uniform1f(this.U.uTime,time);gl.uniform1f(this.U.uDpr,dpr);
    gl.uniform1f(this.U.uPoint,pointScale);gl.uniform1f(this.U.uRelief,reduced?0:1.1);
    gl.uniform1f(this.U.uDrift,reduced?0:1);gl.uniform1f(this.U.uDebug,debug);
    let drawn=0;
    for(const work of visibleWorks){
      const v=this.workVao.get(work);if(!v||!v.vao)continue;
      const focus=fin(work.focus,0,0,1),alpha=fin(work.alpha,1,0,1);
      if(alpha<.008)continue;
      const blend=smoothstep(.02,.38,focus);
      gl.bindVertexArray?gl.bindVertexArray(v.vao):this.vaoExt.bindVertexArrayOES(v.vao);
      gl.uniform3fv(this.U.uPos,new Float32Array(work.pos.map(x=>fin(x,0,-200,200))));
      gl.uniform2fv(this.U.uRot,new Float32Array([work.rot[0]+(work.rotUser?.[0]||0),work.rot[1]+(work.rotUser?.[1]||0)].map(x=>fin(x,0,-7,7))));
      gl.uniform1f(this.U.uScale,fin(work.scale*(work.userScale||1),1,.05,20));
      gl.uniform1f(this.U.uFocus,focus);
      gl.uniform1f(this.U.uAlpha,alpha);
      gl.uniform1f(this.U.uRoll,fin(work.roll,0,-Math.PI,Math.PI));
      let cnt=0;
      if(!v.hiReady||blend<.001){
        cnt=v.loCount;gl.uniform1f(this.U.uAlpha,alpha);
        gl.drawArrays(gl.POINTS,0,cnt);drawn+=cnt;
      }else{
        gl.uniform1f(this.U.uAlpha,alpha*(1-.72*blend));
        gl.drawArrays(gl.POINTS,0,v.loCount);drawn+=v.loCount;
        gl.uniform1f(this.U.uAlpha,alpha*blend);
        const hcnt=Math.floor(v.hiCount*(.35+.37*smoothstep(.5,.92,focus)));
        gl.drawArrays(gl.POINTS,0,hcnt);drawn+=hcnt;
      }
    }
    gl.bindVertexArray?gl.bindVertexArray(null):this.vaoExt.bindVertexArrayOES(null);
    return drawn;
  }
  setLines(buf,data){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}
  drawLines(VP,count,a){
    const gl=this.gl;gl.useProgram(this.lProg);gl.uniformMatrix4fv(this.LU.uVP,false,VP);gl.uniform1f(this.LU.uA,.16);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.bLines);for(let i=2;i<this.maxVaoAttribs;i++)gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);gl.drawArrays(gl.LINES,0,count);
  }
  dispose(){const gl=this.gl;this.workVao.forEach(v=>{if(v.buf)gl.deleteBuffer(v.buf);if(v.vao)this.deleteVAO(v.vao);});this.workVao.clear();if(this.bStars)gl.deleteBuffer(this.bStars);if(this.bLines)gl.deleteBuffer(this.bLines);}}
function mulberry32GL(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
