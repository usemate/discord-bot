import { config } from 'dotenv'
import { SlashCommandBuilder } from '@discordjs/builders'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v9'

config()

const commands = [
  new SlashCommandBuilder().setName('stats').setDescription('Get daily stats'),
].map((command) => command.toJSON())

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN as string)

rest
  .put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID as string,
      process.env.GUILD_ID as string
    ),
    { body: commands }
  )
  .then(() => console.log('Successfully registered application commands.'))
  .catch(console.error)
