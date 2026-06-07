/**
 * Converts unindexed float arrays of positions and normals into a binary STL ArrayBuffer.
 */
export function exportBinarySTL(positions: Float32Array, normals: Float32Array): ArrayBuffer {
  const numTriangles = positions.length / 9;
  const bufferSize = 80 + 4 + numTriangles * 50;
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
  URL.revokeObjectURL(url);
}
