
const log = document.getElementById("log");
function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

const canvas = document.getElementById("canvas");
const intensitySlider = document.getElementById("intensity");
let device, context, format, pipeline, bindGroup, uniformBuffer, texture, sampler;
let canvasSize = [0, 0];

async function initWebGPU() {
  try {
    if (!navigator.gpu) {
      logMsg("❌ WebGPU no disponible.");
      return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    device = await adapter.requestDevice();
    context = canvas.getContext("webgpu");
    format = navigator.gpu.getPreferredCanvasFormat();

    resizeCanvas();
    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

    sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const shaderCode = `
      struct Uniforms {
        intensity: f32,
        resolution: vec2f
      };
      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var img: texture_2d<f32>;
      @group(0) @binding(2) var smp: sampler;

      @vertex
      fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
        var pos = array<vec2f, 6>(
          vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
        );
        return vec4f(pos[i], 0.0, 1.0);
      }

      @fragment
      fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
        let uv = pos.xy / uniforms.resolution;
        let center = vec2f(0.5, 0.5);
        let offset = uv - center;
        let dist = length(offset);
        let strength = uniforms.intensity;
        let distortedUV = uv + normalize(offset) * sin(dist * 40.0) * strength * 0.05;
        return textureSample(img, smp, distortedUV);
      }
    `;

    const shaderModule = device.createShaderModule({ code: shaderCode });

    pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shaderModule, entryPoint: "vs" },
      fragment: {
        module: shaderModule,
        entryPoint: "fs",
        targets: [{ format }]
      },
      primitive: { topology: "triangle-list" }
    });

    logMsg("✅ WebGPU inicializado.");
  } catch (err) {
    logMsg("❌ ERROR initWebGPU: " + err.message);
  }
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  canvasSize = [canvas.width, canvas.height];
}

function updateUniforms(intensity) {
  const array = new Float32Array([intensity, ...canvasSize, 0.0]);
  device.queue.writeBuffer(uniformBuffer, 0, array.buffer);
  logMsg("🎚️ Intensidad: " + intensity);
}

async function loadImageToTexture(file) {
  try {
    const bitmap = await createImageBitmap(file);
    logMsg("🖼️ Imagen cargada: " + bitmap.width + "x" + bitmap.height);

    texture = device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      [bitmap.width, bitmap.height]
    );

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: sampler }
      ]
    });

    logMsg("✅ Textura lista.");
    render();
  } catch (err) {
    logMsg("❌ ERROR imagen: " + err.message);
  }
}

function render() {
  try {
    if (!texture || !bindGroup) {
      logMsg("⚠️ Textura no cargada.");
      return;
    }

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
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
  } catch (err) {
    logMsg("❌ ERROR render: " + err.message);
  }
}

document.getElementById("imageUpload").addEventListener("change", (e) => {
  if (e.target.files[0]) {
    loadImageToTexture(e.target.files[0]);
  }
});

intensitySlider.addEventListener("input", (e) => {
  updateUniforms(parseFloat(e.target.value));
  render();
});

window.addEventListener("resize", () => {
  resizeCanvas();
  updateUniforms(parseFloat(intensitySlider.value));
  render();
});

initWebGPU().then(() => {
  resizeCanvas();
  updateUniforms(parseFloat(intensitySlider.value));
});
