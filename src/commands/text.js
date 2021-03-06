const MenuUtils = require('../structs/MenuUtils.js')
const FeedSelector = require('../structs/FeedSelector.js')
const Translator = require('../structs/Translator.js')
const Profile = require('../structs/db/Profile.js')
const Feed = require('../structs/db/Feed.js')
const getConfig = require('../config.js').get
const createLogger = require('../util/logger/create.js')

async function feedSelectorFn (m, data) {
  const { feed, profile, locale } = data
  const config = getConfig()
  let currentMsg = ''
  if (feed.text) {
    currentMsg = '```Markdown\n' + feed.text + '```'
  } else {
    currentMsg = `\`\`\`Markdown\n${Translator.translate('commands.text.noSetText', locale)}\n\n\`\`\`\`\`\`\n` + config.feeds.defaultText + '```'
  }
  const prefix = profile && profile.prefix ? profile.prefix : config.bot.prefix
  const nextData = {
    ...data,
    next: { text: Translator.translate('commands.text.prompt', locale, { prefix, currentMsg, link: feed.url }) }
  }
  return nextData
}

async function messagePromptFn (m, data) {
  const { feed, locale } = data
  const input = m.content

  if (input.toLowerCase() === 'reset') {
    return {
      ...data,
      setting: null
    }
  } else if (input === '{empty}' && (feed.embeds.length === 0)) {
    // Allow empty texts only if embed is enabled
    throw new MenuUtils.MenuOptionError(Translator.translate('commands.text.noEmpty', locale))
  } else {
    return {
      ...data,
      setting: input
    }
  }
}

module.exports = async (message, command) => {
  const profile = await Profile.get(message.guild.id)
  const guildLocale = profile ? profile.locale : undefined
  const feeds = await Feed.getManyBy('guild', message.guild.id)

  const translate = Translator.createLocaleTranslator(guildLocale)
  const feedSelector = new FeedSelector(message, feedSelectorFn, { command: command, locale: guildLocale }, feeds)
  const messagePrompt = new MenuUtils.Menu(message, messagePromptFn)

  const data = await new MenuUtils.MenuSeries(message, [feedSelector, messagePrompt], { locale: guildLocale, profile }).start()
  if (!data) {
    return
  }
  const { setting, feed } = data
  const config = getConfig()
  const prefix = profile && profile.prefix ? profile.prefix : config.bot.prefix

  const log = createLogger(message.guild.shard.id)
  if (setting === null) {
    feed.text = undefined
    await feed.save()
    log.info({
      guild: message.guild
    }, `Text reset for ${feed.url}`)
    await message.channel.send(translate('commands.text.resetSuccess', { link: feed.url }) + `\n \`\`\`Markdown\n${config.feeds.defaultText}\`\`\``)
  } else {
    feed.text = setting
    await feed.save()
    log.info({
      guild: message.guild
    }, `New text recorded for ${feed.url}`)
    // Escape backticks in code blocks by inserting zero-width space before each backtick
    await message.channel.send(`${translate('commands.text.setSuccess', { link: feed.url })}\n \`\`\`Markdown\n${setting.replace('`', '​`')}\`\`\`\n${translate('commands.text.reminder', { prefix })} ${translate('generics.backupReminder', { prefix })}${setting.search(/{subscriptions}/) === -1 ? ` ${translate('commands.text.noSubscriptionsPlaceholder', { prefix })}` : ''}`)
  }
}
