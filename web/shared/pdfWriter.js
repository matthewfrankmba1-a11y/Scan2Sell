// Minimal PDF writer: one full-bleed image per page, sized exactly to the label.
// Pixels are Flate-compressed with CompressionStream (browsers and Node).

const encoder = new TextEncoder();

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** RGBA → packed gray or RGB bytes, flattening transparency onto white. */
export function packPixels(rgba, gray) {
  const n = rgba.length / 4;
  const out = new Uint8Array(gray ? n : n * 3);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = rgba[i + 3] / 255;
    const r = rgba[i] * a + 255 * (1 - a);
    const g = rgba[i + 1] * a + 255 * (1 - a);
    const b = rgba[i + 2] * a + 255 * (1 - a);
    if (gray) out[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    else {
      out[p * 3] = Math.round(r);
      out[p * 3 + 1] = Math.round(g);
      out[p * 3 + 2] = Math.round(b);
    }
  }
  return out;
}

/**
 * Builds a PDF. Each page: { widthIn, heightIn, pixelWidth, pixelHeight, rgba, gray }.
 * Returns the file as a Uint8Array.
 */
export async function imagesToPDF(pages) {
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (num, body, stream) => {
    offsets[num] = length;
    push(`${num} 0 obj\n${body}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  for (const [i, page] of pages.entries()) {
    const id = pageIds[i];
    const w = +(page.widthIn * 72).toFixed(3);
    const h = +(page.heightIn * 72).toFixed(3);
    const pixels = await deflate(packPixels(page.rgba, page.gray));
    const content = encoder.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      `/Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
      `/ColorSpace /${page.gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 ` +
      `/Filter /FlateDecode /Length ${pixels.length} >>`, pixels);
    object(id + 2, `<< /Length ${content.length} >>`, content);
  }

  const size = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${size}\n0000000000 65535 f \n`);
  for (let n = 1; n < size; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
