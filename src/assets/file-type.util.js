"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUploadedImageFile = validateUploadedImageFile;
exports.isSvgUploadAllowed = isSvgUploadAllowed;
const promises_1 = require("fs/promises");
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const PDF = [0x25, 0x50, 0x44, 0x46];
function startsWith(buf, sig) {
    if (buf.length < sig.length)
        return false;
    return sig.every((b, i) => buf[i] === b);
}
function detectImageFormat(buf) {
    if (startsWith(buf, PNG))
        return 'png';
    if (startsWith(buf, JPEG))
        return 'jpeg';
    if (startsWith(buf, WEBP_RIFF) && buf.toString('ascii', 8, 12) === 'WEBP')
        return 'webp';
    if (startsWith(buf, PDF))
        return 'pdf';
    return null;
}
async function validateUploadedImageFile(filePath, _ext) {
    const buf = await (0, promises_1.readFile)(filePath);
    if (buf.length < 12)
        return false;
    return detectImageFormat(buf) !== null;
}
function isSvgUploadAllowed() {
    return process.env.NODE_ENV !== 'production' && process.env.ALLOW_SVG_UPLOAD === 'true';
}
//# sourceMappingURL=file-type.util.js.map