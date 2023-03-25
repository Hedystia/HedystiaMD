require("./config");
const {
  default: esmileConnect,
  useMultiFileAuthState,
  DisconnectReason,
  generateForwardMessageContent,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  downloadContentFromMessage,
  makeInMemoryStore,
  jidDecode,
  proto,
} = require("@adiwajshing/baileys");
const pino = require("pino");
const fs = require("fs");
const {Boom} = require("@hapi/boom");
const FileType = require("file-type");
const PhoneNumber = require("awesome-phonenumber");
const {imageToWebp, videoToWebp, writeExifImg, writeExifVid} = require("./src/lib/exif");
const path = require("path");
const {smsg, getBuffer, getSizeMedia, sleep} = require("./src/lib/myfunc");

const store = makeInMemoryStore({logger: pino().child({level: "error", stream: "store"})});
store?.readFromFile("./esmile.json");

setInterval(() => {
  store?.writeToFile("./esmile.json");
}, 10_000);

async function startEsmile() {
  const {state, saveCreds} = await useMultiFileAuthState("esmile");
  const esmile = esmileConnect({
    logger: pino({level: "error"}),
    printQRInTerminal: true,
    browser: ["Esmile MD", "Safari", "1.0.1"],
    auth: state,
    version: [2, 2204, 13],
  });

  store.bind(esmile.ev);

  esmile.ws.on("CB:call", async (json) => {
    const callerId = json.content[0].attrs["call-creator"];
    if (json.content[0].tag == "offer") {
      esmile.sendMessage(callerId, {
        text: `_*A.I Auto Block System*_\nIt seems that you tried to call me, unfortunately you will be blocked automatically.`,
      });
      await sleep(8000);
      await esmile.updateBlockStatus(callerId, "block");
    }
  });

  esmile.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      mek = chatUpdate.messages[0];
      if (!mek.message) return;
      mek.message = Object.keys(mek.message)[0] === "ephemeralMessage" ? mek.message.ephemeralMessage.message : mek.message;
      if (mek.key && mek.key.remoteJid === "status@broadcast") return;
      if (!esmile.public && !mek.key.fromMe && chatUpdate.type === "notify") return;
      if (mek.key.id.startsWith("BAE5") && mek.key.id.length === 16) return;
      m = smsg(esmile, mek, store);
      require("./esmile")(esmile, m, chatUpdate, store);
    } catch (err) {
      console.log(err);
    }
  });

  esmile.ev.on("group-participants.update", async (anu) => {
    let metadata = await esmile.groupMetadata(anu.id);
    console.log(anu);
    try {
      let welkompic = {url: "https://telegra.ph/file/69adf1d87f488d4c6a2fe.png"};
      let participants = anu.participants;
      let btn = [
        {
          urlButton: {
            displayText: "Baixar APK do Minecraft",
            url: `http://kuuhaku.ddns.net/Minecraft_1.19.2.apk`,
          },
        },
        {
          quickReplyButton: {
            displayText: "Servidor",
            id: `${prefix}server`,
          },
        },
      ];
      for (let num of participants) {
        if (anu.action == "add") {
          let txt = `Opa, bem vindo ao grupo ${metadata.subject}. Leia as regras e fique a vontade para interagir no grupo.`;
          esmile.sendWelkom(anu.id, txt, esmile.user.name, welkompic, btn);
        }
      }
    } catch (err) {
      console.log(err);
    }
  });

  esmile.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    } else return jid;
  };
  esmile.ev.on("contacts.update", (update) => {
    for (let contact of update) {
      let id = esmile.decodeJid(contact.id);
      if (store && store.contacts) store.contacts[id] = {id, name: contact.notify};
    }
  });

  esmile.getName = (jid, withoutContact = false) => {
    id = esmile.decodeJid(jid);
    withoutContact = esmile.withoutContact || withoutContact;
    let v;
    if (id.endsWith("@g.us"))
      return new Promise(async (resolve) => {
        v = store.contacts[id] || {};
        if (!(v.name || v.subject)) v = esmile.groupMetadata(id) || {};
        resolve(v.name || v.subject || PhoneNumber("+" + id.replace("@s.whatsapp.net", "")).getNumber("international"));
      });
    else
      v =
        id === "0@s.whatsapp.net"
          ? {
              id,
              name: "WhatsApp",
            }
          : id === esmile.decodeJid(esmile.user.id)
          ? esmile.user
          : store.contacts[id] || {};
    return (
      (withoutContact ? "" : v.name) ||
      v.subject ||
      v.verifiedName ||
      PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber("international")
    );
  };

  esmile.sendContact = async (jid, kon, quoted = "", opts = {}) => {
    let list = [];
    for (let i of kon) {
      list.push({
        displayName: await esmile.getName(i + "@s.whatsapp.net"),
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await esmile.getName(i + "@s.whatsapp.net")}\nFN:${await esmile.getName(
          i + "@s.whatsapp.net"
        )}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Ponsel\nitem2.EMAIL;type=INTERNET:contact@mresmile.com\nitem2.X-ABLabel:Email\nitem3.URL:https://www.instagram.com/zastinianyt\nitem3.X-ABLabel:Instagram\nitem4.ADR:;;Indonesia;;;;\nitem4.X-ABLabel:Region\nEND:VCARD`,
      });
    }
    esmile.sendMessage(jid, {contacts: {displayName: `${list.length} Kontak`, contacts: list}, ...opts}, {quoted});
  };

  esmile.setStatus = (status) => {
    esmile.query({
      tag: "iq",
      attrs: {
        to: "@s.whatsapp.net",
        type: "set",
        xmlns: "status",
      },
      content: [
        {
          tag: "status",
          attrs: {},
          content: Buffer.from(status, "utf-8"),
        },
      ],
    });
    return status;
  };

  esmile.public = true;

  esmile.serializeM = (m) => smsg(esmile, m, store);

  esmile.ev.on("connection.update", async (update) => {
    const {connection, lastDisconnect} = update;
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason === DisconnectReason.badSession) {
        console.log(`Bad Session File, Please Delete Session and Scan Again`);
        esmile.logout();
      } else if (reason === DisconnectReason.connectionClosed) {
        console.log("Connection closed, reconnecting....");
        startEsmile();
      } else if (reason === DisconnectReason.connectionLost) {
        console.log("Connection Lost from Server, reconnecting...");
        startEsmile();
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log("Connection Replaced, Another New Session Opened, Please Close Current Session First");
        esmile.logout();
      } else if (reason === DisconnectReason.loggedOut) {
        console.log(`Device Logged Out, Please Scan Again And Run.`);
        esmile.logout();
      } else if (reason === DisconnectReason.restartRequired) {
        console.log("Restart Required, Restarting...");
        startEsmile();
      } else if (reason === DisconnectReason.timedOut) {
        console.log("Connection TimedOut, Reconnecting...");
        startEsmile();
      } else esmile.end(`Unknown DisconnectReason: ${reason}|${connection}`);
    }
    console.clear();
    console.log(`
    ███████╗███████╗███╗   ███╗██╗██╗     ███████╗
    ██╔════╝██╔════╝████╗ ████║██║██║     ██╔════╝
    █████╗  ███████╗██╔████╔██║██║██║     █████╗  
    ██╔══╝  ╚════██║██║╚██╔╝██║██║██║     ██╔══╝  
    ███████╗███████║██║ ╚═╝ ██║██║███████╗███████╗
    ╚══════╝╚══════╝╚═╝     ╚═╝╚═╝╚══════╝╚══════╝
    `);
    console.log("On!");
  });

  esmile.ev.on("creds.update", saveCreds);
  esmile.send5ButImg = async (jid, text = "", footer = "", img, but = [], options = {}) => {
    let message = await prepareWAMessageMedia({image: img}, {upload: esmile.waUploadToServer});
    var template = generateWAMessageFromContent(
      m.chat,
      proto.Message.fromObject({
        templateMessage: {
          hydratedTemplate: {
            imageMessage: message.imageMessage,
            hydratedContentText: text,
            hydratedFooterText: footer,
            hydratedButtons: but,
          },
        },
      }),
      options
    );
    esmile.relayMessage(jid, template.message, {messageId: template.key.id});
  };

  esmile.sendWelkom = async (jid, text = "", footer = "", img, but = [], options = {}) => {
    let message = await prepareWAMessageMedia({image: img}, {upload: esmile.waUploadToServer});
    var template = generateWAMessageFromContent(
      jid,
      proto.Message.fromObject({
        templateMessage: {
          hydratedTemplate: {
            imageMessage: message.imageMessage,
            hydratedContentText: text,
            hydratedFooterText: footer,
            hydratedButtons: but,
          },
        },
      }),
      options
    );
    esmile.relayMessage(jid, template.message, {messageId: template.key.id});
  };
  esmile.sendButtonText = (jid, buttons = [], text, footer, quoted = "", options = {}) => {
    let buttonMessage = {
      text,
      footer,
      buttons,
      headerType: 2,
      ...options,
    };
    //esmile.sendMessage(jid, buttonMessage, {quoted, ...options});
    var template = generateWAMessageFromContent(
      jid,
      proto.Message.fromObject({
        templateMessage: {
          hydratedTemplate: {
            hydratedContentText: text,
            hydratedFooterText: footer,
            hydratedButtons: buttons,
          },
        },
      }),
      options
    );
    esmile.relayMessage(jid, template.message, {messageId: template.key.id});
  };
  esmile.sendText = (jid, text, quoted = "", options) => esmile.sendMessage(jid, {text: text, ...options}, {quoted});
  esmile.sendImage = async (jid, path, caption = "", quoted = "", options) => {
    let buffer = Buffer.isBuffer(path)
      ? path
      : /^data:.*?\/.*?;base64,/i.test(path)
      ? Buffer.from(path.split`,`[1], "base64")
      : /^https?:\/\//.test(path)
      ? await await getBuffer(path)
      : fs.existsSync(path)
      ? fs.readFileSync(path)
      : Buffer.alloc(0);
    return await esmile.sendMessage(jid, {image: buffer, caption: caption, ...options}, {quoted});
  };
  esmile.sendVideo = async (jid, path, caption = "", quoted = "", gif = false, options) => {
    let buffer = Buffer.isBuffer(path)
      ? path
      : /^data:.*?\/.*?;base64,/i.test(path)
      ? Buffer.from(path.split`,`[1], "base64")
      : /^https?:\/\//.test(path)
      ? await await getBuffer(path)
      : fs.existsSync(path)
      ? fs.readFileSync(path)
      : Buffer.alloc(0);
    return await esmile.sendMessage(jid, {video: buffer, caption: caption, gifPlayback: gif, ...options}, {quoted});
  };
  esmile.sendAudio = async (jid, path, quoted = "", ptt = false, options) => {
    let buffer = Buffer.isBuffer(path)
      ? path
      : /^data:.*?\/.*?;base64,/i.test(path)
      ? Buffer.from(path.split`,`[1], "base64")
      : /^https?:\/\//.test(path)
      ? await await getBuffer(path)
      : fs.existsSync(path)
      ? fs.readFileSync(path)
      : Buffer.alloc(0);
    return await esmile.sendMessage(jid, {audio: buffer, ptt: ptt, ...options}, {quoted});
  };
  esmile.sendTextWithMentions = async (jid, text, quoted, options = {}) =>
    esmile.sendMessage(
      jid,
      {text: text, contextInfo: {mentionedJid: [...text.matchAll(/@(\d{0,16})/g)].map((v) => v[1] + "@s.whatsapp.net")}, ...options},
      {quoted}
    );
  esmile.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path)
      ? path
      : /^data:.*?\/.*?;base64,/i.test(path)
      ? Buffer.from(path.split`,`[1], "base64")
      : /^https?:\/\//.test(path)
      ? await await getBuffer(path)
      : fs.existsSync(path)
      ? fs.readFileSync(path)
      : Buffer.alloc(0);
    let buffer;
    if (options && (options.packname || options.author)) {
      buffer = await writeExifImg(buff, options);
    } else {
      buffer = await imageToWebp(buff);
    }

    await esmile.sendMessage(jid, {sticker: {url: buffer}, ...options}, {quoted});
    return buffer;
  };
  esmile.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path)
      ? path
      : /^data:.*?\/.*?;base64,/i.test(path)
      ? Buffer.from(path.split`,`[1], "base64")
      : /^https?:\/\//.test(path)
      ? await await getBuffer(path)
      : fs.existsSync(path)
      ? fs.readFileSync(path)
      : Buffer.alloc(0);
    let buffer;
    if (options && (options.packname || options.author)) {
      buffer = await writeExifVid(buff, options);
    } else {
      buffer = await videoToWebp(buff);
    }

    await esmile.sendMessage(jid, {sticker: {url: buffer}, ...options}, {quoted});
    return buffer;
  };
  esmile.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
    let quoted = message.msg ? message.msg : message;
    let mime = (message.msg || message).mimetype || "";
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];
    const stream = await downloadContentFromMessage(quoted, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    let type = await FileType.fromBuffer(buffer);
    trueFileName = attachExtension ? filename + "." + type.ext : filename;
    await fs.writeFileSync(trueFileName, buffer);
    return trueFileName;
  };

  esmile.downloadMediaMessage = async (message) => {
    let mime = (message.msg || message).mimetype || "";
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }

    return buffer;
  };
  esmile.sendMedia = async (jid, path, fileName = "", caption = "", quoted = "", options = {}) => {
    let types = await esmile.getFile(path, true);
    let {mime, ext, res, data, filename} = types;
    if ((res && res.status !== 200) || file.length <= 65536) {
      try {
        throw {json: JSON.parse(file.toString())};
      } catch (e) {
        if (e.json) throw e.json;
      }
    }
    let type = "",
      mimetype = mime,
      pathFile = filename;
    if (options.asDocument) type = "document";
    if (options.asSticker || /webp/.test(mime)) {
      let {writeExif} = require("./src/lib/exif");
      let media = {mimetype: mime, data};
      pathFile = await writeExif(media, {
        packname: options.packname ? options.packname : global.packname,
        author: options.author ? options.author : global.author,
        categories: options.categories ? options.categories : [],
      });
      await fs.promises.unlink(filename);
      type = "sticker";
      mimetype = "image/webp";
    } else if (/image/.test(mime)) type = "image";
    else if (/video/.test(mime)) type = "video";
    else if (/audio/.test(mime)) type = "audio";
    else type = "document";
    await esmile.sendMessage(jid, {[type]: {url: pathFile}, caption, mimetype, fileName, ...options}, {quoted, ...options});
    return fs.promises.unlink(pathFile);
  };
  esmile.copyNForward = async (jid, message, forceForward = false, options = {}) => {
    let vtype;
    if (options.readViewOnce) {
      message.message =
        message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message
          ? message.message.ephemeralMessage.message
          : message.message || undefined;
      vtype = Object.keys(message.message.viewOnceMessage.message)[0];
      delete (message.message && message.message.ignore ? message.message.ignore : message.message || undefined);
      delete message.message.viewOnceMessage.message[vtype].viewOnce;
      message.message = {
        ...message.message.viewOnceMessage.message,
      };
    }

    let mtype = Object.keys(message.message)[0];
    let content = await generateForwardMessageContent(message, forceForward);
    let ctype = Object.keys(content)[0];
    let context = {};
    if (mtype != "conversation") context = message.message[mtype].contextInfo;
    content[ctype].contextInfo = {
      ...context,
      ...content[ctype].contextInfo,
    };
    const waMessage = await generateWAMessageFromContent(
      jid,
      content,
      options
        ? {
            ...content[ctype],
            ...options,
            ...(options.contextInfo
              ? {
                  contextInfo: {
                    ...content[ctype].contextInfo,
                    ...options.contextInfo,
                  },
                }
              : {}),
          }
        : {}
    );
    await esmile.relayMessage(jid, waMessage.message, {messageId: waMessage.key.id});
    return waMessage;
  };

  esmile.cMod = (jid, copy, text = "", sender = esmile.user.id, options = {}) => {
    let mtype = Object.keys(copy.message)[0];
    let isEphemeral = mtype === "ephemeralMessage";
    if (isEphemeral) {
      mtype = Object.keys(copy.message.ephemeralMessage.message)[0];
    }
    let msg = isEphemeral ? copy.message.ephemeralMessage.message : copy.message;
    let content = msg[mtype];
    if (typeof content === "string") msg[mtype] = text || content;
    else if (content.caption) content.caption = text || content.caption;
    else if (content.text) content.text = text || content.text;
    if (typeof content !== "string")
      msg[mtype] = {
        ...content,
        ...options,
      };
    if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
    else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
    if (copy.key.remoteJid.includes("@s.whatsapp.net")) sender = sender || copy.key.remoteJid;
    else if (copy.key.remoteJid.includes("@broadcast")) sender = sender || copy.key.remoteJid;
    copy.key.remoteJid = jid;
    copy.key.fromMe = sender === esmile.user.id;

    return proto.WebMessageInfo.fromObject(copy);
  };

  esmile.getFile = async (PATH, save) => {
    let res;
    let data = Buffer.isBuffer(PATH)
      ? PATH
      : /^data:.*?\/.*?;base64,/i.test(PATH)
      ? Buffer.from(PATH.split`,`[1], "base64")
      : /^https?:\/\//.test(PATH)
      ? await (res = await getBuffer(PATH))
      : fs.existsSync(PATH)
      ? ((filename = PATH), fs.readFileSync(PATH))
      : typeof PATH === "string"
      ? PATH
      : Buffer.alloc(0);
    let type = (await FileType.fromBuffer(data)) || {
      mime: "application/octet-stream",
      ext: ".bin",
    };
    filename = path.join(__filename, "../src/" + new Date() * 1 + "." + type.ext);
    if (data && save) fs.promises.writeFile(filename, data);
    return {
      res,
      filename,
      size: await getSizeMedia(data),
      ...type,
      data,
    };
  };

  return esmile;
}

startEsmile();

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});
