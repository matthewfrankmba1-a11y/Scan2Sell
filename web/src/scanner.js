import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";
import wasmURL from "zxing-wasm/reader/zxing_reader.wasm?url";
import { normalizeBarcode } from "../shared/labelParser.js";
import { sleep } from "./util.js";

// Serve the barcode decoder from this app instead of a third-party CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmURL : prefix + path),
  },
});

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
const COOLDOWN_MS = 4000; // ignore the same code re-entering the frame for this long
const SCAN_INTERVAL_MS = 120;

/** Continuous camera barcode scanner. `onDetect(barcode, frameCanvas)` */
export class Scanner {
  constructor(video, onDetect) {
    this.video = video;
    this.onDetect = onDetect;
    this.detector = new BarcodeDetector({ formats: FORMATS });
    this.lastSeen = new Map();
    this.running = false;
    this.stream = null;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser can't use the camera. Open the app in Safari over https.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  get track() {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  get torchSupported() {
    return Boolean(this.track?.getCapabilities?.().torch);
  }

  async setTorch(on) {
    await this.track?.applyConstraints({ advanced: [{ torch: on }] });
  }

  async loop() {
    while (this.running) {
      if (this.video.readyState >= 2) {
        try {
          const codes = await this.detector.detect(this.video);
          for (const code of codes) this.handle(code.rawValue);
        } catch {
          // A dropped frame; keep scanning.
        }
      }
      await sleep(SCAN_INTERVAL_MS);
    }
  }

  handle(raw) {
    const barcode = normalizeBarcode(raw);
    if (!barcode) return;
    const now = Date.now();
    if (now - (this.lastSeen.get(barcode) ?? 0) < COOLDOWN_MS) {
      this.lastSeen.set(barcode, now); // still in view: extend the cooldown
      return;
    }
    this.lastSeen.set(barcode, now);
    this.onDetect(barcode, this.captureFrame());
  }

  /** Current frame (downscaled) for reading the box label text. */
  captureFrame(maxWidth = 1600) {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) return null;
    const scale = Math.min(1, maxWidth / w);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d").drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
}
