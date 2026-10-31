// film/core/post.js - the renderer and the one post chain every shot goes through (the approved look):
// RenderPass -> GTAO (contact shadows, half res, seeded) -> Bokeh DOF -> UnrealBloom (on a 1080-line grid)
// -> OutputPass (ACES) -> SMAA -> grade (red-teal, crushed blacks, CA, vignette, 1080-grid grain, gate weave,
// letterbox, impact flash). Resolution-independent: 4K looks like a sharper 1080p.
//
// Each frame the router calls post.frame(scene, camera, values, t). values (all optional; defaults reset every frame):
//   exposure, bloomThreshold, bloomStrength, focusDistance (view-space metres), aperture, maxblur, flash (0..1),
//   lift, ao (GTAO blend 0..1), vignette, ca.
// Objects with userData.noDepth = true (additive glows, beams, dust, sparks, rain) are hidden while the DOF and AO
// passes render their depth/normals, so a glow never pulls focus or casts AO.
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { mulberry, hash1 } from "./env.js";

export const POST_DEFAULTS = { exposure: 1.0, bloomThreshold: 0.82, bloomStrength: 0.9, focusDistance: 3, aperture: 0.003, maxblur: 0.009, flash: 0, lift: 0, ao: 0.85, vignette: 1, ca: 0.006 };
export const NEAR = 0.05, FAR = 220;

export function createPost(THREE, W, H) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  const dummyScene = new THREE.Scene(), dummyCam = new THREE.PerspectiveCamera(35, W / H, NEAR, FAR);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(1); composer.setSize(W, H);
  const renderPass = new RenderPass(dummyScene, dummyCam); composer.addPass(renderPass);
  // GTAOPass builds its denoise noise with SimplexNoise(Math.random): seed Math.random for the constructor only (purity)
  const _rnd = Math.random; Math.random = mulberry(2160);
  const gtao = new GTAOPass(dummyScene, dummyCam, W, H, undefined, { radius: 0.32, distanceExponent: 1.4, thickness: 0.6, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  Math.random = _rnd;
  gtao.blendIntensity = 0.85;
  { const ss = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => ss(Math.ceil(w / 2), Math.ceil(h / 2)); gtao.setSize(W, H); }
  let hidden = [];
  const withoutGlows = (fn) => (...a) => { const vs = hidden.map(o => o.visible); hidden.forEach(o => o.visible = false); fn(...a); hidden.forEach((o, i) => o.visible = vs[i]); };
  gtao.render = withoutGlows(gtao.render.bind(gtao));
  composer.addPass(gtao);
  const bokeh = new BokehPass(dummyScene, dummyCam, { focus: 3, aperture: 0.003, maxblur: 0.009 });
  bokeh.render = withoutGlows(bokeh.render.bind(bokeh));
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.9, 0.55, 0.82); composer.addPass(bloom);
  // bloom always runs on a 1080-line grid so its radius is the same fraction of the frame at any output size
  { const K = 1080 / H, bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bs(Math.round(w * K), Math.round(h * K)); bloom.setSize(W, H); }
  composer.addPass(new OutputPass());
  const smaa = new SMAAPass(); composer.addPass(smaa);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uFrame: { value: 0 }, uFlash: { value: 0 }, uCA: { value: 0.006 }, uVig: { value: 1 }, uLift: { value: 0 }, uBox: { value: 0.0963 }, uRes: { value: new THREE.Vector2(W, H) }, uWeave: { value: new THREE.Vector2() } },
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uFrame,uFlash,uCA,uVig,uLift,uBox; uniform vec2 uRes,uWeave; varying vec2 vUv;
      float h(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
      void main(){ vec2 uv=vUv+uWeave; vec2 d=uv-0.5; float r2=dot(d,d);
        vec2 off=d*r2*uCA*4.0;
        vec3 c=vec3(texture2D(tDiffuse,uv-off).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv+off*1.2).b);
        float l=dot(c,vec3(.2126,.7152,.0722));
        c=mix(c, c*vec3(0.78,1.0,1.10)+vec3(0.0,0.006,0.010), smoothstep(0.45,0.0,l)*0.75); // teal shadows
        c=mix(c, c*vec3(1.06,0.96,0.90), smoothstep(0.35,1.0,l)*0.5);                   // warm highlights
        c=max(c-0.018+uLift,0.0)/(1.0-0.018); c=pow(c,vec3(1.12));                          // crushed blacks
        float v=smoothstep(1.05,0.25,length(d*vec2(1.0,0.72))*1.3); c*=mix(1.0,v,uVig);
        vec2 gp=vUv*vec2(1920.0,1080.0)-0.5; vec2 i0=floor(gp); vec2 f=gp-i0; // grain on a 1080 grid
        float n00=h(vec3(i0+0.5,uFrame))+h(vec3((i0+0.5)*0.5,uFrame+7.0)), n10=h(vec3(i0+vec2(1.5,0.5),uFrame))+h(vec3((i0+vec2(1.5,0.5))*0.5,uFrame+7.0));
        float n01=h(vec3(i0+vec2(0.5,1.5),uFrame))+h(vec3((i0+vec2(0.5,1.5))*0.5,uFrame+7.0)), n11=h(vec3(i0+1.5,uFrame))+h(vec3((i0+1.5)*0.5,uFrame+7.0));
        float g=mix(mix(n00,n10,f.x),mix(n01,n11,f.x),f.y)-1.0;
        c+=g*0.05*(1.0-l*0.6);
        c=mix(c,vec3(1.0),uFlash);
        if (vUv.y<uBox || vUv.y>1.0-uBox) c=vec3(0.0);
        gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);} `,
  });
  composer.addPass(grade);

  function glowsOf(scene) {
    if (!scene.userData._noDepth) { const a = []; scene.traverse(o => { if (o.userData.noDepth) a.push(o); }); scene.userData._noDepth = a; }
    return scene.userData._noDepth;
  }
  /** render one frame of scene/camera with post values v at track time t */
  function frame(scene, camera, v, t) {
    const P = { ...POST_DEFAULTS, ...(v || {}) };
    camera.near = NEAR; camera.far = FAR; camera.aspect = W / H; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderPass.scene = scene; renderPass.camera = camera;
    gtao.scene = scene; gtao.camera = camera; gtao.blendIntensity = P.ao;
    gtao.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
    bokeh.scene = scene; bokeh.camera = camera;
    bokeh.uniforms.focus.value = Math.max(0.1, P.focusDistance); bokeh.uniforms.aperture.value = P.aperture; bokeh.uniforms.maxblur.value = P.maxblur;
    bloom.threshold = P.bloomThreshold; bloom.strength = P.bloomStrength;
    renderer.toneMappingExposure = P.exposure;
    hidden = glowsOf(scene);
    const fr = Math.floor(t * 30);
    grade.uniforms.uFrame.value = fr % 997; grade.uniforms.uFlash.value = P.flash; grade.uniforms.uLift.value = P.lift;
    grade.uniforms.uCA.value = P.ca; grade.uniforms.uVig.value = P.vignette;
    grade.uniforms.uWeave.value.set((hash1(fr) - .5) * 0.0006, (hash1(fr + 3) - .5) * 0.0006);
    composer.render(1 / 30);
  }
  /** SMAA lookup images decode asynchronously; a frame shot before they land is anti-aliased differently (purity) */
  async function ready() { for (const tx of [smaa._areaTexture, smaa._searchTexture]) { await tx.image.decode(); tx.needsUpdate = true; } }
  /** focus helper: view-space distance from camera to a world point */
  const _d = new THREE.Vector3();
  function focusOn(camera, p) { camera.updateMatrixWorld(); camera.getWorldDirection(_d); return Math.max(0.1, _d.dot(p.clone().sub(camera.position))); }
  return { renderer, composer, frame, ready, focusOn, passes: { renderPass, gtao, bokeh, bloom, smaa, grade } };
}
