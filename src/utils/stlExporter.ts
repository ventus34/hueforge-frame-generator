/**
 * Converts unindexed float arrays of positions and normals into a binary STL ArrayBuffer.
 */
export function exportBinarySTL(positions: Float32Array, normals: Float32Array): ArrayBuffer {
  if (positions.length === 0 || positions.length % 9 !== 0) {
    throw new RangeError('STL positions must contain one or more complete triangles.');
  }
  if (normals.length !== positions.length) {
    throw new RangeError('STL normals must have one vector for every vertex.');
  }
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i])) throw new RangeError(`STL position ${i} is not finite.`);
    if (!Number.isFinite(normals[i])) throw new RangeError(`STL normal ${i} is not finite.`);
  }
  const numTriangles = positions.length / 9;
  for (let triangle = 0; triangle < numTriangles; triangle++) {
    const i = triangle * 9;
    const ax = positions[i + 3] - positions[i];
    const ay = positions[i + 4] - positions[i + 1];
    const az = positions[i + 5] - positions[i + 2];
    const bx = positions[i + 6] - positions[i];
    const by = positions[i + 7] - positions[i + 1];
    const bz = positions[i + 8] - positions[i + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const areaSquared = nx * nx + ny * ny + nz * nz;
    if (!Number.isFinite(areaSquared) || areaSquared === 0) {
      throw new RangeError(`STL triangle ${triangle} is degenerate or exceeds the coordinate range.`);
    }

    const normalIndex = i;
    const normalLengthSquared = normals[normalIndex] ** 2 + normals[normalIndex + 1] ** 2 + normals[normalIndex + 2] ** 2;
    if (!Number.isFinite(normalLengthSquared) || normalLengthSquared === 0) {
      throw new RangeError(`STL triangle ${triangle} has a zero or invalid facet normal.`);
    }
  }
  const bufferSize = 80 + 4 + numTriangles * 50;
  if (!Number.isSafeInteger(bufferSize) || bufferSize > 0x7fffffff) {
    throw new RangeError('STL file is too large to export.');
  }
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Write header (80 bytes)
  const headerText = "HueForge Frame Generator - STL Export";
  for (let i = 0; i < Math.min(headerText.length, 80); i++) {
    view.setUint8(i, headerText.charCodeAt(i));
  }

  // Write triangle count (4 bytes, uint32, little-endian)
  view.setUint32(80, numTriangles, true);

  let offset = 84;
  for (let t = 0; t < numTriangles; t++) {
    const pIdx = t * 9;
    const nIdx = t * 9;

    // Normal vector (use normal from the first vertex of the triangle)
    view.setFloat32(offset, normals[nIdx], true);
    view.setFloat32(offset + 4, normals[nIdx + 1], true);
    view.setFloat32(offset + 8, normals[nIdx + 2], true);
    offset += 12;

    // Vertex 1
    view.setFloat32(offset, positions[pIdx], true);
    view.setFloat32(offset + 4, positions[pIdx + 1], true);
    view.setFloat32(offset + 8, positions[pIdx + 2], true);
    offset += 12;

    // Vertex 2
    view.setFloat32(offset, positions[pIdx + 3], true);
    view.setFloat32(offset + 4, positions[pIdx + 4], true);
    view.setFloat32(offset + 8, positions[pIdx + 5], true);
    offset += 12;

    // Vertex 3
    view.setFloat32(offset, positions[pIdx + 6], true);
    view.setFloat32(offset + 4, positions[pIdx + 7], true);
    view.setFloat32(offset + 8, positions[pIdx + 8], true);
    offset += 12;

    // Attribute byte count (0)
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

/**
 * Initiates a browser download of the binary STL file.
 */
export function downloadSTL(positions: Float32Array, normals: Float32Array, filename: string) {
  const buffer = exportBinarySTL(positions, normals);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
