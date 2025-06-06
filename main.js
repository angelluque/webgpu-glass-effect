
const log = document.getElementById("log");

function logMsg(msg) {
  console.log(msg);
  log.textContent += "\n" + msg;
}

async function init() {
  try {
    if (!navigator.gpu) {
      logMsg("WebGPU no disponible.");
      return;
    }

    logMsg("Inicializando WebGPU...");

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      logMsg("No se pudo obtener el adaptador GPU.");
      return;
    }

    const device = await adapter.requestDevice();
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("webgpu");

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: "opaque"
    });

    const module = device.createShaderModule({
      code: \`
        @vertex
        fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
          var pos = array<vec2f, 6>(
            vec2f(-1.0, -1.0),
            vec2f(1.0, -1.0),
            vec2f(-1.0, 1.0),
            vec2f(-1.0, 1.0),
            vec2f(1.0, -1.0),
            vec2f(1.0, 1.0)
          );
          return vec4f(pos[index], 0.0, 1.0);
        }

        @fragment
        fn fs() -> @location(0) vec4f {
          return vec4f(0.0, 0.3, 1.0, 1.0); // Azul puro
        }
      \`
    });

    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs"
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format }]
      },
      primitive: { topology: "triangle-list" }
    });

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
    pass.draw(6);
    pass.end();

    device.queue.submit([encoder.finish()]);
    logMsg("Render azul completado.");
  } catch (err) {
    logMsg("❌ ERROR: " + err.message);
  }
}

init();
