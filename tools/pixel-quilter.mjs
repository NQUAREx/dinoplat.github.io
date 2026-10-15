/** Offline minimum-error hard cuts: no mirroring, blur or blended seam bands. */
export class PixelQuilter {
  cut(width, height, cost, fixedEnds = false) {
    let previous = new Float64Array(width),
      next = new Float64Array(width);
    const parent = new Int16Array(width * height),
      middle = Math.floor(width / 2);
    for (let x = 0; x < width; x++)
      previous[x] = fixedEnds && x !== middle ? Infinity : cost(x, 0);
    for (let y = 1; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let from = x;
        if (x > 0 && previous[x - 1] < previous[from]) from = x - 1;
        if (x + 1 < width && previous[x + 1] < previous[from]) from = x + 1;
        parent[y * width + x] = from;
        next[x] = previous[from] + cost(x, y);
      }
      [previous, next] = [next, previous];
    }
    let x = middle;
    if (!fixedEnds)
      for (let i = 0; i < width; i++) if (previous[i] < previous[x]) x = i;
    const path = new Int16Array(height);
    for (let y = height - 1; y >= 0; y--) {
      path[y] = x;
      x = parent[y * width + x];
    }
    return path;
  }
  error(a, ai, b, bi) {
    let sum = 1;
    for (let c = 0; c < 3; c++) {
      const d = a[ai + c] - b[bi + c];
      sum += d * d;
    }
    return sum;
  }
  wrap(source, width, height, vertical) {
    const overlap = 24,
      size = vertical ? height : width,
      length = vertical ? width : height;
    const at = (p, q) => (vertical ? p * width + q : q * width + p) * 4;
    const cut = this.cut(
      overlap - 2,
      length,
      (p, q) =>
        this.error(source, at(size - overlap + p + 1, q), source, at(p + 1, q)),
      true,
    );
    const outWidth = vertical ? width : width - overlap,
      outHeight = vertical ? height - overlap : height;
    const output = Buffer.alloc(outWidth * outHeight * 4);
    for (let y = 0; y < outHeight; y++)
      for (let x = 0; x < outWidth; x++) {
        const p = vertical ? y : x,
          q = vertical ? x : y;
        const from = p < overlap && p <= cut[q] + 1 ? size - overlap + p : p;
        source.copy(
          output,
          (y * outWidth + x) * 4,
          at(from, q),
          at(from, q) + 4,
        );
      }
    return output;
  }
  periodic(source) {
    const horizontal = this.wrap(source, 128, 128, false);
    const square = this.wrap(horizontal, 104, 128, true);
    const output = Buffer.alloc(128 * 128 * 4);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const from =
          (Math.floor((y * 104) / 128) * 104 + Math.floor((x * 104) / 128)) * 4;
        square.copy(output, (y * 128 + x) * 4, from, from + 4);
      }
    return output;
  }
  interior(source, candidate) {
    const error = (x, y) =>
      this.error(source, (y * 128 + x) * 4, candidate, (y * 128 + x) * 4);
    const left = this.cut(16, 128, (p, y) => error(p + 6, y));
    const right = this.cut(16, 128, (p, y) => error(p + 106, y));
    const top = this.cut(16, 128, (p, x) => error(x, p + 6));
    const bottom = this.cut(16, 128, (p, x) => error(x, p + 106));
    const output = Buffer.from(source);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        if (
          x <= left[y] + 6 ||
          x >= right[y] + 106 ||
          y <= top[x] + 6 ||
          y >= bottom[x] + 106
        )
          continue;
        const at = (y * 128 + x) * 4;
        candidate.copy(output, at, at, at + 4);
      }
    return output;
  }
}
