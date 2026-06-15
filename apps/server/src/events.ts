import type { FastifyReply } from "fastify";
import type { RunEvent } from "../../../packages/shared/types";

export class EventHub {
  private clients = new Map<string, Set<FastifyReply>>();

  subscribe(runId: string, reply: FastifyReply) {
    const set = this.clients.get(runId) ?? new Set<FastifyReply>();
    set.add(reply);
    this.clients.set(runId, set);

    reply.raw.on("close", () => {
      set.delete(reply);
      if (set.size === 0) this.clients.delete(runId);
    });
  }

  publish(event: RunEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const reply of this.clients.get(event.runId) ?? []) {
      reply.raw.write(payload);
    }
  }
}
