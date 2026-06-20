import { createClientFactory } from "@cmdforge/jsonrpc/client";
import { tipProtocol } from "../shared/tip-protocol.js";

export const tipClientFactory = createClientFactory(tipProtocol);
