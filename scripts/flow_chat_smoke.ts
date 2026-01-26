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

  const gateMessage = messages.find((msg: any) =>
    Array.isArray(msg.blocks) && msg.blocks.some((block: any) => block?.type === 'FlowGateBlock')
  )

  if (!gateMessage) {
    throw new Error('Expected FlowGateBlock message, none found')
  }

  const gateBlock = gateMessage.blocks.find((block: any) => block?.type === 'FlowGateBlock')
  const questionKeys = Array.isArray(gateBlock?.questionsBlock?.questions)
    ? gateBlock.questionsBlock.questions.map((q: any) => q.id).filter(Boolean)
    : []

  console.log('Submitting skip for gate...')
  await client.action(api.flow.gateActions.submitGateAnswers, {
    flowRunId: runId,
    answersByKey: {},
    intent: 'skip',
    questionKeys,
  })

  await new Promise((resolve) => setTimeout(resolve, 1000))

  const runsAfter = await client.query(api.flowRuns.listByProject, { projectId })
  const updatedRun = runsAfter.find((r: any) => r._id === runId)
  if (!updatedRun) throw new Error('Run not found after skip')

  if (updatedRun.currentGateId === run.currentGateId) {
    throw new Error(`Gate did not advance (still ${updatedRun.currentGateId})`)
  }

  console.log('Smoke test passed:', {
    from: run.currentGateId,
    to: updatedRun.currentGateId,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
