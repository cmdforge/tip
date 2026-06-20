export * from './protocol.js';
export * from './connection.js';
export * from './tip-protocol.js';

export type DaemonInfo = {
  pid: number;
  url: string;
};

export const appToolName = "io.github.cmdforge.tip-ui";
export const appToolUri = `ui://${appToolName}/ui`;
