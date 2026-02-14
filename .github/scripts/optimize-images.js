// .github/scripts/optimize-images.js
// Converts static images (JPG/PNG/WEBP) with Sharp and GIFs to WebM with FFmpeg.
// Requires: ffmpeg, sharp, glob

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { glob } from "glob";
import { spawnSync } from "child_process";

const srcDir = "images";
const outDir = "images-optimized";
const thumbDir = "images-thumbs";
const indexFile = "index.json";

const MAX_FFMPEG_MS = 90000; // 90s per ffmpeg invocation (prevents CI hangs)

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(thumbDir, { recursive: true });

function runCmd(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: res.status === 0, stdout: res.stdout, stderr: res.stderr, code: res.status };
}

// Check ffmpeg presence
const ffCheck = runCmd("ffmpeg", ["-version"]);
if (!ffCheck.ok) {
  console.error("❌ FFmpeg not found in PATH. GIF → WebM conversion will fail.");
} else {
  console.log("✅ FFmpeg detected:", ffCheck.stdout.split("\n")[0]);
}

// Find all supported files
const pattern = `${srcDir}/**/*.+(jpg|jpeg|png|webp|gif|JPG|JPEG|PNG|WEBP|GIF)`;
const files = await glob(pattern, { nocase: true });
const gifs = files.filter(f => path.extname(f).toLowerCase() === ".gif");
const statics = files.filter(f => path.extname(f).toLowerCase() !== ".gif");
const orderedFiles = [...statics, ...gifs];
if (!files.length) {
  console.log("❌ No images found in /images");
  process.exit(0);
}
console.log(`Found ${files.length} files to process.`);

const indexData = [];

for (const file of orderedFiles) {
  try {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    console.log(`\n---\nProcessing: ${file}`);

    /* ===== Handle GIFs via FFmpeg ===== */
    if (ext === ".gif") {
      console.log("Detected GIF. Converting to WebM...");

      const optimizedWebM = path.join(outDir, `${base}.webm`);
      const thumbWebM = path.join(thumbDir, `${base}.webm`);

      // Try VP9 first
      let args = [
        "-y",
        "-hide_banner",
        "-i", file,
        "-vf", "fps=30,scale='min(1280,iw)':-2:flags=lanczos",
        "-pix_fmt", "yuv420p",
        "-c:v", "libvpx-vp9",
        "-deadline", "good",
        "-cpu-used", "4",
        "-row-mt", "1",
        "-b:v", "0",
        "-crf", "35",
        "-auto-alt-ref", "0",
        "-an",
        optimizedWebM
      ];
      let r = runCmd("ffmpeg", args, { timeout: MAX_FFMPEG_MS });

      // Fallback to VP8 if VP9 fails
      if (!r.ok) {
        console.warn("⚠️ VP9 failed, retrying with VP8...");
        args = [
          "-y",
          "-hide_banner",
          "-i", file,
        "-vf", "fps=30,scale='min(1280,iw)':-2:flags=lanczos",
          "-pix_fmt", "yuv420p",
          "-c:v", "libvpx",
          "-b:v", "0",
          "-crf", "30",
          "-an",
          optimizedWebM
        ];
        r = runCmd("ffmpeg", args, { timeout: MAX_FFMPEG_MS });
      }

      if (!r.ok) {
        console.error(`❌ FFmpeg failed for ${file}`);
        console.error(r.stderr.slice(0, 1000));
        fs.copyFileSync(file, path.join(outDir, `${base}.gif`));
        console.warn("Copied original GIF as fallback.");
        continue;
      }
      console.log("Converted full GIF →", optimizedWebM);

      // Create thumbnail WebM (3 seconds, square crop)
      const thumbArgs = [
        "-y",
        "-hide_banner",
        "-i", file,
        "-vf", "fps=30,scale='min(1280,iw)':-2:flags=lanczos",
        "-vf",
        "fps=15,scale=480:480:force_original_aspect_ratio=increase,crop=480:480,setsar=1",
        "-t", "3",
        "-pix_fmt", "yuv420p",
        "-c:v", "libvpx",
        "-deadline", "good",
        "-cpu-used", "4",
        "-b:v", "0",
        "-crf", "40",
        "-an",
        thumbWebM
      ];
      const rThumb = runCmd("ffmpeg", thumbArgs, { timeout: MAX_FFMPEG_MS });
      if (!rThumb.ok) {
        console.error("❌ Failed to create thumbnail WebM:", rThumb.stderr.slice(0, 800));
        continue;
      }
      console.log("Created thumbnail WebM →", thumbWebM);

      indexData.push({
        original: path.relative(".", file).replace(/\\/g, "/"),
        optimized: { webm: path.relative(".", optimizedWebM).replace(/\\/g, "/") },
        thumbnail: { webm: path.relative(".", thumbWebM).replace(/\\/g, "/") },
        format: "webm"
      });
      continue;
    }

    /* ===== Handle static images via Sharp ===== */
    console.log("Static image. Optimizing with Sharp...");

    const optimizedWebP = path.join(outDir, `${base}.webp`);
    const optimizedJPG = path.join(outDir, `${base}.jpg`);
    const thumbWebP = path.join(thumbDir, `${base}.webp`);
    const thumbJPG = path.join(thumbDir, `${base}.jpg`);

    // Faster defaults for CI: WebP + JPG fallback (AVIF optional, but intentionally skipped for speed)
    const full = sharp(file).resize({ width: 1600, withoutEnlargement: true });
    await Promise.all([
      full.clone().webp({ quality: 80 }).toFile(optimizedWebP),
      full.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(optimizedJPG),
    ]);

    const thumb = sharp(file).resize({ width: 360, height: 360, fit: "cover", position: "centre" });
    await Promise.all([
      thumb.clone().webp({ quality: 60 }).toFile(thumbWebP),
      thumb.clone().jpeg({ quality: 72, mozjpeg: true }).toFile(thumbJPG),
    ]);

    indexData.push({
      original: path.relative(".", file).replace(/\\/g, "/"),
      optimized: {
        webp: path.relative(".", optimizedWebP).replace(/\\/g, "/"),
        jpg: path.relative(".", optimizedJPG).replace(/\\/g, "/")
      },
      thumbnail: {
        webp: path.relative(".", thumbWebP).replace(/\\/g, "/"),
        jpg: path.relative(".", thumbJPG).replace(/\\/g, "/")
      },
      format: "image"
    });
  } catch (err) {
    console.error(`❌ Error processing ${file}:`, err);
  }
}

// Write index.json
fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));
console.log(`\n✅ Done! ${indexData.length} items written to ${indexFile}`);
