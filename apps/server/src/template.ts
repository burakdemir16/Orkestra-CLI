export interface TemplateContext {
  prompt: string;
  workspace: string;
  transcript: string;
  role: string;
}

export function interpolate(value: string, context: TemplateContext) {
  return value
    .replaceAll("{prompt}", context.prompt)
    .replaceAll("{workspace}", context.workspace)
    .replaceAll("{transcript}", context.transcript)
    .replaceAll("{role}", context.role);
}

export function interpolateArgs(args: string[], context: TemplateContext) {
  return args.map((arg) => interpolate(arg, context));
}
