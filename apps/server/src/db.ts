import Database from "better-sqlite3";
import { join } from "node:path";
import type { Agent, AgentRole, AgentStatus, Run, RunEvent, RunEventType } from "../../../packages/shared/types";
import type { AppConfig } from "./config";

const json = {
  parse<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },
  stringify(value: unknown) {
    return JSON.stringify(value);
  }
};

export class Store {
  private db: Database.Database;

  constructor(config: AppConfig) {
    this.db = new Database(join(config.dataDir, "orkestra.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.seedAgents();
    this.repairDefaultAgentRoles();
  }

  private migrate() {
    this.db.exec(`
      create table if not exists agents (
        id text primary key,
        name text not null,
        role text not null,
        command text not null,
        args_template text not null,
        enabled integer not null,
        timeout_seconds integer not null,
        fallback_agent_ids text not null,
        limit_patterns text not null,
        status text not null,
        last_limited_at text
      );

      create table if not exists runs (
        id text primary key,
        prompt text not null,
        status text not null,
        workspace_path text not null,
        created_at text not null,
        completed_at text,
        active_step text,
        summary text
      );

      create table if not exists run_events (
        id integer primary key autoincrement,
        run_id text not null,
        agent_id text,
        type text not null,
        message text not null,
        raw_output text,
        created_at text not null
      );
    `);
  }

  private seedAgents() {
    const defaults: Agent[] = [
      {
        id: "codex-planner",
        name: "GPT Planner",
        role: "planner",
        command: "dry-run",
        argsTemplate: ["planner", "{prompt}"],
        enabled: true,
        timeoutSeconds: 120,
        fallbackAgentIds: ["gemini-reviewer"],
        limitPatterns: defaultLimitPatterns(),
        status: "available",
        lastLimitedAt: null
      },
      {
        id: "claude-builder",
        name: "Claude Builder",
        role: "builder",
        command: "dry-run",
        argsTemplate: ["builder", "{prompt}"],
        enabled: true,
        timeoutSeconds: 180,
        fallbackAgentIds: ["codex-planner"],
        limitPatterns: defaultLimitPatterns(),
        status: "available",
        lastLimitedAt: null
      },
      {
        id: "gemini-reviewer",
        name: "Gemini Reviewer",
        role: "reviewer",
        command: "dry-run",
        argsTemplate: ["reviewer", "{prompt}"],
        enabled: true,
        timeoutSeconds: 120,
        fallbackAgentIds: ["codex-planner"],
        limitPatterns: defaultLimitPatterns(),
        status: "available",
        lastLimitedAt: null
      },
      {
        id: "codex-fixer",
        name: "Codex Fixer",
        role: "fixer",
        command: "dry-run",
        argsTemplate: ["fixer", "{prompt}"],
        enabled: true,
        timeoutSeconds: 120,
        fallbackAgentIds: ["claude-builder"],
        limitPatterns: defaultLimitPatterns(),
        status: "available",
        lastLimitedAt: null
      }
    ];

    for (const agent of defaults) {
      if (!this.getAgent(agent.id)) this.saveAgent(agent);
    }
  }

  private repairDefaultAgentRoles() {
    const expected: Array<{ id: string; role: AgentRole }> = [
      { id: "codex-planner", role: "planner" },
      { id: "claude-builder", role: "builder" },
      { id: "gemini-reviewer", role: "reviewer" },
      { id: "codex-fixer", role: "fixer" }
    ];

    for (const item of expected) {
      const agent = this.getAgent(item.id);
      if (agent && agent.role !== item.role) {
        this.saveAgent({ ...agent, role: item.role });
      }
    }
  }

  listAgents(): Agent[] {
    const rows = this.db.prepare("select * from agents order by role, name").all() as AgentRow[];
    return rows.map(rowToAgent);
  }

  getAgent(id: string): Agent | undefined {
    const row = this.db.prepare("select * from agents where id = ?").get(id) as AgentRow | undefined;
    return row ? rowToAgent(row) : undefined;
  }

  saveAgent(agent: Agent) {
    this.db
      .prepare(`
        insert into agents (
          id, name, role, command, args_template, enabled, timeout_seconds,
          fallback_agent_ids, limit_patterns, status, last_limited_at
        ) values (
          @id, @name, @role, @command, @argsTemplate, @enabled, @timeoutSeconds,
          @fallbackAgentIds, @limitPatterns, @status, @lastLimitedAt
        )
        on conflict(id) do update set
          name = excluded.name,
          role = excluded.role,
          command = excluded.command,
          args_template = excluded.args_template,
          enabled = excluded.enabled,
          timeout_seconds = excluded.timeout_seconds,
          fallback_agent_ids = excluded.fallback_agent_ids,
          limit_patterns = excluded.limit_patterns,
          status = excluded.status,
          last_limited_at = excluded.last_limited_at
      `)
      .run({
        ...agent,
        argsTemplate: json.stringify(agent.argsTemplate),
        fallbackAgentIds: json.stringify(agent.fallbackAgentIds),
        limitPatterns: json.stringify(agent.limitPatterns),
        enabled: agent.enabled ? 1 : 0
      });
  }

  deleteAgent(id: string) {
    this.db.prepare("delete from agents where id = ?").run(id);
  }

  setAgentStatus(id: string, status: AgentStatus, lastLimitedAt?: string) {
    this.db
      .prepare("update agents set status = ?, last_limited_at = coalesce(?, last_limited_at) where id = ?")
      .run(status, lastLimitedAt ?? null, id);
  }

  createRun(run: Run) {
    this.db
      .prepare(`
        insert into runs (id, prompt, status, workspace_path, created_at, completed_at, active_step, summary)
        values (@id, @prompt, @status, @workspacePath, @createdAt, @completedAt, @activeStep, @summary)
      `)
      .run(run);
  }

  updateRun(id: string, patch: Partial<Run>) {
    const current = this.getRun(id);
    if (!current) return;
    const next = { ...current, ...patch };
    this.db
      .prepare(`
        update runs set status = @status, completed_at = @completedAt,
        active_step = @activeStep, summary = @summary where id = @id
      `)
      .run(next);
  }

  listRuns(): Run[] {
    const rows = this.db.prepare("select * from runs order by created_at desc limit 50").all() as RunRow[];
    return rows.map(rowToRun);
  }

  getRun(id: string): Run | undefined {
    const row = this.db.prepare("select * from runs where id = ?").get(id) as RunRow | undefined;
    return row ? rowToRun(row) : undefined;
  }

  addEvent(event: Omit<RunEvent, "id">): RunEvent {
    const result = this.db
      .prepare(`
        insert into run_events (run_id, agent_id, type, message, raw_output, created_at)
        values (@runId, @agentId, @type, @message, @rawOutput, @createdAt)
      `)
      .run(event);

    return { ...event, id: Number(result.lastInsertRowid) };
  }

  listEvents(runId: string): RunEvent[] {
    const rows = this.db
      .prepare("select * from run_events where run_id = ? order by id asc")
      .all(runId) as RunEventRow[];
    return rows.map(rowToEvent);
  }
}

export function defaultLimitPatterns() {
  return ["rate limit", "usage limit", "quota", "try again later", "429", "login expired"];
}

interface AgentRow {
  id: string;
  name: string;
  role: AgentRole;
  command: string;
  args_template: string;
  enabled: number;
  timeout_seconds: number;
  fallback_agent_ids: string;
  limit_patterns: string;
  status: AgentStatus;
  last_limited_at: string | null;
}

interface RunRow {
  id: string;
  prompt: string;
  status: Run["status"];
  workspace_path: string;
  created_at: string;
  completed_at: string | null;
  active_step: string | null;
  summary: string | null;
}

interface RunEventRow {
  id: number;
  run_id: string;
  agent_id: string | null;
  type: RunEventType;
  message: string;
  raw_output: string | null;
  created_at: string;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    command: row.command,
    argsTemplate: json.parse(row.args_template, []),
    enabled: Boolean(row.enabled),
    timeoutSeconds: row.timeout_seconds,
    fallbackAgentIds: json.parse(row.fallback_agent_ids, []),
    limitPatterns: json.parse(row.limit_patterns, defaultLimitPatterns()),
    status: row.status,
    lastLimitedAt: row.last_limited_at
  };
}

function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    prompt: row.prompt,
    status: row.status,
    workspacePath: row.workspace_path,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    activeStep: row.active_step,
    summary: row.summary
  };
}

function rowToEvent(row: RunEventRow): RunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    type: row.type,
    message: row.message,
    rawOutput: row.raw_output,
    createdAt: row.created_at
  };
}
