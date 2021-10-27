import { config } from 'dotenv'
import { Client, Intents, MessageEmbed } from 'discord.js'
import { getStats } from './api'

config()

if (typeof process.env.TOKEN !== 'string') {
  throw new Error('Missing process.env.TOKEN')
}

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
})

client.login(process.env.TOKEN)

const getHighlighted = (value = '') => ' `' + value + '`'
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return

  const { commandName } = interaction
  if (commandName === 'stats') {
    try {
      await interaction.deferReply()
      const stats = await getStats()
      const statsEmbed = new MessageEmbed()
        .setColor('#81cb53')
        .setImage('https://i.imgur.com/WApNoC5.png')
        .setTitle('$MATE (24h)')
        .addFields(
          {
            name: '🏷 Price',
            value: stats.price.value + getHighlighted(stats.price.oneDayDiff),
          },
          {
            name: '💵 MarketCap',
            value:
              stats.marketCap.value +
              getHighlighted(stats.marketCap.oneDayDiff),
          },
          {
            name: '\u200B',
            value: '*** Limit orders (24h) ***',
          },
          {
            name: '🗃 Total Orders',
            value:
              stats.totalOrders.value +
              getHighlighted(stats.totalOrders.oneDayDiff),
          },
          {
            name: '☑️ Filled Orders',
            value:
              stats.filledOrders.value +
              getHighlighted(stats.filledOrders.oneDayDiff),
          },
          {
            name: '👥 Unique Users',
            value:
              stats.uniqueUsers.value +
              getHighlighted(stats.uniqueUsers.oneDayDiff),
          },
          { name: '💰 Total Locked', value: stats.totalLocked.value }
        )

      await interaction.editReply({ embeds: [statsEmbed] })
    } catch (e) {
      console.error(e)
    }
  }
})

client.on('ready', () => {
  if (!client) {
    return
  }
  console.log(`Logged in as ${client.user?.tag}!`)
})
