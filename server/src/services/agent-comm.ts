import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { resolve } from 'node:path'

const PROTO_PATH = resolve(import.meta.dirname, '../../../proto/autopilot.proto')

let client: any = null

export function getAgentClient(): any {
  if (!client) {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    })

    const proto = grpc.loadPackageDefinition(packageDef) as any
    const address = process.env.AGENT_GRPC_ADDRESS || 'localhost:50051'

    client = new proto.autopilot.AutopilotService(
      address,
      grpc.credentials.createInsecure()
    )
  }

  return client
}

// Wrapper functions for agent communication
export async function getAgentStatus(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    getAgentClient().GetStatus({}, (err: Error | null, response: unknown) => {
      if (err) reject(err)
      else resolve(response)
    })
  })
}

export async function sendCommand(command: string, params: Record<string, string> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    getAgentClient().SendCommand(
      { command, params },
      (err: Error | null, response: unknown) => {
        if (err) reject(err)
        else resolve(response)
      }
    )
  })
}
