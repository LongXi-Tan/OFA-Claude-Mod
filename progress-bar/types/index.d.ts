export type AgentStatus = 'running' | 'done' | 'failed'

/** One subagent the session spawned, as the pane draws it. */
export type AgentRow = {
  id: string
  agentId?: string
  description: string
  subagentType: string
  model: string
  effort?: string
  /** Which crab costume it wears, an index into DESIGNS. */
  design: number
  status: AgentStatus
  isBackground: boolean
  startedAt: number
  endedAt?: number
  /** Tokens processed over all its requests: input, output and cache reads and writes. */
  tokens: number
  costUsd: number
  /** The last request's prompt plus output, for the context fill. */
  contextTokens: number
  steps: number
  toolCalls: number
}

/** The main session's own loop. */
export type MainState = {
  isWorking: boolean
  turnStartedAt: number
  /** Milliseconds of finished main turns. */
  workMs: number
  tokens: number
  costUsd: number
  model: string
  effort?: string
  /** The first line of the prompt that started the turn, the band's title. */
  title?: string
}

export type PanelState = {
  isDoneCollapsed: boolean
  /** The `turnStartedAt` of the turn whose band the person closed. */
  hiddenTurn?: number
}

declare module 'claude-code' {
  interface PluginState {
    'progress-bar': {
      agents: Shaped<AgentRow[]>
      main: Shaped<MainState>
      now: number
      panel: PanelState
    }
  }
}
