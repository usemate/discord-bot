import { config } from 'dotenv'
import { SlashCommandBuilder } from '@discordjs/builders'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'
import { getClient } from './discord-client'

config()

const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get daily stats')
    .setDefaultPermission(false),
].map((command) => command.toJSON())

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN as string)

const start = async () => {
  const client = await getClient()

  if (!client.application?.owner) await client.application?.fetch()

  const result: any = await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID as string,
      process.env.GUILD_ID as string
    ),
    { body: commands }
  )

  const guild = await client.guilds.cache.get(process.env.GUILD_ID as string)
  const role = await guild?.roles.cache.find((role) => role.name === 'MATE_BOT')
  const command = await client.guilds.cache
    .get(process.env.GUILD_ID as string)
    ?.commands.fetch(result[0].id)

  if (command && role) {
    await command.permissions.set({
      permissions: [
        {
          id: role.id,
          type: 'ROLE',
          permission: true,
        },
      ],
    })
  }

  process.exit(0)
}

start()
