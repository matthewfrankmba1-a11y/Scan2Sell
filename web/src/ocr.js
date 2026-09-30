// Reads the printed text on a box label (style code, "US 10", ...).
// Tesseract (~5 MB incl. English model) loads on first use, then is cached.
let workerPromise = null;
let chain = Promise.resolve();

function worker() {
  workerPromise ??= import("tesseract.js")
    .then(({ createWorker }) => createWorker("eng"))
    .catch((err) => {
      workerPromise = null;
      throw err;
    });
  return workerPromise;
}

/** OCR jobs run one at a time so the phone stays responsive. */
export function readLabel(canvas) {
  const job = chain.then(async () => {
    const w = await worker();
    const { data } = await w.recognize(canvas);
    return data.text ?? "";
  });
  chain = job.catch(() => {});
  return job;
}
