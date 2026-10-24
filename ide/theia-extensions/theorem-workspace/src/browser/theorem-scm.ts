// SOURCING: @theia/scm ScmService, ScmProvider and ScmTreeWidget menus are the Source Control view;
// its ScmDecorationsService draws the dirty-diff gutter from the original text this file's
// resource resolver serves. @theia/core DecorationsService colours files in the tree and
// explorer, DiffUris and OpenerService open diffs, QuickInputService asks for branches, and
// @theoremharness/sdk WorkspaceScm runs git on the workspace host. Only the mapping from
// git's status letters to groups, letters and colours is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import debounce = require('@theia/core/shared/lodash.debounce');
import { FrontendApplicationContribution, OpenerService, open } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Decoration, DecorationsProvider, DecorationsService } from '@theia/core/lib/browser/decorations-service';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { codicon } from '@theia/core/lib/browser/widgets';
import {
    Command, CommandContribution, CommandRegistry, Emitter, ILogger, MenuContribution, MenuModelRegistry, MessageService, QuickInputService
} from '@theia/core/lib/common';
import { isOSX } from '@theia/core/lib/common/os';
import { Resource, ResourceError, ResourceResolver } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { ScmActionButton, ScmCommand, ScmProvider, ScmResource, ScmResourceGroup } from '@theia/scm/lib/browser/scm-provider';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmTreeWidget } from '@theia/scm/lib/browser/scm-tree-widget';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import type { ScmChange, ScmStatus, WorkspaceScm } from '@theoremharness/sdk';
import { TheoremConnection } from './theorem-connection';

/** The provider id, which is also the scheme of its revision URIs (`ScmRepository.toUriAtRef`). */
const PROVIDER_ID = 'theorem-scm';
/** Writes in the checkout settle for this long before status is read again. */
const REFRESH_DELAY_MS = 300;

export namespace TheoremScmCommands {
    const category = 'Git';
    export const REFRESH: Command = { id: 'theorem.scm.refresh', label: 'Refresh', category };
    export const COMMIT: Command = { id: 'theorem.scm.commit', label: 'Commit', category };
    export const STAGE: Command = { id: 'theorem.scm.stage', label: 'Stage Changes', category };
    export const UNSTAGE: Command = { id: 'theorem.scm.unstage', label: 'Unstage Changes', category };
    export const DISCARD: Command = { id: 'theorem.scm.discard', label: 'Discard Changes', category };
    export const STAGE_ALL: Command = { id: 'theorem.scm.stageAll', label: 'Stage All Changes', category };
    export const UNSTAGE_ALL: Command = { id: 'theorem.scm.unstageAll', label: 'Unstage All Changes', category };
    export const CREATE_BRANCH: Command = { id: 'theorem.scm.createBranch', label: 'Create Branch...', category };
    export const SWITCH_BRANCH: Command = { id: 'theorem.scm.switchBranch', label: 'Switch Branch...', category };
    export const FETCH: Command = { id: 'theorem.scm.fetch', label: 'Fetch', category };
    export const PUSH: Command = { id: 'theorem.scm.push', label: 'Push', category };
}

type GroupId = 'merge' | 'index' | 'workingTree';

/** What each status letter shows; `U` is untracked and `!` unmerged, as in VS Code's git. */
const LETTERS: Record<string, { tooltip: string; colorId: string; strikeThrough?: boolean }> = {
    M: { tooltip: 'Modified', colorId: 'gitDecoration.modifiedResourceForeground' },
    T: { tooltip: 'Type Changed', colorId: 'gitDecoration.modifiedResourceForeground' },
    A: { tooltip: 'Added', colorId: 'gitDecoration.addedResourceForeground' },
    C: { tooltip: 'Copied', colorId: 'gitDecoration.addedResourceForeground' },
    R: { tooltip: 'Renamed', colorId: 'gitDecoration.renamedResourceForeground' },
    D: { tooltip: 'Deleted', colorId: 'gitDecoration.deletedResourceForeground', strikeThrough: true },
    U: { tooltip: 'Untracked', colorId: 'gitDecoration.untrackedResourceForeground' },
    '!': { tooltip: 'Conflict', colorId: 'gitDecoration.conflictingResourceForeground' },
};

/** A changed path as one group shows it. */
interface TheoremScmResource extends ScmResource {
    readonly change: ScmChange;
    readonly letter: string;
}

class TheoremScmGroup implements ScmResourceGroup {
    resources: TheoremScmResource[] = [];
    constructor(readonly provider: ScmProvider, readonly id: GroupId, readonly label: string, readonly hideWhenEmpty: boolean) { }
    dispose(): void { }
}

/** The workspace checkout's git state, in the shape the Source Control view reads. */
class TheoremScmProvider implements ScmProvider {

    readonly id = PROVIDER_ID;
    readonly label = 'Git';
    readonly acceptInputCommand: ScmCommand = { title: 'Commit', command: TheoremScmCommands.COMMIT.id };
    readonly merge: TheoremScmGroup = new TheoremScmGroup(this, 'merge', 'Merge Changes', true);
    readonly index: TheoremScmGroup = new TheoremScmGroup(this, 'index', 'Staged Changes', true);
    readonly workingTree: TheoremScmGroup = new TheoremScmGroup(this, 'workingTree', 'Changes', false);
    readonly groups: TheoremScmGroup[] = [this.merge, this.index, this.workingTree];
    statusBarCommands: ScmCommand[] = [];
    actionButton: ScmActionButton | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected readonly onDidChangeStatusBarCommandsEmitter = new Emitter<ScmCommand[] | undefined>();
    readonly onDidChangeStatusBarCommands = this.onDidChangeStatusBarCommandsEmitter.event;
    protected readonly onDidChangeActionButtonEmitter = new Emitter<ScmActionButton | undefined>();
    readonly onDidChangeActionButton = this.onDidChangeActionButtonEmitter.event;
    protected readonly onDidChangeCommitTemplateEmitter = new Emitter<string>();
    readonly onDidChangeCommitTemplate = this.onDidChangeCommitTemplateEmitter.event;

    constructor(readonly rootUri: string) { }

    update(status: ScmStatus, toResource: (group: TheoremScmGroup, change: ScmChange, letter: string) => TheoremScmResource): void {
        const resources: Record<GroupId, TheoremScmResource[]> = { merge: [], index: [], workingTree: [] };
        for (const change of status.changes) {
            if (change.conflict) {
                resources.merge.push(toResource(this.merge, change, '!'));
                continue;
            }
            if (change.index !== ' ' && change.index !== '?') {
                resources.index.push(toResource(this.index, change, change.index));
            }
            if (change.worktree !== ' ') {
                resources.workingTree.push(toResource(this.workingTree, change, change.worktree === '?' ? 'U' : change.worktree));
            }
        }
        for (const group of this.groups) {
            group.resources = resources[group.id];
        }
        this.statusBarCommands = [{
            title: status.branch ? `$(git-branch) ${status.branch}` : `$(git-commit) ${status.head || 'No commits'}`,
            tooltip: 'Switch branch',
            command: TheoremScmCommands.SWITCH_BRANCH.id,
        }];
        this.actionButton = {
            command: { title: 'Commit', command: TheoremScmCommands.COMMIT.id },
            enabled: status.changes.length > 0,
        };
        this.onDidChangeEmitter.fire();
        this.onDidChangeStatusBarCommandsEmitter.fire(this.statusBarCommands);
        this.onDidChangeActionButtonEmitter.fire(this.actionButton);
    }

    /** How a path looks in file trees: unmerged over unstaged over staged. */
    decorations(): Map<string, TheoremScmResource> {
        const byUri = new Map<string, TheoremScmResource>();
        for (const group of [this.index, this.workingTree, this.merge]) {
            for (const resource of group.resources) {
                byUri.set(resource.sourceUri.toString(), resource);
            }
        }
        return byUri;
    }

    dispose(): void {
        this.onDidChangeEmitter.dispose();
        this.onDidChangeStatusBarCommandsEmitter.dispose();
        this.onDidChangeActionButtonEmitter.dispose();
        this.onDidChangeCommitTemplateEmitter.dispose();
    }
}

/**
 * A path's text in the index (`ref` empty, as Theia's dirty diff asks) or at a
 * revision. Open copies read again whenever the status does, since staging,
 * committing and switching branches all move what a ref holds.
 */
@injectable()
export class TheoremScmResourceResolver implements ResourceResolver {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    protected readonly onDidChangeContentsEmitter = new Emitter<void>();

    contentsChanged(): void {
        this.onDidChangeContentsEmitter.fire();
    }

    async resolve(uri: URI): Promise<Resource> {
        if (uri.scheme !== PROVIDER_ID) {
            throw new Error(`Not a ${PROVIDER_ID} URI: ${uri}`);
        }
        const { ref } = JSON.parse(uri.query) as { ref: string };
        const path = this.connection.toPath(uri.withScheme(this.connection.root.scheme).withoutQuery());
        if (!path) {
            throw new Error(`${uri.path} is outside the workspace`);
        }
        return {
            uri,
            readOnly: true,
            readContents: async () => {
                const shown = await (await this.connection.scm()).show(path, ref || 'index');
                if (!shown.exists) {
                    throw ResourceError.NotFound({ message: `${path} is not in ${ref || 'the index'}`, data: { uri } });
                }
                return shown.text;
            },
            onDidChangeContents: this.onDidChangeContentsEmitter.event,
            dispose: () => undefined,
        };
    }
}

/**
 * Source Control for the workspace's checkout. Status is read again after any
 * write in the checkout, any save, a live-stream resync and each of its own
 * operations; git itself runs on the workspace host.
 */
@injectable()
export class TheoremScmContribution implements FrontendApplicationContribution, CommandContribution, MenuContribution,
    TabBarToolbarContribution, ColorContribution, DecorationsProvider {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(OpenerService) protected readonly openers: OpenerService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(DecorationsService) protected readonly decorationsService: DecorationsService;
    @inject(TheoremScmResourceResolver) protected readonly revisions: TheoremScmResourceResolver;
    @inject(ILogger) protected readonly logger: ILogger;

    protected provider: TheoremScmProvider | undefined;
    protected repository: ScmRepository | undefined;
    protected decorated = new Map<string, TheoremScmResource>();
    protected readonly onDidChangeEmitter = new Emitter<URI[] | undefined>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected readonly scheduleRefresh = debounce(() => this.refresh(), REFRESH_DELAY_MS);

    onStart(): void {
        this.connection.ready.then(() => {
            const { live } = this.connection;
            live.on('file.changed', () => this.scheduleRefresh());
            live.on('document.saved', () => this.scheduleRefresh());
            live.onResync(() => this.refresh());
            return this.refresh();
        }, () => undefined);
    }

    /** Read status; the first answer registers the repository, so a workspace without git shows none. */
    protected async refresh(): Promise<void> {
        let status: ScmStatus;
        try {
            status = await (await this.connection.scm()).status();
        } catch (error) {
            this.logger.debug('Reading git status failed', error);
            return;
        }
        if (!this.provider) {
            this.provider = new TheoremScmProvider(this.connection.root.toString());
            this.repository = this.scmService.registerScmProvider(this.provider, {
                input: { placeholder: `Message (${isOSX ? '⌘' : 'Ctrl+'}Enter to commit)` },
            });
            this.decorationsService.registerDecorationsProvider(this);
        }
        this.provider.update(status, (group, change, letter) => this.toResource(group, change, letter));
        this.decorated = this.provider.decorations();
        this.onDidChangeEmitter.fire(undefined);
        this.revisions.contentsChanged();
    }

    provideDecorations(uri: URI): Decoration | undefined {
        const resource = this.decorated.get(uri.toString());
        if (!resource) {
            return undefined;
        }
        const { tooltip, colorId } = LETTERS[resource.letter] ?? LETTERS.M;
        return { letter: resource.letter, tooltip, colorId, bubble: true };
    }

    protected toResource(group: TheoremScmGroup, change: ScmChange, letter: string): TheoremScmResource {
        const sourceUri = this.connection.toUri(change.path);
        const { tooltip, strikeThrough } = LETTERS[letter] ?? LETTERS.M;
        return {
            group,
            change,
            letter,
            sourceUri,
            decorations: { letter, tooltip, strikeThrough },
            open: () => this.openChange(group.id, change, sourceUri),
        };
    }

    protected async openChange(group: GroupId, change: ScmChange, uri: URI): Promise<void> {
        await open(this.openers, this.changeTarget(group, change, uri));
    }

    /** Working-tree changes diff against the index, staged ones the index against HEAD. */
    protected changeTarget(group: GroupId, change: ScmChange, uri: URI): URI {
        const at = (ref: string, path = change.path) => this.repository!.toUriAtRef(this.connection.toUri(path), ref);
        const name = uri.path.base;
        if (group === 'merge') {
            return uri; // the file with its conflict markers
        }
        if (group === 'workingTree') {
            if (change.worktree === '?') {
                return uri;
            }
            return change.worktree === 'D' ? at('') : DiffUris.encode(at(''), uri, `${name} (Working Tree)`);
        }
        if (change.index === 'A' || change.index === 'C') {
            return at('');
        }
        if (change.index === 'D') {
            return at('HEAD');
        }
        return DiffUris.encode(at('HEAD', change.original_path ?? change.path), at(''), `${name} (Index)`);
    }

    registerCommands(registry: CommandRegistry): void {
        const paths = (resources: TheoremScmResource[]) => resources.map(resource => resource.change.path);
        const groupPaths = (group?: ScmResourceGroup) => paths((group?.resources ?? []) as TheoremScmResource[]);
        registry.registerCommand(TheoremScmCommands.REFRESH, { execute: () => this.refresh() });
        registry.registerCommand(TheoremScmCommands.COMMIT, { execute: () => this.commit() });
        registry.registerCommand(TheoremScmCommands.STAGE, {
            execute: (...resources: TheoremScmResource[]) => this.run('Stage', scm => scm.stage(paths(resources))),
        });
        registry.registerCommand(TheoremScmCommands.UNSTAGE, {
            execute: (...resources: TheoremScmResource[]) => this.run('Unstage', scm => scm.unstage(paths(resources))),
        });
        registry.registerCommand(TheoremScmCommands.DISCARD, {
            execute: (...resources: TheoremScmResource[]) => this.discard(paths(resources)),
        });
        registry.registerCommand(TheoremScmCommands.STAGE_ALL, {
            execute: (group?: ScmResourceGroup) =>
                this.run('Stage', scm => scm.stage(group ? groupPaths(group) : groupPaths(this.provider?.workingTree).concat(groupPaths(this.provider?.merge)))),
        });
        registry.registerCommand(TheoremScmCommands.UNSTAGE_ALL, {
            execute: (group?: ScmResourceGroup) => this.run('Unstage', scm => scm.unstage(groupPaths(group ?? this.provider?.index))),
        });
        registry.registerCommand(TheoremScmCommands.CREATE_BRANCH, { execute: () => this.createBranch() });
        registry.registerCommand(TheoremScmCommands.SWITCH_BRANCH, { execute: () => this.switchBranch() });
        registry.registerCommand(TheoremScmCommands.FETCH, { execute: () => this.run('Fetch', scm => scm.fetch()) });
        registry.registerCommand(TheoremScmCommands.PUSH, { execute: () => this.run('Push', scm => scm.push()) });
    }

    registerMenus(menus: MenuModelRegistry): void {
        const ours = `scmProvider == ${PROVIDER_ID}`;
        const inGroup = (...groups: GroupId[]) => `${ours} && (${groups.map(group => `scmResourceGroup == ${group}`).join(' || ')})`;
        const resource = (commandId: string, icon: string, when: string, order: string) => {
            menus.registerMenuAction(ScmTreeWidget.RESOURCE_INLINE_MENU, { commandId, icon: codicon(icon), when, order });
            menus.registerMenuAction(ScmTreeWidget.RESOURCE_CONTEXT_MENU, { commandId, when, order });
        };
        resource(TheoremScmCommands.DISCARD.id, 'discard', inGroup('workingTree'), '1');
        resource(TheoremScmCommands.STAGE.id, 'add', inGroup('workingTree', 'merge'), '2');
        resource(TheoremScmCommands.UNSTAGE.id, 'remove', inGroup('index'), '2');
        const group = (commandId: string, icon: string, when: string) => {
            menus.registerMenuAction(ScmTreeWidget.RESOURCE_GROUP_INLINE_MENU, { commandId, icon: codicon(icon), when });
            menus.registerMenuAction(ScmTreeWidget.RESOURCE_GROUP_CONTEXT_MENU, { commandId, when });
        };
        group(TheoremScmCommands.STAGE_ALL.id, 'add', inGroup('workingTree', 'merge'));
        group(TheoremScmCommands.UNSTAGE_ALL.id, 'remove', inGroup('index'));
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        const isVisible = (widget?: unknown) => widget instanceof ScmWidget && this.scmService.selectedRepository === this.repository;
        registry.registerItem({ id: TheoremScmCommands.COMMIT.id, command: TheoremScmCommands.COMMIT.id, tooltip: 'Commit', icon: codicon('check'), isVisible });
        registry.registerItem({ id: TheoremScmCommands.REFRESH.id, command: TheoremScmCommands.REFRESH.id, tooltip: 'Refresh', icon: codicon('refresh'), isVisible });
        for (const [command, order] of [
            [TheoremScmCommands.FETCH, '1'], [TheoremScmCommands.PUSH, '2'],
            [TheoremScmCommands.CREATE_BRANCH, '3'], [TheoremScmCommands.SWITCH_BRANCH, '4'],
        ] as const) {
            registry.registerItem({ id: command.id, command: command.id, text: command.label, group: 'theorem-scm', order, isVisible });
        }
    }

    /** VS Code's git decoration colours, which the Zed themes also set. */
    registerColors(colors: ColorRegistry): void {
        colors.register(
            { id: 'gitDecoration.addedResourceForeground', defaults: { light: '#587c0c', dark: '#81b88b', hcDark: '#a1e3ad', hcLight: '#374e06' }, description: 'Colour of added resources.' },
            { id: 'gitDecoration.modifiedResourceForeground', defaults: { light: '#895503', dark: '#E2C08D', hcDark: '#E2C08D', hcLight: '#895503' }, description: 'Colour of modified resources.' },
            { id: 'gitDecoration.deletedResourceForeground', defaults: { light: '#ad0707', dark: '#c74e39', hcDark: '#c74e39', hcLight: '#ad0707' }, description: 'Colour of deleted resources.' },
            { id: 'gitDecoration.renamedResourceForeground', defaults: { light: '#007100', dark: '#73C991', hcDark: '#73C991', hcLight: '#007100' }, description: 'Colour of renamed or copied resources.' },
            { id: 'gitDecoration.untrackedResourceForeground', defaults: { light: '#007100', dark: '#73C991', hcDark: '#73C991', hcLight: '#007100' }, description: 'Colour of untracked resources.' },
            { id: 'gitDecoration.conflictingResourceForeground', defaults: { light: '#ad0707', dark: '#e4676b', hcDark: '#c74e39', hcLight: '#ad0707' }, description: 'Colour of resources with conflicts.' },
        );
    }

    /** Run a git operation, show a failure, and read status again either way. */
    protected async run(title: string, operation: (scm: WorkspaceScm) => Promise<unknown>): Promise<boolean> {
        try {
            await operation(await this.connection.scm());
            return true;
        } catch (error) {
            this.messages.error(`Git: ${title} failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        } finally {
            await this.refresh();
        }
    }

    /** Commit what is staged; with nothing staged, offer to stage every change first, as VS Code does. */
    protected async commit(): Promise<void> {
        const { provider, repository } = this;
        if (!provider || !repository) {
            return;
        }
        const message = repository.input.value.trim();
        if (!message) {
            this.messages.warn('Write a commit message first.');
            repository.input.focus();
            return;
        }
        let stageFirst: string[] = [];
        if (provider.index.resources.length === 0) {
            stageFirst = [...provider.workingTree.resources, ...provider.merge.resources].map(resource => resource.change.path);
            if (stageFirst.length === 0) {
                this.messages.info('There are no changes to commit.');
                return;
            }
            const stageAll = 'Stage All and Commit';
            if (await this.messages.warn('There are no staged changes. Stage all your changes and commit them?', stageAll) !== stageAll) {
                return;
            }
        }
        const committed = await this.run('Commit', async scm => {
            if (stageFirst.length) {
                await scm.stage(stageFirst);
            }
            await scm.commit(message);
        });
        if (committed) {
            repository.input.value = '';
        }
    }

    /** Discard working-tree changes; the notification's Undo restores them from the host's record. */
    protected async discard(paths: string[]): Promise<void> {
        const restoreIds: string[] = [];
        const discarded = await this.run('Discard', async scm => {
            for (const path of paths) {
                restoreIds.push((await scm.discard(path)).restore_id);
            }
        });
        if (!discarded || restoreIds.length === 0) {
            return;
        }
        const undo = 'Undo';
        const what = paths.length === 1 ? new URI(paths[0]).path.base : `${paths.length} files`;
        if (await this.messages.info(`Discarded changes in ${what}.`, undo) === undo) {
            await this.run('Restore', async scm => {
                for (const id of restoreIds) {
                    await scm.restore(id);
                }
            });
        }
    }

    protected async createBranch(): Promise<void> {
        const name = await this.quickInput.input({
            prompt: 'Name of the new branch, switched to once created',
            validateInput: async value => /^\S+$/.test(value) ? undefined : 'A branch name has no spaces.',
        });
        if (name) {
            await this.run('Create Branch', scm => scm.branch(name, true));
        }
    }

    protected async switchBranch(): Promise<void> {
        let branches;
        try {
            branches = await (await this.connection.scm()).branches();
        } catch (error) {
            this.messages.error(`Git: Listing branches failed: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        const picked = await this.quickInput.showQuickPick(
            branches.filter(branch => !branch.current).map(branch => ({
                label: branch.name,
                description: branch.remote ? 'Remote branch' : branch.upstream ?? undefined,
                branch,
            })),
            { placeholder: 'Select a branch to switch to' },
        );
        if (picked) {
            // A remote branch's own name checks out a local branch tracking it.
            const name = picked.branch.remote ? picked.branch.name.slice(picked.branch.name.indexOf('/') + 1) : picked.branch.name;
            await this.run('Switch Branch', scm => scm.branch(name));
        }
    }
}
