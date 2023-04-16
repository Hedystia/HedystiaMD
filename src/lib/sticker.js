const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const webp = require("node-webpmux");
const {fromBuffer} = require("file-type");
const uploadFile = require("./uploadFile");
const uploadImage = require("./uploadImage");
const {spawn} = require("child_process");
const fluent_ffmpeg = require("fluent-ffmpeg");
const {ffmpeg} = require("./converter");

const tmp = path.join(__dirname, "../../tmp");

async function canvas(code, type = "png", quality = 0.92) {
  let res = await fetch(
    "https://nurutomo.herokuapp.com/api/canvas?" +
      queryURL({
        type,
        quality,
      }),
    {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": code.length,
      },
      body: code,
    }
  );
  let image = await res.buffer();
  return image;
}

function queryURL(queries) {
  return new URLSearchParams(Object.entries(queries));
}

function sticker2(img, url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (url) {
        let res = await fetch(url);
        if (res.status !== 200) throw await res.text();
        img = await res.buffer();
      }
      const dateGet = new Date();
      let inp = path.join(tmp, +dateGet + ".jpeg", img);
      await fs.promises.writeFile(tmp, +dateGet + ".jpeg", img);
      let ff = spawn("ffmpeg", [
        "-y",
        "-i",
        inp,
        "-vf",
        "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1",
        "-f",
        "png",
        "-",
      ]);
      ff.on("error", reject);
      ff.on("close", async () => {
        await fs.promises.unlink(tmp, +dateGet + ".jpeg", img);
      });
      let bufs = [];
      const [_spawnprocess, ..._spawnargs] = [
        ...(module.exports.support.gm ? ["gm"] : module.exports.magick ? ["magick"] : []),
        "convert",
        "png:-",
        "webp:-",
      ];
      let im = spawn(_spawnprocess, _spawnargs);
      im.on("error", (e) => conn.reply(m.chat, util.format(e), m));
      im.stdout.on("data", (chunk) => bufs.push(chunk));
      ff.stdout.pipe(im.stdin);
      im.on("exit", () => {
        resolve(Buffer.concat(bufs));
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function sticker1(img, url) {
  url = url ? url : await uploadImage(img);
  let {mime} = url ? {mime: "image/jpeg"} : await fromBuffer(img);
  let sc = `let im = await loadImg('data:${mime};base64,'+(await window.loadToDataURI('${url}')))
  c.width = c.height = 512
  let max = Math.max(im.width, im.height)
  let w = 512 * im.width / max
  let h = 512 * im.height / max
  ctx.drawImage(im, 256 - w / 2, 256 - h / 2, w, h)
  `;
  return await canvas(sc, "webp");
}

async function sticker3(img, url, packname, author) {
  url = url ? url : await uploadFile(img);
  let res = await fetch(
    "https://api.xteam.xyz/sticker/wm?" +
      new URLSearchParams(
        Object.entries({
          url,
          packname,
          author,
        })
      )
  );
  return await res.buffer();
}

async function sticker4(img, url) {
  if (url) {
    let res = await fetch(url);
    if (res.status !== 200) throw await res.text();
    img = await res.buffer();
  }
  return await ffmpeg(
    img,
    ["-vf", "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1"],
    "jpeg",
    "webp"
  );
}

async function sticker5(img, url, packname, author, categories = [""], extra = {}) {
  const {Sticker} = require("wa-sticker-formatter");
  const stickerMetadata = {
    type: "default",
    pack: packname,
    author,
    categories,
    ...extra,
  };
  return new Sticker(img ? img : url, stickerMetadata).toBuffer();
}

function sticker6(img, url) {
  return new Promise(async (resolve, reject) => {
    if (url) {
      let res = await fetch(url);
      if (res.status !== 200) throw await res.text();
      let buffer = await res.arrayBuffer();
      img = Buffer.from(buffer);
    }
    const type = (await fromBuffer(img)) || {
      mime: "application/octet-stream",
      ext: "bin",
    };
    if (type.ext == "bin") reject(img);
    const tmp = path.join(__dirname, `../../tmp/${+new Date()}.${type.ext}`);
    const out = path.join(tmp + ".webp");
    await fs.promises.writeFile(tmp, img);
    let Fffmpeg = /video/i.test(type.mime) ? fluent_ffmpeg(tmp).inputFormat(type.ext) : fluent_ffmpeg(tmp).input(tmp);
    Fffmpeg.on("error", function (err) {
      fs.promises.unlink(tmp);
      reject(img);
    })
      .on("end", async function () {
        fs.promises.unlink(tmp);
        resolve(await fs.promises.readFile(out));
      })
      .addOutputOptions([
        `-vcodec`,
        `libwebp`,
        `-vf`,
        `scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse`,
      ])
      .toFormat("webp")
      .save(out);
    setTimeout(() => {
      fs.promises.unlink(tmp + ".webp");
    }, 20000);
  });
}

async function sticker(img, url, ...args) {
  let lastError, stiker;
  for (let func of [sticker3, true && sticker6, sticker5, true && true && sticker4, true && (true || false || false) && sticker2, sticker1].filter(
    (f) => f
  )) {
    try {
      stiker = await func(img, url, ...args);
      if (stiker.includes("html")) continue;
      if (stiker.includes("WEBP")) {
        try {
          return await addExif(stiker, ...args);
        } catch (e) {
          return stiker;
        }
      }
      throw stiker.toString();
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  return lastError;
}

async function addExif(webpSticker, packname, author, categories = [""], extra = {}) {
  const img = new webp.Image();
  const stickerPackId = crypto.randomBytes(32).toString("hex");
  const json = {"sticker-pack-id": stickerPackId, "sticker-pack-name": packname, "sticker-pack-publisher": author, emojis: categories, ...extra};
  let exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  let jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
  let exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  await img.load(webpSticker);
  img.exif = exif;
  return await img.save(null);
}

module.exports = {sticker, sticker1, sticker2, sticker3, sticker4, sticker6, addExif};