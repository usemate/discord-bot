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
    .setTitle('$MATE (24h)')
    .addFields(
      {
        name: '🏷 **Price**',
        value: stats.price.value + getHighlighted(stats.price.oneDayDiff),
      },
      {
        name: '💵 **MarketCap**',
        value:
          stats.marketCap.value + getHighlighted(stats.marketCap.oneDayDiff),
      }
    )
    .setImage(
      'https://raw.githubusercontent.com/usemate/discord-bot/master/assets/transparent.png'
    )

  const ordersEmbed = new MessageEmbed()
    .setColor('#81cb53')
    .setTitle('Limit orders (24h)')
    .addFields(
      {
        name: '🗃 **Total Orders**',
        value:
          stats.totalOrders.value +
          getHighlighted(stats.totalOrders.oneDayDiff),
      },
      {
        name: '☑️ **Filled Orders**',
        value:
          stats.filledOrders.value +
          getHighlighted(stats.filledOrders.oneDayDiff),
      },
      {
        name: '👥 **Unique Users**',
        value:
          stats.uniqueUsers.value +
          getHighlighted(stats.uniqueUsers.oneDayDiff),
      },
      { name: '💰 **Total Locked**', value: stats.totalLocked.value },
      { name: '➡ **Amount in**', value: stats.amountIn.value },
      { name: '⬅️ **Amount received**', value: stats.recievedAmount.value }
    )
    .setImage(
      'https://raw.githubusercontent.com/usemate/discord-bot/master/assets/banner.png'
    )

  return [statsEmbed, ordersEmbed]
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
        const embeds = await getStatsEmbed()
        await interaction.editReply({ embeds })
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
            const embeds = await getStatsEmbed()

            ;(channel as any).send({ embeds })
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
