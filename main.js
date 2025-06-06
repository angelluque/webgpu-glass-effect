
const canvas = document.getElementById("canvas");
const log = document.getElementById("log");
const intensitySlider = document.getElementById("intensity");
const intensityValue = document.getElementById("intensityValue");

let device, context, pipeline, sampler;
let uniformBuffer, imageTexture, normalTexture;
let bindGroup;
let imageSize = [1, 1];

function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

async function init() {
  const adapter = await navigator.gpu.requestAdapter();
  device = await adapter.requestDevice();
  context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const shaderModule = device.createShaderModule({
    code: `
      struct Uniforms {
        intensity: f32,
        _pad: vec3f
      };
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var img: texture_2d<f32>;
      @group(0) @binding(2) var norm: texture_2d<f32>;
      @group(0) @binding(3) var smp: sampler;

      struct VertexOut {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f
      };

      @vertex
      fn vs(@builtin(vertex_index) i: u32) -> VertexOut {
        var pos = array<vec2f, 6>(
          vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
        );
        var uvs = array<vec2f, 6>(
          vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
          vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
        );
        var out: VertexOut;
        out.pos = vec4f(pos[i], 0.0, 1.0);
        out.uv = uvs[i];
        return out;
      }

      @fragment
      fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
        let n = textureSample(norm, smp, uv).xy * 2.0 - 1.0;
        let displacedUV = uv + n * uniforms.intensity * 0.1;
        return textureSample(img, smp, displacedUV);
      }
    `
  });

  pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" }
  });

  logMsg("✅ WebGPU inicializado");
}

async function createTextureFromImage(bitmap) {
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
  return texture;
}

async function loadImages(imageFile, normalFile) {
  const imgBitmap = await createImageBitmap(imageFile);
  const normBitmap = await createImageBitmap(normalFile);

  imageTexture = await createTextureFromImage(imgBitmap);
  normalTexture = await createTextureFromImage(normBitmap);
  imageSize = [imgBitmap.width, imgBitmap.height];

  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: imageTexture.createView() },
      { binding: 2, resource: normalTexture.createView() },
      { binding: 3, resource: sampler }
    ]
  });

  logMsg("🖼️ Texturas cargadas.");
  updateAndRender();
}

function updateAndRender() {
  const intensity = parseFloat(intensitySlider.value);
  intensityValue.textContent = intensity.toFixed(2);
  device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([intensity]));

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.2, a: 1 },
      loadOp: "clear",
      storeOp: "store"
    }]
  });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);
  logMsg("✅ Imagen renderizada.");
}

document.getElementById("imageUpload").addEventListener("change", () => {
  const imageFile = document.getElementById("imageUpload").files[0];
  const normalFile = document.getElementById("normalUpload").files[0];
  if (imageFile && normalFile) {
    loadImages(imageFile, normalFile);
  } else {
    logMsg("⚠️ Carga ambas imágenes.");
  }
});

document.getElementById("normalUpload").addEventListener("change", () => {
  const imageFile = document.getElementById("imageUpload").files[0];
  const normalFile = document.getElementById("normalUpload").files[0];
  if (imageFile && normalFile) {
    loadImages(imageFile, normalFile);
  }
});

intensitySlider.addEventListener("input", () => {
  updateAndRender();
});

init();
