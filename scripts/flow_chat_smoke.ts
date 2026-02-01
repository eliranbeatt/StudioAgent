import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const address = process.env.NEXT_PUBLIC_CONVEX_URL

if (!address) {
  throw new Error('Missing NEXT_PUBLIC_CONVEX_URL in .env.local')
}

const client = new ConvexHttpClient(address)

async function main() {
  let projectId = ''
  try {
    const testIds = JSON.parse(fs.readFileSync('test-ids.json', 'utf8'))
    projectId = testIds.p1Id
  } catch (error) {
    console.error('test-ids.json error')
    process.exit(1)
  }

  console.log('Starting a new flow run...')
  const runId = await client.mutation(api.flowRuns.start, { projectId })
  console.log('Run started:', runId)

  console.log('Running flow tick...')
  await client.action(api.flowRuns.runNext, { flowRunId: runId })

  const runs = await client.query(api.flowRuns.listByProject, { projectId })
  const run = runs.find((r: any) => r._id === runId)
  if (!run?.conversationId) {
    throw new Error('Missing conversationId on flow run')
  }

  const messages = await client.query(api.flow.chat.listMessages, {
    conversationId: run.conversationId,
  })

  const questionsMessage = messages.find((msg: any) =>
    Array.isArray(msg.blocks) && msg.blocks.some((block: any) => block?.type === 'QuestionsBlock')
  )

  if (!questionsMessage) {
    throw new Error('Expected QuestionsBlock message, none found')
  }

  console.log('Smoke test passed: QuestionsBlock emitted')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
