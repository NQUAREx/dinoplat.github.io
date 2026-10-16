// Offline thumbnails of the actual GLB models, not runtime preview renderers.
import { chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile),
  port = 4190,
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 192, height: 192 },
    deviceScaleFactor: 1,
  });
  await page.route(`${origin}/__preview`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>body{margin:0}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">
    import * as T from 'three'; import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(192,192);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
    const scene=new T.Scene(), camera=new T.PerspectiveCamera(35,1,.01,100), light=new T.DirectionalLight(0xffffff,2.2); light.position.set(-3,5,-4);scene.add(light,new T.HemisphereLight(0xd9f6ff,0xb9a27d,2));
    const gltf=await new GLTFLoader().loadAsync('/src/assets/game-models.glb');scene.add(gltf.scene);
    const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh){o.material=new T.MeshLambertMaterial({vertexColors:true});meshes.push(o);o.visible=false;}});
    window.preview=id=>{ const name=id==='dino-green'?'dinosaur':id;for(const m of meshes)m.visible=m.name===name;gltf.scene.updateMatrixWorld(true);const mesh=meshes.find(m=>m.name===name),box=new T.Box3().setFromObject(mesh),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());const distance=size.length()*.57/Math.sin(T.MathUtils.degToRad(17.5));camera.position.copy(center).add(new T.Vector3(2.7,1.8,-4).normalize().multiplyScalar(distance));camera.lookAt(center);renderer.render(scene,camera);}; window.ready=true;
    </script>`,
    }),
  );
  await page.goto(`${origin}/__preview`);
  await page.waitForFunction(() => window.ready);
  await mkdir("public/shop", { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "dinorun-shop-"));
  for (const id of [
    "dino-green",
    "dino-white",
    "dino-pink",
    "hat-cap",
    "hat-safari",
    "hat-crown",
    "boots-red",
    "boots-blue",
    "boots-gold",
  ]) {
    await page.evaluate((id) => window.preview(id), id);
    const png = join(temporary, `${id}.png`);
    await page
      .locator("canvas")
      .screenshot({ path: png, omitBackground: true });
    await exec("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      png,
      "-c:v",
      "libwebp",
      "-lossless",
      "1",
      `public/shop/${id}.webp`,
    ]);
    console.log(id);
  }
} finally {
  await browser?.close();
  server.kill();
}
