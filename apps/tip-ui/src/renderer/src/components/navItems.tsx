import React from "react";
import { IconSearch, IconServer, IconPlug, IconList } from "@tabler/icons-react";

export type NavView = "explore" | "manage" | "quick-connect" | "session";

export type NavItem = {
  view: NavView;
  label: string;
  Icon: React.FC<any>;
};

export const navItems: NavItem[] = [
  { view: "explore", label: "Explore", Icon: IconSearch },
  { view: "manage", label: "Manage", Icon: IconServer },
  { view: "quick-connect", label: "Quick Connect", Icon: IconPlug },
  { view: "session", label: "Session", Icon: IconList },
];
