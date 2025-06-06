const log = document.getElementById("log");
const canvas = document.getElementById("canvas");
const intensitySlider = document.getElementById("intensity");
let device, context, format, pipeline, bindGroup, uniformBuffer, texture, sampler;
let canvasSize = [0, 0];

function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  canvasSize = [canvas.width, canvas.height];
}

async function initWebGPU() {
  try {
    if (!navigator.gpu) {
      logMsg("❌ WebGPU no disponible. Usa Chrome 113+ con HTTPS/localhost.");
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      logMsg("❌ No se pudo obtener el adaptador WebGPU.");
      return false;
    }

    device = await adapter.requestDevice();
    context = canvas.getContext("webgpu");
    if (!context) {
      logMsg("❌ No se pudo obtener el contexto WebGPU.");
      return false;
    }

    format = navigator.gpu.getPreferredCanvasFormat();
    resizeCanvas();
    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

    sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear"
    });

    uniformBuffer = device.createBuffer({
      size: 16, // intensity (f32) + resolution (vec2f) + padding (f32)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const shaderCode = `
      struct Uniforms {
        intensity: f32,
        resolution: vec2f,
        padding: f32
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
        // Clamp UVs to avoid sampling outside the texture
        let clampedUV = clamp(distortedUV, vec2f(0.0), vec2f(1.0));
        return textureSample(img, smp, clampedUV);
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
    return true;
  } catch (err) {
    logMsg("❌ ERROR initWebGPU: " + err.message);
    return false;
  }
}

async function loadImageToTexture(fileOrUrl) {
  try {
    let bitmap;
    if (typeof fileOrUrl === "string") {
      const response = await fetch(fileOrUrl);
      if (!response.ok) throw new Error(`No se pudo cargar la imagen: ${response.status}`);
      const blob = await response.blob();
      bitmap = await createImageBitmap(blob);
    } else {
      bitmap = await createImageBitmap(fileOrUrl);
    }

    logMsg(`🖼️ Imagen cargada: ${bitmap.width}x${bitmap.height}`);

    texture = device.createTexture({
      size: [bitmap.width, bitmap.height, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: true },
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

function updateUniforms(intensity) {
  const array = new Float32Array([intensity, canvasSize[0], canvasSize[1], 0.0]);
  device.queue.writeBuffer(uniformBuffer, 0, array