/** `stopped`: interrupted (TaskStop, Esc); `failed`: ended on an error or a refusal. */
export type AgentStatus = 'running' | 'done' | 'failed' | 'stopped'

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
  /** A fake row `/progress-bar demo` made; `/progress-bar clear` removes them. */
  isDemo?: boolean
  /** How many times it has run: a finished agent woken again (a message, a resume) runs another round. */
  rounds?: number
  startedAt: number
  endedAt?: number
  /** When it was last woken for another round; unset until it is. */
  wokeAt?: number
  /** Tokens processed over all its requests: input, output and cache reads and writes. */
  tokens: number
  costUsd: number
  /** The last request's prompt plus output, for the context fill. */
  contextTokens: number
  steps: number
  toolCalls: number
}

/** The main session's own loop, and the run the band shows. */
export type MainState = {
  isWorking: boolean
  turnStartedAt: number
  /** Milliseconds of finished main turns. */
  workMs: number
  tokens: number
  costUsd: number
  model: string
  effort?: string
  /**
   * When the current run began: the person's prompt that found nothing working.
   * The band counts the subagents spawned since; a message sent mid-run joins it.
   */
  runStartedAt?: number
  /** The run's work title, named from the prompt that began it; unset while it is being named. */
  title?: string
  /** The `runStartedAt` of a demo still playing; a real run clears it. */
  demoId?: number
  /** The run a demo took the band from, which `/progress-bar clear` puts back. */
  beforeDemo?: { runStartedAt?: number; turnStartedAt: number; title?: string }
}

export type PanelState = {
  isDoneCollapsed: boolean
  /** Every finished agent, not just the latest few. */
  showAllDone?: boolean
  /** The band folded down to its ▴: it stays so from run to run until the person opens it. */
  isBandCollapsed?: boolean
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
