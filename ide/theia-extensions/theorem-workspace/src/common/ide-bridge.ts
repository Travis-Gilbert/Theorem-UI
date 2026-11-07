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

/** One delegation's changes, or one changed file of them. */
export interface DelegationChanges {
    /** The run that delegated the work. */
    runId: string;
    delegationId: string;
    /** One changed file; absent for every change in the delegation. */
    path?: string;
}

/** A tool approval, decided through the Theorem UI. */
export interface ChatApproval {
    runId: string;
    approvalId: string;
    toolCallId: string;
    summary: string;
    /** Set once decided. */
    approved?: boolean;
    /**
     * Set when the request settled with no answer: it expired, was replaced,
     * or failed. The frame closes any prompt it opened for it and sends no
     * decision; `reason` says why, when the server gave one.
     */
    settled?: { reason?: string };
    options: { optionId: string; name: string; kind: string }[];
}

/** One part of a message, as the Theorem UI holds it. */
export type ChatPart =
    | { type: 'text' | 'reasoning'; text: string }
    | {
        type: 'tool-call';
        toolCallId: string;
        toolName: string;
        argsText: string;
        result?: unknown;
        isError?: boolean;
        approval?: ChatApproval;
    }
    | { type: 'data'; name: string; data: unknown };

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    parts: ChatPart[];
    /** The assistant is still producing it, or waits on an approval. */
    running: boolean;
    /** The person stopped it before it finished. */
    stopped?: boolean;
    /** Why it failed. */
    error?: string;
}

/** The conversation the Theorem UI shows. Messages travel only when they are new or changed. */
export interface ChatThreadUpdate {
    /** Names the conversation; it stays the same when a new chat gains its thread id. */
    key: string;
    /** Null for a new chat. */
    threadId: string | null;
    title?: string;
    /** Every message id, in order. */
    order: string[];
    changed: ChatMessage[];
}

export interface ApprovalDecision {
    approval: ChatApproval;
    allow: boolean;
}

/** What the IDE frame offers the Theorem UI around it. */
export type IdeFrameMethods = {
    /** Show a location. Resolves false when the frame cannot show that resource. */
    reveal(location: TheoremLocation, options?: RevealOptions): Promise<boolean>;
    setTheme(dark: boolean): void;
    executeCommand(id: string, args?: unknown[]): Promise<unknown>;
    /** Show or hide the left side panel; the rail's IDE button drives it. */
    setSidebar(open: boolean): void;
    /** Whether Follow the Agent is on, for the frame's status bar and the edits it follows. */
    setFollowing(following: boolean): void;
    /** The runs whose edits Follow the Agent shows: the working turn's run and its delegations' runs. Empty while none works. */
    setFollowedRuns(runIds: string[]): void;
    /** Open the diff of one change, or of every change in the delegation. Resolves false when the frame cannot read them. */
    openChanges(target: DelegationChanges): Promise<boolean>;
    /** The conversation the Theorem UI shows, for the frame's chat. */
    setThread(update: ChatThreadUpdate): void;
    /** Close the frame's chat view: the UI's agent terminal beside the frame is the conversation. */
    closeChatView(): Promise<void>;
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
    /** Send a turn on the conversation the UI shows. Resolves with its thread once the thread exists. */
    send(text: string): Promise<string>;
    /** Stop the conversation's running turn. */
    cancel(): void;
    /** Resolves false when the decision did not reach Theorem. */
    decideApproval(decision: ApprovalDecision): Promise<boolean>;
    /** Show another conversation, or a new chat for null, without leaving the IDE. */
    openThread(threadId: string | null): void;
    /** Leave the IDE for the conversation and show one of its artifacts there. */
    openArtifact(artifactId: string): void;
};
