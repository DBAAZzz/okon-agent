import { createMCPClient } from '@ai-sdk/mcp'

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-server.com/mcp'
  },
});