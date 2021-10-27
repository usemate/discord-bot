import { config } from 'dotenv'
import { MessageEmbed } from 'discord.js'
import { getStats } from './api'
import { getClient } from './discord-client'
import { CronJob } from 'cron'

config()

if (typeof process.env.TOKEN !== 'string') {
  throw new Error('Missing process.env.TOKEN')
}

const getStatsEmbed = async () => {
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
          stats.marketCap.value + getHighlighted(stats.marketCap.oneDayDiff),
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

  return statsEmbed
}
const getHighlighted = (value = '') => ' `' + value + '`'

const start = async () => {
  const client = await getClient()

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return

    const { commandName } = interaction
    if (commandName === 'stats') {
      try {
        await interaction.deferReply()
        const statsEmbed = await getStatsEmbed()
        await interaction.editReply({ embeds: [statsEmbed] })
      } catch (e) {
        console.error(e)
      }
    }
  })

  try {
    if (typeof process.env.CRON_CHANNEL === 'string') {
      const channel = await client.channels.cache.get(process.env.CRON_CHANNEL)
      const job = new CronJob(
        '0 12 * * *',
        async () => {
          console.log('Cron job triggered')
          if (channel) {
            const statsEmbed = await getStatsEmbed()
            ;(channel as any).send({ embeds: [statsEmbed] })
          }
        },
        null,
        true,
        'Europe/Berlin'
      )

      job.start()
    } else {
      console.error('Missing typeof process.env.CRON_CHANNEL')
    }
  } catch (e) {
    console.error(e)
  }
}

start()
