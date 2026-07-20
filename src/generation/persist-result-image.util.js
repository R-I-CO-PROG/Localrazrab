"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistGenerationResultImage = persistGenerationResultImage;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
async function downloadRemoteImage(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
        throw new Error(`Failed to download image (${res.status}): ${url.slice(0, 120)}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
async function persistGenerationResultImage(generatedOutput, outputPath) {
    const filename = (0, path_1.basename)(outputPath);
    if (generatedOutput.startsWith('/uploads/')) {
        return generatedOutput;
    }
    if ((0, fs_1.existsSync)(outputPath)) {
        return `/uploads/generated/${filename}`;
    }
    if (/^https?:\/\//i.test(generatedOutput)) {
        const buf = await downloadRemoteImage(generatedOutput);
        await (0, promises_1.writeFile)(outputPath, buf);
        return `/uploads/generated/${filename}`;
    }
    if (generatedOutput !== outputPath && (0, fs_1.existsSync)(generatedOutput)) {
        await (0, promises_1.copyFile)(generatedOutput, outputPath);
    }
    else if (!(0, fs_1.existsSync)(outputPath) && (0, fs_1.existsSync)(generatedOutput)) {
        await (0, promises_1.copyFile)(generatedOutput, outputPath);
    }
    if (!(0, fs_1.existsSync)(outputPath)) {
        throw new Error(`Generated image file missing: ${outputPath}`);
    }
    return `/uploads/generated/${filename}`;
}
//# sourceMappingURL=persist-result-image.util.js.map