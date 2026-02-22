import { createLogger } from '@okon/shared'

const logger = createLogger('sse')

export function setSSEHeaders(reply: any) {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
}

export function setUIMessageStreamHeaders(reply: any) {
  setSSEHeaders(reply)
  reply.raw.setHeader('x-vercel-ai-ui-message-stream', 'v1')
  reply.raw.setHeader('x-accel-buffering', 'no')
}

export async function pipeEvents(reply: any, events: AsyncGenerator<any>) {
  try {
    for await (const event of events) {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (err) {
    logger.error('SSE 流错误', err)
    const errorEvent = JSON.stringify({
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    })
    reply.raw.write(`data: ${errorEvent}\n\n`)
  } finally {
    reply.raw.end()
  }
}

export async function pipeUIMessageChunks(reply: any, stream: AsyncIterable<unknown>) {
  try {
    for await (const chunk of stream) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }
  } catch (err) {
    logger.error('UI message stream 错误', err)
    const errorChunk = JSON.stringify({
      type: 'error',
      errorText: err instanceof Error ? err.message : 'Unknown error',
    })
    reply.raw.write(`data: ${errorChunk}\n\n`)
  } finally {
    reply.raw.write('data: [DONE]\n\n')
    reply.raw.end()
  }
}
