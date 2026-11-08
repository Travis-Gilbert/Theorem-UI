// SOURCING: @theia/ai-chat is the chat: a ChatAgent pinned to sessions made through ChatService,
// response contents from its chat model (Markdown, Thinking, ToolCall with Theia's own Allow and
// Deny, Command) and a ChangeSetImpl per turn whose elements open their diffs over the
// theorem-delegation provider. The turns are the Theorem UI's, sent and mirrored through
// TheoremIdeBridge; only the mapping from them to Theia's chat model is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, open, OpenerService } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common';
import type { AgentSpecificVariables, LanguageModelRequirement, PromptVariantSet, ToolCallResult } from '@theia/ai-core';
import {
    ChatAgent, ChatAgentLocation, ChatResponseContent, ChatService, ChatServiceFactory, ChatSession, CommandChatResponseContentImpl,
    MarkdownChatResponseContentImpl, MutableChatModel, MutableChatRequestModel, ParsedChatRequest, ParsedChatRequestTextPart,
    ThinkingChatResponseContentImpl, ToolCallChatResponseContentImpl
} from '@theia/ai-chat/lib/common';
import { ChangeSetElement, ChangeSetImpl } from '@theia/ai-chat/lib/common/change-set';
import type { Theorem } from '@theoremharness/sdk';
import type { ChatApproval, ChatMessage, ChatPart } from '../common/ide-bridge';
import { TheoremConnection } from './theorem-connection';
import { delegationUri, type DelegatedChange } from './theorem-delegations';
import { type ChatThread, TheoremIdeBridge } from './theorem-ide-bridge';

export const THEOREM_AGENT_ID = 'Theorem';

/** A user message and the replies after it. */
interface Turn {
    text: string;
    replies: ChatMessage[];
}

const textOf = (message: ChatMessage): string =>
    message.parts.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n\n');

/** Replies before the first user message open a turn of their own. */
function turnsOf(messages: ChatMessage[]): Turn[] {
    const turns: Turn[] = [];
    for (const message of messages) {
        if (message.role === 'user' || !turns.length) {
            turns.push({ text: message.role === 'user' ? textOf(message) : '', replies: [] });
        }
        if (message.role === 'assistant') {
            turns[turns.length - 1].replies.push(message);
        }
    }
    return turns;
}

function parsedRequest(text: string): ParsedChatRequest {
    return {
        request: { text },
        parts: [new ParsedChatRequestTextPart({ start: 0, endExclusive: text.length }, text)],
        toolRequests: new Map(),
        variables: [],
    };
}

type Json = Record<string, unknown>;

const record = (value: unknown): Json =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};

const str = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;

function readDelegation(data: unknown): Theorem.DelegationPart | undefined {
    const part = record(data);
    return str(part.delegationId) && str(part.parentRunId) && str(part.state) ? part as unknown as Theorem.DelegationPart : undefined;
}

const words = (value: string): string => value.replace(/_/g, ' ');

function delegationText(delegation: Theorem.DelegationPart): string {
    const changed = delegation.receipt?.changes.length ?? 0;
    return [
        `**${delegation.roleLabel}** · ${words(delegation.state)}`,
        delegation.objective,
        delegation.receipt?.reported?.summary,
        changed ? `${changed} ${changed === 1 ? 'file' : 'files'} changed` : undefined,
    ].filter(Boolean).join('\n\n');
}

function reviewText(data: unknown): string | undefined {
    const review = record(data);
    if (!str(review.reviewId) || !Array.isArray(review.verdicts)) {
        return undefined;
    }
    const verdicts = review.verdicts.map(record).map(verdict =>
        `- ${str(verdict.roleLabel) ?? str(verdict.delegationId)}: ${words(str(verdict.verdict) ?? '')}${str(verdict.rationale) ? `. ${verdict.rationale}` : ''}`);
    return [`**Review** · ${words(str(review.intentOutcome) ?? 'decided')}`, str(review.summary), verdicts.join('\n')]
        .filter(Boolean).join('\n\n');
}

function intentText(data: unknown): string | undefined {
    const intent = record(data);
    const goal = str(intent.goal);
    return str(intent.intentId) && goal
        ? `**Intent, revision ${intent.revision}** · ${words(str(intent.status) ?? 'open')}\n\n${goal}`
        : undefined;
}

/** The artifact a `theorem-artifact` part names, read as the conversation reads it. */
function readArtifact(data: unknown): { artifactId: string; title: string } | undefined {
    const outer = record(data);
    const part = str(outer.artifactId) ? outer : record(outer.payload);
    const artifactId = str(part.artifactId);
    return artifactId === undefined
        ? undefined
        : { artifactId, title: str(record(part.payload).title) ?? str(part.fallbackText) ?? 'Untitled artifact' };
}

type Admission = DelegatedChange['admission']['state'];

/** Admitted changes are in the workspace; the ones the reviewer turned away never will be. */
const ADMISSION_STATE: Record<Admission, ChangeSetElement['state']> = {
    pending: 'pending', admitted: 'applied', direct: 'applied', conflict: 'stale', refused: 'stale', out_of_scope: 'stale',
};

const ADMISSION_LABEL: Record<Admission, string> = {
    pending: 'awaiting review', admitted: 'admitted', direct: 'written directly', conflict: 'conflict', refused: 'refused',
    out_of_scope: 'out of scope',
};

/**
 * Theia's chat on the conversation the Theorem UI shows. Each conversation is
 * a chat session pinned to this agent, and each turn a request. What the
 * person sends here goes out through the Theorem UI, which streams the turn
 * back as it does for its own sends. Delegated changes make the turn's change
 * set; admission stays with the reviewer, so they offer no apply or revert.
 */
@injectable()
export class TheoremChatAgent implements ChatAgent, FrontendApplicationContribution {

    readonly id = THEOREM_AGENT_ID;
    readonly name = 'Theorem';
    readonly description = 'The conversation open in Theorem. What you send here goes to it.';
    readonly iconClass = 'codicon codicon-comment-discussion';
    readonly locations = [ChatAgentLocation.Panel];
    readonly variables: string[] = [];
    readonly prompts: PromptVariantSet[] = [];
    readonly languageModelRequirements: LanguageModelRequirement[] = [];
    readonly agentSpecificVariables: AgentSpecificVariables[] = [];
    readonly functions: string[] = [];

    // A factory: the chat service collects the agents, so it cannot be built before this one.
    @inject(ChatServiceFactory) protected readonly chatService: () => ChatService;
    @inject(TheoremIdeBridge) protected readonly bridge: TheoremIdeBridge;
    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(OpenerService) protected readonly openers: OpenerService;
    @inject(MessageService) protected readonly messages: MessageService;

    /** The session showing each conversation, by the Theorem UI's key for it. */
    protected readonly sessions = new Map<string, string>();
    /** Each session's thread; null while it is a new chat. */
    protected readonly threads = new Map<string, string | null>();
    /** A session Theia made from its New Chat button, waiting for the Theorem UI to open a new chat. */
    protected newChat: string | undefined;
    /** True while this agent changes the active session, so the change is not taken for the person's. */
    protected switching = false;
    /** The request sent from here whose turn has not finished. */
    protected sent: MutableChatRequestModel | undefined;
    /** The replies each request was last filled from. */
    protected readonly filled = new WeakMap<MutableChatRequestModel, readonly ChatMessage[]>();
    /** Requests whose turn still runs in Theorem; stopping one here stops the turn. */
    protected readonly live = new Set<MutableChatRequestModel>();
    /** One content per tool call, so its confirmation state outlives each refill. */
    protected readonly toolCalls = new Map<string, ToolCallChatResponseContentImpl>();
    protected readonly asked = new WeakSet<ToolCallChatResponseContentImpl>();
    /** Approvals decided in the Theorem UI, which this side only shows. */
    protected readonly settled = new WeakSet<ToolCallChatResponseContentImpl>();

    onStart(): void {
        this.chatService().onSessionEvent(event => {
            if (event.type === 'deleted') {
                this.forget(event.sessionId);
            } else if (event.type === 'activeChange' && event.sessionId && !this.switching) {
                this.shown(event.sessionId);
            }
        });
        this.bridge.onDidUpdateThread(thread => this.sync(thread));
    }

    async invoke(request: MutableChatRequestModel): Promise<void> {
        const { host, thread } = this.bridge;
        if (!host || !thread || this.sessions.get(thread.key) !== request.session.id) {
            request.response.error(new Error(host
                ? 'This is not the conversation open in Theorem. Open it there first.'
                : 'This IDE is not linked to Theorem.'));
            return;
        }
        this.sent = request;
        this.follow(request);
        try {
            await host.send(request.request.text);
        } catch (error) {
            this.live.delete(request);
            this.sent = undefined;
            request.response.error(error instanceof Error ? error : new Error(String(error)));
        }
    }

    protected sync(thread: ChatThread): void {
        const chats = this.chatService();
        let session = this.sessionFor(thread, chats);
        const turns = turnsOf(thread.messages);
        if (!this.follows(session.model as MutableChatModel, turns)) {
            session = this.rebuild(thread, session, chats);
        }
        const model = session.model as MutableChatModel;
        const requests = model.getRequests();
        turns.forEach((turn, index) => {
            const request = requests[index] ?? model.addRequest(parsedRequest(turn.text), this.id);
            const before = this.filled.get(request);
            if (before?.length !== turn.replies.length || turn.replies.some((reply, i) => reply !== before[i])) {
                this.filled.set(request, turn.replies);
                this.fill(request, turn.replies);
            }
        });
    }

    protected sessionFor(thread: ChatThread, chats: ChatService): ChatSession {
        const known = this.sessions.get(thread.key);
        let session = known === undefined ? undefined : chats.getSession(known);
        if (!session && this.newChat !== undefined && thread.threadId === null) {
            session = chats.getSession(this.newChat);
            this.newChat = undefined;
        }
        if (!session) {
            session = this.switch(() => chats.createSession(ChatAgentLocation.Panel, { focus: false }, this));
        }
        this.sessions.set(thread.key, session.id);
        this.threads.set(session.id, thread.threadId);
        // A title set before the first request also keeps Theia from naming the session itself.
        const title = thread.title || 'New chat';
        if (session.title !== title) {
            void chats.renameSession(session.id, title);
        }
        if (!session.isActive) {
            const { id } = session;
            this.switch(() => chats.setActiveSession(id, { focus: false }));
        }
        return session;
    }

    /** Whether the session's requests are the turns so far, with at most the one just sent after them. */
    protected follows(model: MutableChatModel, turns: Turn[]): boolean {
        return model.getRequests().every((request, index) =>
            index < turns.length ? request.request.text === turns[index].text : request === this.sent);
    }

    /** A branch changed under the session, so it starts again from the turns. */
    protected rebuild(thread: ChatThread, stale: ChatSession, chats: ChatService): ChatSession {
        this.sessions.delete(thread.key);
        const session = this.sessionFor(thread, chats);
        void chats.deleteSession(stale.id);
        return session;
    }

    protected fill(request: MutableChatRequestModel, replies: readonly ChatMessage[]): void {
        const delegations = new Map<string, Theorem.DelegationPart>();
        const contents = replies.flatMap(reply => reply.parts.flatMap(part => this.contentOf(part, delegations) ?? []));
        request.response.response.clearContent();
        request.response.response.addContents(contents);
        if (delegations.size) {
            const elements = [...delegations.values()].flatMap(delegation => this.changeElements(delegation));
            if (request.changeSet) {
                request.changeSet.setElements(...elements);
            } else {
                const changeSet = new ChangeSetImpl(elements);
                changeSet.setTitle('Delegated changes');
                request.changeSet = changeSet;
            }
        }
        if (replies.some(reply => reply.running) || (!replies.length && request === this.sent)) {
            this.follow(request);
            return;
        }
        this.live.delete(request);
        if (request === this.sent) {
            this.sent = undefined;
        }
        if (request.response.isComplete) {
            return;
        }
        const end = replies[replies.length - 1];
        if (end?.stopped) {
            request.response.cancel();
        } else if (end?.error) {
            request.response.error(new Error(end.error));
        } else {
            request.response.complete();
        }
    }

    protected follow(request: MutableChatRequestModel): void {
        if (this.live.has(request)) {
            return;
        }
        this.live.add(request);
        request.response.cancellationToken.onCancellationRequested(() => {
            if (this.live.delete(request)) {
                void this.bridge.host?.cancel();
            }
        });
    }

    protected contentOf(part: ChatPart, delegations: Map<string, Theorem.DelegationPart>): ChatResponseContent | undefined {
        switch (part.type) {
            case 'text':
                return part.text ? new MarkdownChatResponseContentImpl(part.text) : undefined;
            case 'reasoning':
                return part.text ? new ThinkingChatResponseContentImpl(part.text, '') : undefined;
            case 'tool-call':
                return this.toolCall(part);
        }
        switch (part.name) {
            case 'theorem-delegation': {
                const delegation = readDelegation(part.data);
                if (!delegation) {
                    return undefined;
                }
                delegations.set(delegation.delegationId, delegation);
                return new MarkdownChatResponseContentImpl(delegationText(delegation));
            }
            case 'theorem-review':
            case 'theorem-intent': {
                const text = part.name === 'theorem-review' ? reviewText(part.data) : intentText(part.data);
                return text ? new MarkdownChatResponseContentImpl(text) : undefined;
            }
            case 'theorem-artifact': {
                const artifact = readArtifact(part.data);
                return artifact && new CommandChatResponseContentImpl(undefined, {
                    label: `Open ${artifact.title}`,
                    callback: async () => this.bridge.host?.openArtifact(artifact.artifactId),
                });
            }
        }
        return undefined;
    }

    protected toolCall(part: Extract<ChatPart, { type: 'tool-call' }>): ToolCallChatResponseContentImpl {
        const result = part.result as ToolCallResult;
        let content = this.toolCalls.get(part.toolCallId);
        if (!content) {
            content = new ToolCallChatResponseContentImpl(part.toolCallId, part.toolName, part.argsText, result !== undefined, result);
            this.toolCalls.set(part.toolCallId, content);
        } else {
            content.merge(new ToolCallChatResponseContentImpl(
                part.toolCallId, part.toolName, part.argsText, content.finished || result !== undefined, result ?? content.result));
        }
        if (part.approval && !content.finished) {
            this.approve(content, part.approval);
        }
        return content;
    }

    /** Theia asks with its own Allow and Deny; a decision made in the Theorem UI settles the question here. */
    protected approve(content: ToolCallChatResponseContentImpl, approval: ChatApproval): void {
        if (approval.approved === undefined) {
            if (!this.asked.has(content)) {
                this.asked.add(content);
                content.requestUserConfirmation();
                content.confirmed.then(allow => {
                    if (!this.settled.has(content)) {
                        void this.decide(approval, allow);
                    }
                }, () => undefined);
            }
        } else if (!this.settled.has(content)) {
            this.settled.add(content);
            if (approval.approved) {
                content.confirm();
            } else {
                content.deny();
            }
        }
    }

    protected async decide(approval: ChatApproval, allow: boolean): Promise<void> {
        if (!await this.bridge.host?.decideApproval({ approval, allow })) {
            this.messages.error('The decision did not reach Theorem. Decide it in the conversation instead.');
        }
    }

    protected changeElements(delegation: Theorem.DelegationPart): ChangeSetElement[] {
        const { parentRunId: runId, delegationId, roleLabel } = delegation;
        return (delegation.receipt?.changes ?? []).filter(change => !change.binary).map(change => {
            const admission: Admission = change.admission.state;
            const slash = change.path.lastIndexOf('/');
            const lines = change.linesAdded === undefined && change.linesRemoved === undefined
                ? undefined
                : `+${change.linesAdded ?? 0} -${change.linesRemoved ?? 0}`;
            const detail = 'detail' in change.admission ? change.admission.detail : undefined;
            const inWorkspace = change.change !== 'add' || ADMISSION_STATE[admission] === 'applied';
            return {
                uri: delegationUri(runId, delegationId, change.change === 'delete' ? 'before' : 'after', change.path),
                name: change.path.slice(slash + 1),
                additionalInfo: [
                    slash > 0 ? change.path.slice(0, slash) : undefined,
                    roleLabel,
                    detail ? `${ADMISSION_LABEL[admission]}: ${detail}` : ADMISSION_LABEL[admission],
                    lines,
                ].filter(Boolean).join(' · '),
                state: ADMISSION_STATE[admission],
                type: change.change,
                openChange: async () => {
                    await this.bridge.openChanges({ runId, delegationId, path: change.path });
                },
                open: inWorkspace
                    ? async () => {
                        await open(this.openers, this.connection.toUri(change.path));
                    }
                    : undefined,
            };
        });
    }

    /** The person opened a session in Theia, so the Theorem UI shows its conversation. */
    protected shown(sessionId: string): void {
        const { host, thread } = this.bridge;
        const key = [...this.sessions].find(([, id]) => id === sessionId)?.[0];
        if (key !== undefined && key === thread?.key) {
            return;
        }
        const threadId = key === undefined ? null : this.threads.get(sessionId) ?? null;
        if (threadId !== null) {
            void host?.openThread(threadId);
            return;
        }
        // A new chat: one from Theia's New Chat button, or one never sent to.
        if (key !== undefined) {
            this.sessions.delete(key);
        }
        if (thread?.threadId === null) {
            const chats = this.chatService();
            const previous = this.sessions.get(thread.key);
            this.sessions.set(thread.key, sessionId);
            if (previous !== undefined && chats.getSession(previous)?.model.isEmpty()) {
                void chats.deleteSession(previous);
            }
            this.sync(thread);
        } else {
            this.newChat = sessionId;
            void host?.openThread(null);
        }
    }

    protected forget(sessionId: string): void {
        for (const [key, id] of this.sessions) {
            if (id === sessionId) {
                this.sessions.delete(key);
            }
        }
        this.threads.delete(sessionId);
        if (this.newChat === sessionId) {
            this.newChat = undefined;
        }
    }

    protected switch<T>(change: () => T): T {
        this.switching = true;
        try {
            return change();
        } finally {
            this.switching = false;
        }
    }
}
