// SOURCING: penpal carries these calls over postMessage (origin-checked, promise-based);
// this file is only the method contract both windows type their side against. Types,
// not interfaces, so they satisfy penpal's indexed Methods constraint.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { TheoremContextReference, TheoremLocation } from '@theoremharness/sdk';

export interface RevealOptions {
    /** Leave keyboard focus where it is. */
    preserveFocus?: boolean;
    /** Show it in the one preview editor Follow reuses, not a new tab. */
    preview?: boolean;
}

/** What the IDE frame offers the Theorem UI around it. */
export type IdeFrameMethods = {
    /** Show a location. Resolves false when the frame cannot show that resource. */
    reveal(location: TheoremLocation, options?: RevealOptions): Promise<boolean>;
    setTheme(dark: boolean): void;
    executeCommand(id: string, args?: unknown[]): Promise<unknown>;
    /** Show or hide the left side panel; the rail's IDE button drives it. */
    setSidebar(open: boolean): void;
    /** Whether Follow the Agent is on, for the frame's status bar. */
    setFollowing(following: boolean): void;
};

/** What the Theorem UI offers the IDE frame inside it. */
export type IdeHostMethods = {
    addToChat(reference: TheoremContextReference): void;
    /** The person moved to another place themselves, so Follow pauses. */
    navigated(location: TheoremLocation): void;
    /** The left side panel opened or closed. */
    sidebarChanged(open: boolean): void;
    /** The person turned Follow the Agent on or off from the status bar. */
    setFollowing(following: boolean): void;
};
