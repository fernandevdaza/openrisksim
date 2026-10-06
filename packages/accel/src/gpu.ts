/**
 * WebGPU detection and runner. Works in window and dedicated-worker scopes. Never imported
 * side effects; everything is feature-detected at call time.
 */
import type { CompiledProgram, GpuInfo, GpuRunner } from "./types";
import { WORKGROUP_SIZE } from "./wgsl";

/** Upper bound on trials per dispatch (keeps progress granular and buffers moderate). */
const MAX_CHUNK = 1 << 20;

function gpuApi(): GPU | null {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  const gpu = nav && (nav as Navigator & { gpu?: GPU }).gpu;
  return gpu ?? null;
}

function guessBackend(info: { vendor: string; description: string; architecture: string }): string | undefined {
  const ua = ((globalThis as { navigator?: Navigator }).navigator?.userAgent ?? "").toLowerCase();
  const desc = `${info.vendor} ${info.description} ${info.architecture}`.toLowerCase();
  if (/metal/.test(desc)) return "Metal";
  if (/d3d12|direct3d/.test(desc)) return "D3D12";
  if (/vulkan/.test(desc)) return "Vulkan";
  if (/iphone|ipad|mac os|macintosh/.test(ua) || info.vendor.toLowerCase() === "apple") return "Metal";
  if (/windows/.test(ua)) return "D3D12";
  if (/android|linux|cros/.test(ua)) return "Vulkan";
  return undefined;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

async function adapterInfo(adapter: GPUAdapter): Promise<{ vendor: string; architecture: string; description: string; isFallback?: boolean }> {
  type InfoLike = { vendor?: string; architecture?: string; description?: string; device?: string; isFallbackAdapter?: boolean };
  let info: InfoLike | undefined = (adapter as unknown as { info?: InfoLike }).info;
  if (!info) {
    const req = (adapter as unknown as { requestAdapterInfo?: () => Promise<InfoLike> }).requestAdapterInfo;
    if (typeof req === "function") {
      try {
        info = await req.call(adapter);
      } catch {
        info = undefined;
      }
    }
  }
  return {
    vendor: info?.vendor ?? "",
    architecture: info?.architecture ?? "",
    description: info?.description || info?.device || "",
    isFallback: info?.isFallbackAdapter,
  };
}

async function requestAdapter(): Promise<GPUAdapter | null> {
  const gpu = gpuApi();
  if (!gpu || typeof gpu.requestAdapter !== "function") return null;
  return withTimeout(gpu.requestAdapter({ powerPreference: "high-performance" }), 5000);
}

async function infoOf(adapter: GPUAdapter): Promise<GpuInfo> {
  const ai = await adapterInfo(adapter);
  const legacyFallback = (adapter as unknown as { isFallbackAdapter?: boolean }).isFallbackAdapter;
  const info: GpuInfo = {
    vendor: ai.vendor,
    architecture: ai.architecture,
    description: ai.description,
    isFallbackAdapter: Boolean(ai.isFallback ?? legacyFallback ?? false),
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
  };
  const backend = guessBackend(ai);
  if (backend) info.backend = backend;
  return info;
}

/** null when WebGPU is unavailable (navigator.gpu missing, no adapter, or blocked). Never throws. */
export async function detectGpu(): Promise<GpuInfo | null> {
  try {
    const adapter = await requestAdapter();
    if (!adapter) return null;
    return await infoOf(adapter);
  } catch {
    return null;
  }
}

function bilingualError(en: string, es: string, name = "Error"): Error {
  const e = new Error(`${en} / ${es}`);
  e.name = name;
  (e as Error & { i18n?: { en: string; es: string } }).i18n = { en, es };
  return e;
}

interface Slot {
  input: GPUBuffer;
  output: GPUBuffer;
  staging: GPUBuffer;
  uniform: GPUBuffer;
  bind: GPUBindGroup;
  f32in: Float32Array;
}

/** Rejects with a bilingual-message Error if the GPU is unavailable/unsupported. */
export async function createGpuRunner(program: CompiledProgram): Promise<GpuRunner> {
  if (!program.gpuSupport.ok) {
    const r = program.gpuSupport.reasons;
    throw bilingualError(
      `This model cannot run on the GPU: ${r.map((x) => (x.cell ? x.cell + ": " : "") + x.message.en).join("; ")}`,
      `Este modelo no puede ejecutarse en la GPU: ${r.map((x) => (x.cell ? x.cell + ": " : "") + x.message.es).join("; ")}`,
    );
  }
  const code = program.toWGSL();
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await requestAdapter();
  } catch {
    adapter = null;
  }
  if (!adapter) throw bilingualError("WebGPU is not available in this browser", "WebGPU no está disponible en este navegador");
  const info = await infoOf(adapter);
  const lim = adapter.limits;
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize,
        maxBufferSize: lim.maxBufferSize,
        maxComputeWorkgroupsPerDimension: lim.maxComputeWorkgroupsPerDimension,
      },
    });
  } catch (e) {
    throw bilingualError(`Could not open the GPU device: ${String(e)}`, `No se pudo abrir el dispositivo GPU: ${String(e)}`);
  }
  let lostReason: string | null = null;
  let disposed = false;
  device.lost.then((l) => {
    if (!disposed) lostReason = l.message || l.reason || "unknown";
  });

  device.pushErrorScope("validation");
  const module = device.createShaderModule({ code });
  const ci = await module.getCompilationInfo();
  const errors = ci.messages.filter((m) => m.type === "error");
  if (errors.length) {
    device.destroy();
    const text = errors.slice(0, 3).map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join("; ");
    throw bilingualError(`The GPU shader failed to compile: ${text}`, `El shader de GPU no compiló: ${text}`);
  }
  const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } }).catch((e: unknown) => {
    device.destroy();
    throw bilingualError(`Could not create the GPU pipeline: ${String(e)}`, `No se pudo crear el pipeline de GPU: ${String(e)}`);
  });
  const scopeErr = await device.popErrorScope();
  if (scopeErr) {
    device.destroy();
    throw bilingualError(`GPU validation error: ${scopeErr.message}`, `Error de validación de GPU: ${scopeErr.message}`);
  }

  const nIn = program.inputCount;
  const nOut = program.outputCount;
  const maxBinding = Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize);
  const maxWg = device.limits.maxComputeWorkgroupsPerDimension;
  const chunk = Math.max(
    1,
    Math.min(
      MAX_CHUNK,
      nIn > 0 ? Math.floor(maxBinding / (4 * nIn)) : MAX_CHUNK,
      nOut > 0 ? Math.floor(maxBinding / (4 * nOut)) : MAX_CHUNK,
      maxWg * WORKGROUP_SIZE * maxWg,
    ),
  );

  const slots: Slot[] = [];
  const makeSlot = (): Slot => {
    const inBytes = Math.max(16, chunk * nIn * 4);
    const outBytes = Math.max(16, chunk * nOut * 4);
    const input = device.createBuffer({ size: inBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const output = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const staging = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: input } },
        { binding: 1, resource: { buffer: output } },
        { binding: 2, resource: { buffer: uniform } },
      ],
    });
    return { input, output, staging, uniform, bind, f32in: new Float32Array(Math.max(4, chunk * nIn)) };
  };

  const checkLost = () => {
    if (lostReason !== null) throw bilingualError(`The GPU device was lost: ${lostReason}`, `Se perdió el dispositivo GPU: ${lostReason}`);
    if (disposed) throw bilingualError("The GPU runner was disposed", "El ejecutor de GPU fue liberado");
  };

  /** Upload + dispatch one chunk on a slot; returns the promise of its mapped output. */
  const submit = (slot: Slot, inputs: Float64Array, start: number, count: number): Promise<void> => {
    if (nIn > 0) {
      const src = inputs.subarray(start * nIn, (start + count) * nIn);
      slot.f32in.set(src);
      device.queue.writeBuffer(slot.input, 0, slot.f32in.buffer, slot.f32in.byteOffset, count * nIn * 4);
    }
    const groups = Math.ceil(count / WORKGROUP_SIZE);
    const gx = Math.min(groups, maxWg);
    const gy = Math.ceil(groups / gx);
    device.queue.writeBuffer(slot.uniform, 0, new Uint32Array([count, gx * WORKGROUP_SIZE, 0, 0]));
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, slot.bind);
    pass.dispatchWorkgroups(gx, gy);
    pass.end();
    enc.copyBufferToBuffer(slot.output, 0, slot.staging, 0, Math.max(4, count * nOut * 4));
    device.queue.submit([enc.finish()]);
    return slot.staging.mapAsync(GPUMapMode.READ, 0, Math.max(4, count * nOut * 4));
  };

  let busy = false;

  const runner: GpuRunner = {
    info,
    async evaluate(inputs, n, options = {}) {
      checkLost();
      if (busy) throw bilingualError("The GPU runner is busy", "El ejecutor de GPU está ocupado");
      const total = Math.max(0, Math.floor(n));
      if (inputs.length < total * nIn) throw new RangeError("GpuRunner.evaluate: inputs too short");
      const out = new Float64Array(total * nOut);
      if (total === 0 || nOut === 0) return out;
      busy = true;
      try {
        while (slots.length < 2) slots.push(makeSlot());
        const aborted = () => options.signal?.aborted === true;
        // Double buffering: chunk k+1 is submitted before chunk k is read back.
        const pending: { slot: Slot; start: number; count: number; done: Promise<void> }[] = [];
        let next = 0;
        let slotIdx = 0;
        let completed = 0;
        const launch = () => {
          const count = Math.min(chunk, total - next);
          const slot = slots[slotIdx];
          slotIdx = (slotIdx + 1) % slots.length;
          pending.push({ slot, start: next, count, done: submit(slot, inputs, next, count) });
          next += count;
        };
        launch();
        while (pending.length) {
          if (next < total && pending.length < slots.length && !aborted()) launch();
          const p = pending.shift()!;
          try {
            await p.done;
          } catch (e) {
            checkLost();
            throw bilingualError(`GPU read-back failed: ${String(e)}`, `Falló la lectura de la GPU: ${String(e)}`);
          }
          const data = new Float32Array(p.slot.staging.getMappedRange(0, Math.max(4, p.count * nOut * 4)));
          const base = p.start * nOut;
          const len = p.count * nOut;
          for (let i = 0; i < len; i++) {
            const v = data[i];
            out[base + i] = v - v === 0 ? v : NaN;
          }
          p.slot.staging.unmap();
          completed += p.count;
          options.onProgress?.(completed, total);
          checkLost();
          if (aborted()) {
            // drain in-flight work before rejecting so the buffers can be reused
            for (const q of pending) {
              await q.done.catch(() => undefined);
              if (q.slot.staging.mapState === "mapped") q.slot.staging.unmap();
            }
            throw bilingualError("GPU evaluation aborted", "Evaluación en GPU cancelada", "AbortError");
          }
        }
        return out;
      } finally {
        busy = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const s of slots) {
        s.input.destroy();
        s.output.destroy();
        s.staging.destroy();
        s.uniform.destroy();
      }
      slots.length = 0;
      device.destroy();
    },
  };
  return runner;
}
