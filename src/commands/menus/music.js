module.exports = {
  name: "music",
  run: async (bot, message, lang, args) => {
    await message.reply(lang.help.menus.music);
  },
};
